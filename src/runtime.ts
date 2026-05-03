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
   * Optional Zod-agnostic validator. Pass a function that returns the
   * narrowed value (or throws). Idiomatic with Zod:
   * `parse: (raw) => MySchema.parse(raw)`.
   */
  parse?: (raw: unknown) => T;
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

  /** `fetch` + `response.json()` + optional Zod-agnostic validator. */
  fetchJson<T>(url: string, opts?: PluginFetchJsonOptions<T>): Promise<T>;

  /** Publish a notification through the host's notifications channel. */
  notify(msg: PluginNotifyMessage): void;
}

// ============================================================================
// Plugin factory
// ============================================================================

/**
 * What a plugin's `setup` function returns. `TOOL_DEFINITION` is required;
 * the handler is exported under the same key as `TOOL_DEFINITION.name`
 * (the convention the runtime loader resolves at call time).
 */
export interface PluginFactoryResult {
  TOOL_DEFINITION: ToolDefinition;
  // Handler under TOOL_DEFINITION.name is required; other keys may be
  // exported but the loader only invokes the named one.
  [exportName: string]: unknown;
}

/**
 * Identity function for type inference. Same philosophy as
 * `defineComponent` in Vue: it does nothing at runtime, just lets
 * TypeScript thread the runtime/result types so the plugin author
 * gets full IntelliSense on `runtime.X` without manual annotations.
 *
 * @example
 * ```ts
 * export default definePlugin(({ pubsub, files, locale }) => ({
 *   TOOL_DEFINITION: { name: "myTool", description: "...", parameters: { ... } },
 *   async myTool(args) {
 *     await files.data.write("state.json", JSON.stringify(args));
 *     pubsub.publish("changed", {});
 *     return { ok: true };
 *   },
 * }));
 * ```
 */
export function definePlugin<T extends PluginFactoryResult>(
  setup: (runtime: PluginRuntime) => T,
): (runtime: PluginRuntime) => T {
  return setup;
}

/** Type guard the runtime loader uses to detect factory-shape vs. legacy
 *  raw-export plugins. Exported so other host code can share the test. */
export function isPluginFactory(value: unknown): value is (runtime: PluginRuntime) => PluginFactoryResult {
  return typeof value === "function";
}
