/**
 * GUI Chat Protocol - Vue Types
 *
 * This module exports Vue-specific types for GUI chat plugins.
 * Use these types when building Vue-based plugin UI components.
 */

import {
  computed,
  inject,
  ref,
  type Component,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import type { ToolPluginCore, InputHandler } from "./index";

// Re-export all core types
export * from "./index";

// ============================================================================
// Browser-side plugin runtime
// ============================================================================

/**
 * Default shape for `BrowserPluginRuntime['endpoints']` when the
 * caller doesn't pin a specific plugin's endpoint type. Values are
 * `unknown` because hosts populate the map with plugin-specific
 * shapes (e.g. mulmoclaude provides `{ method, url }` records); each
 * plugin pins the precise shape via the `E` type parameter on
 * `useRuntime<E>()` below.
 */
export type DefaultPluginEndpoints = Readonly<Record<string, unknown>>;

/**
 * Reader for `pubsub.subscribe`. Mirrors `PluginFetchJsonOptions` on the
 * server side, so both seams narrow untrusted input the same way.
 */
export interface SubscribeOptions<T> {
  /**
   * Narrow a raw channel frame. Return `null` to **drop** it — the
   * handler is not called and the subscription stays alive.
   *
   * A `parse` that *throws* is also a drop: the host must catch it, skip
   * the frame, and keep delivering. This is not decoration — the
   * documented idiom for `dispatch` and `fetchJson` is
   * `parse: (raw) => MySchema.parse(raw)`, and Zod's `parse` throws, so
   * a plugin author copying that idiom here would otherwise take down a
   * shared channel on one malformed frame. Returning `null` is still
   * preferred (`safeParse(raw).data ?? null`) because it does not pay
   * for an exception per bad frame.
   */
  parse: (raw: unknown) => T | null;
}

/**
 * Runtime exposed to a plugin's Vue components via `useRuntime()`. The
 * host wraps a plugin's component subtree in a scope provider that
 * `provide`s a per-plugin instance to `PLUGIN_RUNTIME_KEY`.
 *
 * Optional type parameter `E` pins the `endpoints` map's shape so a
 * plugin author can write `useRuntime<TodoEndpoints>()` and read
 * `runtime.endpoints.list.url` without an `as` cast (0.3.2). Defaults
 * to `DefaultPluginEndpoints` for backward compatibility — non-generic
 * usage (`BrowserPluginRuntime` / `useRuntime()`) keeps working
 * unchanged.
 *
 * Spec: https://github.com/receptron/mulmoclaude/issues/1110
 */
export interface BrowserPluginRuntime<E = DefaultPluginEndpoints> {
  /**
   * Scoped pub/sub client. `subscribe("foo", handler)` is internally
   * routed to channel `plugin:<pkg>:foo`. Returns an unsubscribe
   * function.
   *
   * Without `parse` the payload is `unknown` — a channel frame is
   * whatever the publisher put on the wire, so a plugin that names the
   * payload type without checking it is asking the host to assert a
   * shape nobody verified. Same rule as `fetchJson`.
   *
   * `parse` returns `T | null` rather than throwing: a subscription is
   * a stream, so a frame that doesn't match is **dropped** and the
   * handler is not called. A payload that is legitimately `null` has to
   * be wrapped (`{ value: null }`) to be distinguishable from a reject.
   *
   * ```ts
   * subscribe("changed", { parse: (raw) => Bookmarks.safeParse(raw).data ?? null }, (bookmarks) => {
   *   list.value = bookmarks; // ← typed, no cast
   * });
   * ```
   *
   * The reader travels in an object (like `fetchJson`'s `opts.parse`)
   * rather than as a bare argument. A bare one would make the
   * handler-less mistake compile: any unary function satisfies
   * `(payload: unknown) => void`, since a `void` return type accepts
   * any return value — so `subscribe(name, parse)` would silently
   * register the validator AS the handler and discard every frame.
   * `{ parse }` is not a function, so that call is a type error.
   */
  pubsub: {
    subscribe(
      eventName: string,
      handler: (payload: unknown) => void,
    ): () => void;
    /** Validated form — the handler receives `opts.parse`'s return type. */
    subscribe<T>(
      eventName: string,
      opts: SubscribeOptions<T>,
      handler: (payload: T) => void,
    ): () => void;
  };

  /**
   * Reactive locale ref. When the host implements a locale picker, the
   * plugin's UI re-renders automatically.
   */
  locale: Ref<string>;

  /** Same shape as the server-side logger. */
  log: {
    debug(msg: string, data?: object): void;
    info(msg: string, data?: object): void;
    warn(msg: string, data?: object): void;
    error(msg: string, data?: object): void;
  };

  /**
   * Open `url` in a new tab with `noopener,noreferrer`. Use instead of
   * `<a target="_blank">` so the security flags can't be forgotten at
   * call sites.
   */
  openUrl(url: string): void;

  /**
   * POST `args` to this plugin's server-side dispatch route
   * (`/api/plugins/runtime/<pkg>/dispatch`) and return the parsed
   * JSON response. The host attaches the bearer token + builds the
   * URL automatically; the plugin author doesn't need to know either.
   * Throws on network error or non-2xx response.
   *
   * Without `parse` the result is `unknown` — the host receives
   * un-validated JSON, so naming the return type without checking it
   * would make the host assert a shape nobody verified. Same rule as
   * `fetchJson`; idiomatic with Zod:
   *
   * ```ts
   * const list = await dispatch({ kind: "list" }, (raw) => Bookmarks.parse(raw));
   * ```
   */
  dispatch(args: object): Promise<unknown>;
  /** Validated form — the promise resolves to `parse`'s return type. */
  dispatch<T>(args: object, parse: (raw: unknown) => T): Promise<T>;

  /**
   * Optional URL map for plugins that need more than the single
   * `dispatch` endpoint — typically REST-shaped plugins with
   * multiple sub-resources (`items`, `items/:id`, `columns`, …)
   * where folding everything through `dispatch(args)` would force a
   * server-side rewrite to a single action-discriminated POST.
   *
   * The host populates the map at provide time; the value shape is
   * host-defined (mulmoclaude provides `{ method, url }` records).
   * Single-dispatch plugins (the common runtime-loaded shape) leave
   * it `undefined` and rely on `dispatch` alone.
   *
   * Pin the shape via `useRuntime<E>()`'s type parameter:
   *
   * ```ts
   * interface TodoEndpoints { list: { method: "GET"; url: string } }
   * const runtime = useRuntime<TodoEndpoints>();
   * runtime.endpoints?.list.url; // ← typed, no cast
   * ```
   *
   * Defaults to `DefaultPluginEndpoints` (Readonly<Record<string,
   * unknown>>) when called without a type parameter.
   */
  endpoints?: E;
}

/**
 * Vue injection key for `BrowserPluginRuntime`. The host's runtime
 * plugin loader provides a per-plugin instance here; `useRuntime()`
 * inside a plugin component picks it up.
 */
export const PLUGIN_RUNTIME_KEY: InjectionKey<BrowserPluginRuntime> = Symbol(
  "guiChatPluginRuntime",
);

/**
 * Composable that returns the plugin's `BrowserPluginRuntime`. Throws
 * a descriptive error if called outside the host's scope provider so
 * misuse fails loudly during development.
 *
 * Pass a plugin-specific endpoints type as the optional `E` type
 * parameter to drop the cast on `runtime.endpoints`:
 *
 * ```ts
 * const runtime = useRuntime<TodoEndpoints>();
 * runtime.endpoints?.list.url;  // ← typed, no `as`
 * ```
 *
 * Without the type parameter, `endpoints` falls back to
 * `DefaultPluginEndpoints` (Readonly<Record<string, unknown>>).
 */
export function useRuntime<
  E = DefaultPluginEndpoints,
>(): BrowserPluginRuntime<E> {
  const runtime = inject(PLUGIN_RUNTIME_KEY);
  if (!runtime) {
    throw new Error(
      "useRuntime() called outside of <PluginScopedRoot> — the host must provide PLUGIN_RUNTIME_KEY",
    );
  }
  return runtime as BrowserPluginRuntime<E>;
}

// ============================================================================
// Plugin-local i18n
// ============================================================================

/**
 * Pick the message table for `locale`, falling back to `en`.
 *
 * Uses `Object.hasOwn` rather than `locale in messages`: `in` walks the
 * prototype chain, so a locale of `"toString"` or `"constructor"` would
 * "match" and hand back an inherited value instead of a message table.
 */
export function pickMessages<
  M extends Record<string, unknown> & { en: unknown },
>(messages: M, locale: string): M[keyof M] {
  return (
    Object.hasOwn(messages, locale) ? messages[locale as keyof M] : messages.en
  ) as M[keyof M];
}

/**
 * Build a plugin's `useT()` from its own message tables.
 *
 * Plugin-local i18n: the tables travel with the plugin bundle and are never
 * merged into the host's i18n instance. The plugin reads the host's locale off
 * the runtime and looks up its own table reactively.
 *
 * ```ts
 * import en from "./en";
 * import ja from "./ja";
 * export const useT = createUseT({ en, ja });
 * ```
 *
 * Degrades instead of throwing: with no host runtime provided it falls back to
 * a static `"en"` locale, so a plugin's components still render standalone (in
 * a storybook, a unit test, or a page mounted outside the host's plugin scope).
 * `useRuntime()` throws in that situation by design — it is the accessor for
 * code that genuinely requires the host. Translation lookup does not.
 *
 * A plugin that needs real vue-i18n features (plural forms, linked messages)
 * should spin up its own `createI18n()` instead.
 */
export function createUseT<M extends Record<string, unknown> & { en: unknown }>(
  messages: M,
): () => ComputedRef<M[keyof M]> {
  return function useT(): ComputedRef<M[keyof M]> {
    const runtime = inject(PLUGIN_RUNTIME_KEY, undefined);
    const locale: Ref<string> = runtime?.locale ?? ref("en");
    return computed(() => pickMessages(messages, locale.value));
  };
}

// ============================================================================
// Vue-specific Types
// ============================================================================

/**
 * Legacy Vue component-based config
 * @deprecated Use PluginConfigSchema instead
 */
export interface ToolPluginConfig {
  key: string;
  defaultValue: unknown;
  component: Component;
}

/**
 * Vue plugin interface - extends core with Vue components
 *
 * @typeParam T - Tool-specific data type (for views)
 * @typeParam J - JSON data type (passed to LLM)
 * @typeParam A - Arguments type for execute function
 * @typeParam H - Input handler type (allows custom handlers)
 * @typeParam S - Start response type (app-specific server response)
 */
export interface ToolPlugin<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
  S = Record<string, unknown>,
> extends ToolPluginCore<T, J, A, H, S> {
  viewComponent?: Component;
  previewComponent?: Component;
  /**
   * Legacy Vue component-based config (for backward compatibility)
   * @deprecated Use configSchema (PluginConfigSchema) instead
   */
  config?: ToolPluginConfig;
}

/**
 * Alias for ToolPlugin (Vue-specific)
 */
export type ToolPluginVue<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
  S = Record<string, unknown>,
> = ToolPlugin<T, J, A, H, S>;
