/**
 * Plugin runtime — the platform-provided helpers a plugin author receives
 * via the `definePlugin` factory. Framework-agnostic core; Vue-specific
 * `BrowserPluginRuntime` lives in `./vue.ts`.
 *
 * Spec: https://github.com/receptron/mulmoclaude/issues/1110
 */

import type { ToolDefinition } from "./types";

// ============================================================================
// File I/O — scoped to plugin's data or config root
// ============================================================================

/**
 * File operations scoped to a single root directory (data or config).
 * All `rel` arguments are POSIX-relative paths. The platform normalises
 * input (`\` → `/`, `path.posix.normalize`, `ensureInsideBase`) before
 * touching disk, so misuse of `node:path` on Windows still works and
 * `"../../etc/passwd"` is rejected.
 *
 * Plugin authors should never need `node:fs` or `node:path`.
 */
export interface FileOps {
  /** Read UTF-8 string. Throws if the file does not exist. */
  read(rel: string): Promise<string>;
  /** Read raw bytes. */
  readBytes(rel: string): Promise<Uint8Array>;
  /** Write atomically. Creates parent directories as needed. */
  write(rel: string, content: string | Uint8Array): Promise<void>;
  /** List basenames in `rel`. */
  readDir(rel: string): Promise<string[]>;
  /** mtime (ms since epoch) and byte size. */
  stat(rel: string): Promise<{ mtimeMs: number; size: number }>;
  /** Existence check (saves try/catch boilerplate). */
  exists(rel: string): Promise<boolean>;
  /** Delete a file. No-op if it does not exist. */
  unlink(rel: string): Promise<void>;
}

// ============================================================================
// Server-side runtime
// ============================================================================

/**
 * Subset of `RequestInit` the runtime forwards to the underlying fetch.
 * Re-declared here so we don't need a `lib.dom` dependency in the core
 * type declaration.
 */
export interface PluginFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

export interface PluginFetchOptions extends PluginFetchInit {
  /** AbortController timeout. Default 10 000 ms. */
  timeoutMs?: number;
  /** When set, requests to a `URL.hostname` not in the list throw. */
  allowedHosts?: readonly string[];
}

export interface PluginFetchJsonOptions<T> extends PluginFetchOptions {
  /**
   * Zod-agnostic validator. Pass a function that returns the narrowed
   * value (or throws). Idiomatic with Zod:
   *   `parse: (raw) => MySchema.parse(raw)`.
   *
   * Required when calling `fetchJson<T>` for any T other than
   * `unknown` — the overload signatures below enforce this so callers
   * never get a strongly-typed value out of unvalidated JSON.
   */
  parse: (raw: unknown) => T;
}

/**
 * Default shape for `PluginRuntime['endpoints']` — see
 * `BrowserPluginRuntime['endpoints']` for the same rationale on the
 * Vue side. Plugin authors pin a tighter shape via the `E` type
 * parameter on `PluginRuntime<E>` / `definePlugin<…, E>`.
 */
export type DefaultServerPluginEndpoints = Readonly<Record<string, unknown>>;

/**
 * Runtime handed to a plugin's `definePlugin(setup)` factory at load time.
 * The plugin closes over the destructured fields; handlers reference them
 * as bare API calls (no `context.` indirection).
 *
 * `pubsub` / `files.*` / `log` are scoped per plugin. The plugin cannot
 * spell another plugin's channel or file path through the API.
 *
 * Optional `E` type parameter pins the `endpoints` map's shape. Defaults
 * to `DefaultServerPluginEndpoints` for backward compatibility — non-
 * generic usage (`PluginRuntime`) keeps working unchanged (0.3.2).
 */
export interface PluginRuntime<E = DefaultServerPluginEndpoints> {
  /**
   * Scoped pub/sub publisher. `publish("foo", payload)` is internally
   * routed to channel `plugin:<pkg>:foo`. The plugin cannot publish to
   * another plugin's namespace.
   */
  pubsub: {
    publish<T>(eventName: string, payload: T): void;
  };

  /**
   * Locale tag the host detected at startup (`"en"`, `"ja"`, …). The
   * server side is a snapshot; for reactive updates use the frontend
   * `BrowserPluginRuntime.locale: Ref<string>` instead.
   */
  locale: string;

  /**
   * Scoped file I/O.
   *   - `data`:   `~/mulmoclaude/data/plugins/<pkg>/`   — backup target
   *   - `config`: `~/mulmoclaude/config/plugins/<pkg>/` — per-machine UI state
   */
  files: {
    data: FileOps;
    config: FileOps;
  };

  /**
   * Logger bridge to the host's logger. Prefix `plugin/<pkg>` is added
   * automatically. Use this instead of `console.*` so plugin output
   * lands in the central log files.
   */
  log: {
    debug(msg: string, data?: object): void;
    info(msg: string, data?: object): void;
    warn(msg: string, data?: object): void;
    error(msg: string, data?: object): void;
  };

  /**
   * `fetch` wrapper with timeout and (optional) host allowlist. Use
   * instead of `globalThis.fetch` so timeouts and allowlists are
   * applied uniformly across all plugins.
   */
  fetch(url: string, opts?: PluginFetchOptions): Promise<Response>;

