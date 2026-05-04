/**
 * GUI Chat Protocol - Vue Types
 *
 * This module exports Vue-specific types for GUI chat plugins.
 * Use these types when building Vue-based plugin UI components.
 */

import { inject, type Component, type InjectionKey, type Ref } from "vue";
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
   */
  pubsub: {
    subscribe<T>(eventName: string, handler: (payload: T) => void): () => void;
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
   */
  dispatch<T = unknown>(args: object): Promise<T>;

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
export const PLUGIN_RUNTIME_KEY: InjectionKey<BrowserPluginRuntime> = Symbol("guiChatPluginRuntime");

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
export function useRuntime<E = DefaultPluginEndpoints>(): BrowserPluginRuntime<E> {
  const runtime = inject(PLUGIN_RUNTIME_KEY);
  if (!runtime) {
    throw new Error(
      "useRuntime() called outside of <PluginScopedRoot> — the host must provide PLUGIN_RUNTIME_KEY",
    );
  }
  return runtime as BrowserPluginRuntime<E>;
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
