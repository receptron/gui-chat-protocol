# Plugin Runtime API (v0.3+)

This document describes the **factory-shape plugin contract** introduced in `gui-chat-protocol@0.3.0`. It supplements [`GUI_CHAT_PROTOCOL.md`](./GUI_CHAT_PROTOCOL.md) (which covers the wire-level tool-calling protocol) and [`CREATING_A_PLUGIN.md`](./CREATING_A_PLUGIN.md) (which covers the legacy `(context, args)` plugin shape).

The factory shape is **opt-in**. Existing plugins built against the legacy shape continue to work without changes — the host's runtime loader detects which shape a plugin uses and dispatches accordingly.

## Contract

A factory-shape plugin's `dist/index.js` exports a default factory:

```ts
import { definePlugin } from "gui-chat-protocol";

export default definePlugin((runtime) => {
  // setup runs once at plugin load, with the per-plugin runtime
  return {
    TOOL_DEFINITION: {
      type: "function" as const,
      name: "myTool" as const,    // `as const` enables the strict handler-key check
      description: "…",
      parameters: { /* … */ },
    },
    async myTool(args: unknown) { /* … */ },   // explicit `: unknown` — see note below
  };
});
```

> **Two annotation requirements** for the strict-mode handler check
> (`StrictPluginResult<T>`) to fire:
>
> 1. `TOOL_DEFINITION.name` must be a string **literal**, typically via
>    `name: "myTool" as const`. Without `as const`, `name` widens to
>    `string` and the check degrades to the loose runtime warn.
> 2. The handler parameter must be **explicitly annotated** as
>    `args: unknown`. TypeScript can't propagate contextual types into
>    a method parameter while the surrounding generic is being
>    inferred from the same return value (circular inference), so a
>    bare `async myTool(args) { ... }` trips `noImplicitAny`. The
>    handler validates `args` itself, typically via Zod.

The factory:

1. Receives a [`PluginRuntime`](#pluginruntime) constructed by the host, scoped to this plugin.
2. Returns an object containing:
   - `TOOL_DEFINITION`: the same OpenAI-shaped tool schema legacy plugins export.
   - A handler exported under `TOOL_DEFINITION.name` (the host invokes it via `(args) =>`).
3. Runs **once** at plugin load. Side effects are not allowed at setup time — only inside handlers.

The handler signature is `(args: unknown) => unknown | Promise<unknown>`. The host validates `args` came from an LLM tool call but does not validate the shape; the plugin must do that (Zod / hand-rolled).

## `PluginRuntime` (server side)

```ts
interface PluginRuntime {
  pubsub:    { publish<T>(eventName: string, payload: T): void };
  locale:    string;                                      // host-detected locale snapshot
  files:     { data: FileOps; config: FileOps };          // scoped to plugin's own dir
  log:       { debug; info; warn; error };                // (msg, data?) → void
  fetch:     (url, opts?: PluginFetchOptions) => Promise<Response>;
  fetchJson: <T>(url, opts: PluginFetchJsonOptions<T>) => Promise<T>;
  fetchJson: (url, opts?: PluginFetchOptions) => Promise<unknown>;
  notify:    (msg: PluginNotifyMessage) => void;
}
```

### `pubsub`

Scoped publisher. `publish("foo", payload)` routes to channel `plugin:<pkg>:foo`. The plugin author never spells the prefix; the host appended it at runtime construction. Cross-plugin event leakage is structurally impossible through the API.

### `locale`

The host-detected locale at plugin-load time (e.g. `"en"`, `"ja"`). Server-side is a **snapshot**. For reactive locale on the browser side use `BrowserPluginRuntime.locale: Ref<string>`.

### `files: { data; config }`

Scoped file I/O. Two separate roots, mirroring the host's own `data/` vs `config/` separation:

- `files.data`: backup-target user data (e.g. the records the plugin manages on the user's behalf).
- `files.config`: per-machine plugin settings / UI state (e.g. last-selected book id, sort preferences).

Both expose the same `FileOps` shape:

```ts
interface FileOps {
  read(rel: string): Promise<string>;
  readBytes(rel: string): Promise<Uint8Array>;
  write(rel: string, content: string | Uint8Array): Promise<void>;   // atomic
  readDir(rel: string): Promise<string[]>;
  stat(rel: string): Promise<{ mtimeMs: number; size: number }>;
  exists(rel: string): Promise<boolean>;
  unlink(rel: string): Promise<void>;
}
```

### Path conventions

> All `rel` arguments are **POSIX-relative paths** (`/` separated). The platform internally:
>
> 1. Replaces `\` with `/` (Windows `path.join` repair)
> 2. `path.posix.normalize` to fold `..`, `.`, repeated `/`
> 3. Resolves against the plugin's scope root
> 4. **Rejects** anything that escapes the scope root
>
> Plugin authors should never need `node:path`. The recommended ESLint preset (`gui-chat-protocol/eslint-preset`) enforces this.

### `fetch` / `fetchJson`

Wrappers around `globalThis.fetch` with timeout (default 10s) and optional host allowlist:

```ts
runtime.fetch("https://example.com/api", {
  timeoutMs: 5000,
  allowedHosts: ["example.com"],
});
```

`fetchJson` is overloaded:

```ts
fetchJson(url, opts?: PluginFetchOptions): Promise<unknown>;
fetchJson<T>(url, opts: PluginFetchJsonOptions<T>): Promise<T>;
```

The strongly-typed overload **requires** `opts.parse` so the plugin can never get a typed value out of un-validated remote JSON. Idiomatic with Zod:

```ts
const data = await runtime.fetchJson(url, {
  parse: (raw) => MySchema.parse(raw),
});
```

### `log`

Logger bridge to the host's central logger, prefixed with `plugin/<pkg>` automatically. Use this instead of `console.*` so plugin output lands in the central log files.

### `notify`

Publishes to the host's notification channel:

```ts
runtime.notify({ title: "Saved", body: "3 items", level: "info" });
```

## `BrowserPluginRuntime` (browser side)

Available via `useRuntime()` from `gui-chat-protocol/vue` inside any plugin Vue component:

```ts
import { useRuntime } from "gui-chat-protocol/vue";

const { pubsub, locale, openUrl, notify, dispatch, log } = useRuntime();
```

```ts
interface BrowserPluginRuntime {
  pubsub:  { subscribe<T>(eventName: string, handler: (payload: T) => void): () => void };
  locale:  Ref<string>;                                  // reactive
  log:     { debug; info; warn; error };
  openUrl: (url: string) => void;                        // target=_blank + noopener,noreferrer
  notify:  (msg: PluginNotifyMessage) => void;
  dispatch<T = unknown>(args: object): Promise<T>;       // POST to this plugin's dispatch route
}
```

`useRuntime()` **throws** when called outside a host-provided scope. Plugin Vue components should always render inside the host's plugin-scope wrapper (the host's loader is responsible for this).

### `dispatch`

Calls back to this plugin's server-side handler from the browser. The host attaches the bearer token + builds the URL automatically; the plugin author never spells either:

```ts
const json = await dispatch<{ ok: boolean; bookmarks: Bookmark[] }>({
  kind: "list",
});
```

The shape of `args` is whatever the plugin's server handler expects (typically a discriminated union by `kind` — see "Action discriminator pattern" below).

## Action discriminator pattern (recommended)

Use a Zod-discriminated union + exhaustive switch in the server handler:

```ts
const Args = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save"),   payload: SomeSchema }),
  z.object({ kind: z.literal("load") }),
]);

