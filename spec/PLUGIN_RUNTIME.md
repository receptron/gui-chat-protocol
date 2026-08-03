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
  pubsub:    { publish(eventName: string, payload: unknown): void };
  locale:    string;                                      // host-detected locale snapshot
  files:     { data: FileOps; config: FileOps; artifacts: FileOps }; // data/config private; artifacts shared
  log:       { debug; info; warn; error };                // (msg, data?) → void
  fetch:     (url, opts?: PluginFetchOptions) => Promise<Response>;
  fetchJson: <T>(url, opts: PluginFetchJsonOptions<T>) => Promise<T>;
  fetchJson: (url, opts?: PluginFetchOptions) => Promise<unknown>;
}
```

### `pubsub`

Scoped publisher. `publish("foo", payload)` routes to channel `plugin:<pkg>:foo`. The plugin author never spells the prefix; the host appended it at runtime construction. Cross-plugin event leakage is structurally impossible through the API.

`payload` is `unknown`, not a type parameter: the type does not survive the channel (the frame crosses as JSON), so naming it here would advertise a contract the subscriber never receives. The receiving end narrows — see [`subscribe`](#subscribe) below.

### `locale`

The host-detected locale at plugin-load time (e.g. `"en"`, `"ja"`). Server-side is a **snapshot**. For reactive locale on the browser side use `BrowserPluginRuntime.locale: Ref<string>`.

### `files: { data; config; artifacts }`

Scoped file I/O. Three roots, mirroring the host's own `data/` vs `config/` vs `artifacts/` separation:

- `files.data`: backup-target user data (e.g. the records the plugin manages on the user's behalf). **Private**, sandboxed to the plugin's own dir.
- `files.config`: per-machine plugin settings / UI state (e.g. last-selected book id, sort preferences). **Private**, sandboxed to the plugin's own dir.
- `files.artifacts`: **shared, user-browsable** output area rooted at the host's `artifacts/` dir. Use it for outputs the user should see in the Files explorer — e.g. a chart plugin writing `charts/<slug>.chart.json`. The plugin owns its category subdir (`charts/`, `spreadsheets/`, …) by convention; relative paths are still normalised + traversal-guarded by the host.

All three expose the same `FileOps` shape:

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

## `BrowserPluginRuntime` (browser side)

Available via `useRuntime()` from `gui-chat-protocol/vue` inside any plugin Vue component:

```ts
import { useRuntime } from "gui-chat-protocol/vue";

