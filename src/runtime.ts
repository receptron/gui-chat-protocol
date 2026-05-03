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

export interface PluginNotifyMessage {
  title: string;
  body?: string;
  level?: "info" | "warn" | "error";
}

/**
 * Runtime handed to a plugin's `definePlugin(setup)` factory at load time.
 * The plugin closes over the destructured fields; handlers reference them
 * as bare API calls (no `context.` indirection).
 *
 * `pubsub` / `files.*` / `log` are scoped per plugin. The plugin cannot
 * spell another plugin's channel or file path through the API.
 */
export interface PluginRuntime {
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

  /** Publish a notification through the host's notifications channel. */
  notify(msg: PluginNotifyMessage): void;
}

// ============================================================================
// Plugin factory
// ============================================================================

/**
 * What a plugin's `setup` function returns. `TOOL_DEFINITION` is required;
 * a handler must be exported under the same key as `TOOL_DEFINITION.name`
 * (the convention the runtime loader resolves at call time).
 *
 * The conditional `string extends N` branch handles two cases:
 *   - **Strict** (preferred): `TOOL_DEFINITION.name` is a string literal
 *     (e.g. via `name: "myTool" as const`). `N` infers as the literal,
 *     `string extends N` is false, and the mapped-type member
 *     `{ [K in N]: handler }` makes the handler type-required at the
 *     `definePlugin` call site. Forgetting to export a function under
 *     the matching name becomes a TypeScript error.
 *   - **Loose**: `TOOL_DEFINITION.name` widens to `string` (no `as
 *     const` on the name). `string extends N` is true, the mapped
 *     member would otherwise demand every string key be a function,
 *     so we fall back to the looser `[exportName: string]: unknown`
 *     shape. The runtime loader's existing handler-presence warn at
 *     load time is the safety net here.
 *
 * Codex review #10 (item 1) caught the original always-loose shape;
 * this conditional restores type safety for the strict path without
 * breaking authors who haven't adopted `as const` yet.
 */
export type PluginFactoryResult<N extends string = string> = {
  TOOL_DEFINITION: ToolDefinition & { name: N };
} & (string extends N
  ? { [exportName: string]: unknown }
  : { [K in N]: (args: never) => unknown | Promise<unknown> });

/**
 * Identity function for type inference. Same philosophy as
 * `defineComponent` in Vue: it does nothing at runtime, just lets
 * TypeScript thread the runtime/result types so the plugin author
 * gets full IntelliSense on `runtime.X` without manual annotations.
 *
 * The `N` generic is inferred from `TOOL_DEFINITION.name`. To make
 * this work the plugin author should declare the name as a
 * literal, typically by `as const`:
 *
 *   TOOL_DEFINITION: { type: "function" as const, name: "myTool", ... }
 *
 * Without `as const` the inferred name widens to `string`, which still
 * type-checks but loses the handler-key requirement (the mapped-type
 * member becomes `[K in string]` which is satisfied by any plain
 * record). The runtime loader still warns at load time, so this is a
 * graceful degradation — but plugin authors should prefer the
 * literal-narrowing form for the strict check.
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
 *   async myTool(args) {
 *     await files.data.write("state.json", JSON.stringify(args));
 *     pubsub.publish("changed", {});
 *     return { ok: true };
 *   },
 * }));
 * ```
 */
export function definePlugin<N extends string, T extends PluginFactoryResult<N>>(
  setup: (runtime: PluginRuntime) => T,
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