return {
  TOOL_DEFINITION: { /* … */ },
  async myTool(rawArgs: unknown) {
    const args = Args.parse(rawArgs);
    switch (args.kind) {
      case "save": return save(args.payload);
      case "load": return load();
      default: { const exhaustive: never = args; throw new Error(`unknown: ${JSON.stringify(exhaustive)}`); }
    }
  },
};
```

The `default: never` clause is the safety net — adding a new `kind` to `Args` later but forgetting a `case` becomes a build-time TypeScript error rather than a silent runtime drop-through.

## ESLint preset

Plugin authors should extend `gui-chat-protocol/eslint-preset`:

```js
// plugin/eslint.config.mjs
import pluginPreset from "gui-chat-protocol/eslint-preset";
export default [...pluginPreset];
```

The preset turns these into errors:

| Rule | Why |
|---|---|
| `no-restricted-imports` for `fs` / `node:fs` / `fs/promises` / `node:fs/promises` | Use `runtime.files.data` / `runtime.files.config` |
| `no-restricted-imports` for `path` / `node:path` / `node:path/posix` / `node:path/win32` | Use POSIX template literals — paths are platform-normalised |
| `no-console` | Use `runtime.log.*` so output lands in the central log files |

Allowed: `node:crypto` (`randomUUID` etc.), `node:url` (URL parsing). When an `import` matching the restricted list shows up in plugin source, that's the audit signal — the plugin is reaching around the platform.

## Backward compatibility

Plugins built against the legacy `(context, args)` shape continue to work. The host's runtime loader detects which shape a plugin uses (`typeof mod.default === "function"` → factory; otherwise legacy raw exports). Existing `@gui-chat-plugin/*` packages need no changes.

The factory shape is the **recommended** form for new plugins.

## See also

- [`GUI_CHAT_PROTOCOL.md`](./GUI_CHAT_PROTOCOL.md) — wire-level tool-calling protocol
- [`CREATING_A_PLUGIN.md`](./CREATING_A_PLUGIN.md) — legacy plugin shape walkthrough
- [`API_REFERENCE.md`](./API_REFERENCE.md) — full API reference
- [receptron/mulmoclaude#1110](https://github.com/receptron/mulmoclaude/issues/1110) — host-side spec, motivation, threat model, migration plan