const { pubsub, locale, openUrl, dispatch, log } = useRuntime();
```

```ts
interface BrowserPluginRuntime {
  pubsub: {
    subscribe(eventName: string, handler: (payload: unknown) => void): () => void;
    subscribe<T>(eventName: string, opts: { parse: (raw: unknown) => T | null }, handler: (payload: T) => void): () => void;
  };
  locale:  Ref<string>;                                  // reactive
  log:     { debug; info; warn; error };
  openUrl: (url: string) => void;                        // target=_blank + noopener,noreferrer
  dispatch(args: object): Promise<unknown>;              // POST to this plugin's dispatch route
  dispatch<T>(args: object, parse: (raw: unknown) => T): Promise<T>;
  endpoints?: Readonly<Record<string, string>>;          // multi-URL escape hatch (optional)
}
```

`useRuntime()` **throws** when called outside a host-provided scope. Plugin Vue components should always render inside the host's plugin-scope wrapper (the host's loader is responsible for this).

### Why these take a reader

**A type parameter that appears only in the return position is a type assertion with nicer syntax.**

```ts
dispatch<T = unknown>(args: object): Promise<T>;   // T is nowhere in the arguments
```

Nothing in the call gives the compiler a way to *derive* `T`, so whatever the caller writes is what it gets — which makes these two lines the same thing:

```ts
const list = await dispatch<Bookmark[]>(args);
const list = (await dispatch(args)) as Bookmark[];
```

The second is visible to a reviewer and to `consistent-type-assertions`. The first is not, and it moves the assertion into the *host*: to return `Promise<T>` from an untyped HTTP response, the host has no option but `json as T`. The API made lying a requirement of implementing it. This was not hypothetical — the fake host in this repo's own test suite (`dispatch: async () => ({})`) failed to compile against the old signature the moment the tests were typechecked.

Nothing breaks at runtime, which is what makes it worth taking seriously: the only thing that changes is **what the compiler believes**. When the server answers `{ error: "..." }`, `list[0].url` still typechecks, and the program dies later at a line that has nothing to do with the cause.

Passing a reader turns `T` from a **declaration** into an **inference** — it is derived from `parse`'s return type, so the type and the check can no longer disagree:

```ts
dispatch<T>(args: object, parse: (raw: unknown) => T): Promise<T>;
```

`publish` is a different case worth naming, because it looks similar and is not. Its `publish<T>(name, payload: T)` had `T` in an *argument* position, so it was inferred and could not lie — just useless: the type does not survive JSON, so the subscriber never receives it. That one was deleted rather than fixed.

Applying the same test elsewhere: `useRuntime<E>()` has `E` only in `endpoints?: E`, which is why it is the one assertion left in `src/` ([#31](https://github.com/receptron/gui-chat-protocol/issues/31)).

### `dispatch`

Calls back to this plugin's server-side handler from the browser. The host attaches the bearer token + builds the URL automatically; the plugin author never spells either:

```ts
const { bookmarks } = await dispatch({ kind: "list" }, (raw) => ListResult.parse(raw));
```

The shape of `args` is whatever the plugin's server handler expects (typically a discriminated union by `kind` — see "Action discriminator pattern" below).

The second argument is a **reader**: it takes the raw JSON and returns the narrowed value (or throws). Without it the result is `unknown` and the plugin narrows it itself. There is no form that lets the plugin *name* the response type without checking it — the host would have to assert a shape nobody verified, which is exactly what `fetchJson` refuses to do on the server side.

### `subscribe`

Same rule for channel frames, with one difference: a subscription is a stream, so `parse` returns `T | null` and a `null` **drops the frame** instead of throwing.

```ts
subscribe("changed", { parse: (raw) => Bookmarks.safeParse(raw).data ?? null }, (bookmarks) => {
  list.value = bookmarks;
});
```

A payload that is legitimately `null` must be wrapped (`{ value: null }`) so it is distinguishable from a reject.

The reader travels in an object (`{ parse }`, matching `fetchJson`'s `opts.parse`) rather than as a bare argument, and that is load-bearing. With a bare argument, forgetting the handler compiled:

```ts
subscribe("changed", asBookmarks);   // ← meant to validate, forgot the handler
```

Every unary function satisfies `(payload: unknown) => void`, because a `void` return type accepts any return value — so this resolved to the *untyped* overload with the validator registered AS the handler. Each frame was parsed and the result thrown away, silently, with no error at compile time or run time. `{ parse }` is not callable, so the same mistake is now a type error.

### Implementing these on the host side

Both members are overloaded, so the host declares overloads too. A rest-tuple union narrowed by `rest.length` is what keeps the implementation free of type assertions — `test/types/fakeHostRuntime.ts` in this repo is a complete, compiled reference:

```ts
function subscribe(eventName: string, handler: (payload: unknown) => void): () => void;
function subscribe<T>(eventName: string, opts: SubscribeOptions<T>, handler: (payload: T) => void): () => void;
function subscribe<T>(
  eventName: string,
  ...rest:
    | [handler: (payload: unknown) => void]
    | [opts: SubscribeOptions<T>, handler: (payload: T) => void]
): () => void {
  if (rest.length === 1) return onFrame(eventName, rest[0]);
  const [opts, handler] = rest;
  return onFrame(eventName, (raw) => {
    const payload = opts.parse(raw);
    if (payload !== null) handler(payload);
  });
}
```

### `endpoints` (optional, multi-URL plugins)

For plugins that need more than the single `dispatch` endpoint — typically REST-shaped plugins with several sub-resources (`items`, `items/:id`, `columns`, …) where folding everything through `dispatch(args)` would force a server-side rewrite. The host populates this map at provide time; single-dispatch plugins (the common runtime-loaded shape) leave it `undefined`.

```ts
// Plugin declares its expected shape
interface TodoEndpoints {
  list: string;
  items: string;
  item: string;       // route pattern with :id
  columns: string;
}

// Plugin reads via the runtime
const endpoints = runtime.endpoints as TodoEndpoints | undefined;
if (!endpoints) throw new Error("host did not provide TodoEndpoints");
await fetch(endpoints.items, { method: "POST", body });
```

The protocol keeps `endpoints` typed as `Record<string, string>` so it doesn't need to know plugin-specific keys; plugins recover named access via a local interface + `as` cast. The host is responsible for populating the same key set the plugin expects.

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