  /**
   * `fetch` + `response.json()` + optional validator.
   *
   * - Without `opts.parse`, the result type is `unknown` — callers
   *   must narrow before use. This prevents strongly-typed access to
   *   un-validated remote JSON, which is a frequent type-soundness
   *   bug ("the server promised X, then it didn't").
   * - With `opts.parse`, the validator's return type narrows the
   *   promise. Idiomatic with Zod:
   *   `await fetchJson(url, { parse: (raw) => MySchema.parse(raw) })`.
   */
  fetchJson(url: string, opts?: PluginFetchOptions): Promise<unknown>;
  fetchJson<T>(url: string, opts: PluginFetchJsonOptions<T>): Promise<T>;

  /**
   * Optional URL map mirroring `BrowserPluginRuntime.endpoints` —
   * see that field for the rationale. Server-side plugin handlers
   * rarely need this (they typically service the dispatch endpoint
   * directly), but the field is defined symmetrically so a
   * cross-cutting plugin (e.g. one that calls into another plugin's
   * URL via `runtime.fetch`) doesn't have to import the host's
   * config.
   *
   * Single-dispatch plugins (the common runtime-loaded shape) leave
   * this `undefined`.
   */
  endpoints?: E;
}

// ============================================================================
// Plugin factory
// ============================================================================

/**
 * What a plugin's `setup` function returns at the **loose** level —
 * just `TOOL_DEFINITION`. Whether a matching named handler is
 * type-required is decided by the wrapper type `StrictPluginResult`
 * (used by `definePlugin` below) rather than by this base shape, so
 * the runtime loader's `isPluginFactory` predicate can keep using
 * the loose form when it doesn't yet know the tool name.
 *
 * Codex review #10 caught two iterations of looser-than-intended
 * checks here; the final form below uses an inference helper so the
 * strict requirement actually fires at the `definePlugin` call site.
 */
export interface PluginFactoryResult {
  TOOL_DEFINITION: ToolDefinition;
  [exportName: string]: unknown;
}

/**
 * Compile-time strict shape used to constrain `definePlugin`'s setup
 * return type. Extracts the `name` literal out of `T.TOOL_DEFINITION`
 * and demands a handler key matching it. When `name` widens to
 * `string` (no `as const`), the strict check degrades to the loose
 * `PluginFactoryResult` and the runtime loader's load-time warn is
 * the safety net.
 */
export type StrictPluginResult<T> = T extends { TOOL_DEFINITION: { name: infer N extends string } }
  ? string extends N
    ? PluginFactoryResult
    : T & { [K in N]: (args: unknown) => unknown | Promise<unknown> }
  : never;
// `(args: unknown)` not `(args: never)`: the parameter type is the
// **contextual** type a plugin author sees when writing
// `async myTool(args) { ... }` without an explicit annotation. With
// `never` the plugin's `args` would infer as `never` and any access
// would fail TS7006 / TS2339; with `unknown` it infers as `unknown`
// (matching the dispatch route's actual contract — the plugin
// validates args itself, typically via Zod). Function parameter
// contravariance still lets the constraint accept any concrete
// `(args: T) => ...` shape from the author. Codex review #10 iter-3
// caught the `never` regression.

/**
 * Identity function for type inference. Same philosophy as
 * `defineComponent` in Vue: it does nothing at runtime, just lets
 * TypeScript thread the runtime/result types so the plugin author
 * gets full IntelliSense on `runtime.X` without manual annotations.
 *
 * Generic placement (T inferred from setup's return) lets
 * `StrictPluginResult<T>` extract `TOOL_DEFINITION.name` and require
 * a matching named handler — Codex review #10 iter-2 caught that an
 * earlier `<N extends string, T extends PluginFactoryResult<N>>`
 * shape would not actually narrow `N` at the call site.
 *
 * Plugin authors should declare `name` as a literal (`as const`) so
 * the strict handler check fires:
 *
 *   TOOL_DEFINITION: { type: "function" as const, name: "myTool" as const, ... }
 *
 * Without `as const`, `N` widens to `string` and the strict check
 * gracefully degrades to the loose runtime warn (see
 * `StrictPluginResult` above).
 *
 * **Annotate the handler parameter explicitly** as `args: unknown`.
 * TypeScript can't propagate the contextual type into the method
 * parameter when it's still inferring `T` from the same return value
 * (circular), so leaving `args` un-annotated trips `noImplicitAny`.
 * Always:
 *
 *   async myTool(args: unknown) { ... }
 *
 * @example
 * ```ts
 * export default definePlugin(({ pubsub, files, locale }) => ({
 *   TOOL_DEFINITION: {
 *     type: "function" as const,
 *     name: "myTool" as const,
 *     description: "...",
 *     parameters: { type: "object", properties: {}, required: [] },
 *   },
 *   async myTool(args: unknown) {
 *     // narrow `args` here — typically with Zod
 *     await files.data.write("state.json", JSON.stringify(args));
 *     pubsub.publish("changed", {});
 *     return { ok: true };
 *   },
 * }));
 * ```
 */
export function definePlugin<T extends PluginFactoryResult>(
  setup: (runtime: PluginRuntime) => T & StrictPluginResult<T>,
): (runtime: PluginRuntime) => T {
  return setup;
}

/** Type guard the runtime loader uses to detect factory-shape vs. legacy
 *  raw-export plugins. Exported so other host code can share the test.
 *  Loosened to the widened `PluginFactoryResult<string>` because the
 *  caller (the runtime loader) doesn't know the plugin's tool name at
 *  this point — it pulls `TOOL_DEFINITION` from the factory's return
 *  value to discover it. The strict, name-narrowed form is enforced at
 *  the `definePlugin` call site instead. */
export function isPluginFactory(value: unknown): value is (runtime: PluginRuntime) => PluginFactoryResult {
  return typeof value === "function";
}
