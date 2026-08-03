# fix: unsound generics on `dispatch` / `subscribe` / `publish` / `getConfig`

Issue: [receptron/gui-chat-protocol#30](https://github.com/receptron/gui-chat-protocol/issues/30)

## Problem

Four public signatures let the **caller name a type that nothing verifies**:

```ts
dispatch<T = unknown>(args: object): Promise<T>;            // src/vue.ts
subscribe<T>(eventName: string, handler: (payload: T) => void): () => void;  // src/vue.ts
publish<T>(eventName: string, payload: T): void;            // src/runtime.ts
getConfig: <T = unknown>(key: string) => T | undefined;     // src/types.ts
```

For the first three the *plugin* picks `T` while the *host* has to produce it from an untyped HTTP
response or channel frame. That is unprovable by construction, so a host cannot implement the
interface without a type assertion. It is not hypothetical: this repo's own test fake
(`test/test_createUseT.ts`) writes `dispatch: async () => ({})`, which does **not** typecheck
against `Promise<T>` — the tests are simply not covered by `yarn typecheck` today, so nobody saw it.

`publish<T>` is the odd one out: `T` appears only in a parameter position, so it is inferred from
the argument and nothing is asserted. It is *vacuous* rather than unsound — it advertises a
contract that subscribers never receive.

The package already solves this correctly one file over: `fetchJson<T>` requires
`opts.parse: (raw: unknown) => T`, and its JSDoc states the principle. This change applies the same
answer to the remaining four.

## Shape

```ts
// src/vue.ts — BrowserPluginRuntime
dispatch(args: object): Promise<unknown>;
dispatch<T>(args: object, parse: (raw: unknown) => T): Promise<T>;

// src/vue.ts — BrowserPluginRuntime["pubsub"]
subscribe(eventName: string, handler: (payload: unknown) => void): () => void;
subscribe<T>(eventName: string, opts: SubscribeOptions<T>, handler: (payload: T) => void): () => void;

// src/types.ts — ToolContextApp
getConfig: {
  (key: string): unknown;
  <T>(key: string, parse: (raw: unknown) => T): T | undefined;
};

// src/runtime.ts — PluginRuntime["pubsub"]
publish(eventName: string, payload: unknown): void;
```

`parse` on `subscribe` returns `T | null` rather than throwing: a subscription is a stream, so a
frame that doesn't match is **dropped**, not fatal. (A payload that is legitimately `null` has to be
wrapped by the plugin — documented.)

## Verification

`yarn typecheck` currently covers `src/**` only, so nothing would prove a host can implement these.
Add `test/types/fakeHostRuntime.ts` — a reference host implementation of all four members, written
with **zero type assertions** — and extend `tsconfig.json`'s `include` to `test/types/**/*.ts`.
Prototyped before writing: overload-declaration + rest-tuple-union narrowing satisfies the
overloaded interface members with no `as`.

`test/test_createUseT.ts` drops its hand-rolled fake and imports this one, so the fake stays honest.
`test/test_runtimeContract.ts` executes it to pin the two rules the types cannot express: `parse`
is applied to the raw value, and a `null` from `parse` drops the frame.

No new dependencies. Type surface only — the package ships no implementation of these members.

## Breaking change → 2.0.0

Un-parameterized call sites keep compiling (`await dispatch(args)` was already `Promise<unknown>`;
`getConfig(key)` was already `unknown`). These break, by design:

- `dispatch<Foo>(args)` → add a reader: `dispatch(args, asFoo)`
- `subscribe<Foo>("x", h)` → `subscribe("x", { parse: asFooOrNull }, h)`
- `getConfig<string>("k")` → `getConfig("k", asString)`
- `publish<Foo>("x", p)` → `publish("x", p)`
- every host implementing `BrowserPluginRuntime` / `PluginRuntime` / `ToolContextApp`

## A pin is needed as well as a reference implementation

The first version of the verification was the reference host alone. It does not work: TypeScript
relates an **overloaded** source leniently, so `fakeHostRuntime.ts` satisfies the OLD
`dispatch<T = unknown>(args): Promise<T>` exactly as happily as the new pair — reverting the
signature left `yarn typecheck` green. `test/types/pinnedSignatures.ts` compares each member
against its expected type with a mutual-identity check (`IsExact`), which does catch it. Both
files earn their place: one proves implementable-without-assertions, the other proves the shape.

Mutations checked (each must turn typecheck red): the four signatures reverted, `dispatch`'s
`parse` made optional, and `subscribe`'s `parse` unable to reject (`=> T` instead of `=> T | null`).

## Also in this PR: the strict TS/ESLint baseline

Per the user's [setup guide](https://github.com/isamu/zenn-docs/blob/master/guides/typescript-eslint-setup.md),
applied here because a package whose subject is "don't assert what nothing checked" should be
enforcing that on itself.

- **tsconfig**: measured each flag first (`tsc --noEmit --pretty false --<flag> | grep -c "error TS"`)
  — all seven outside `strict` were 0 on this tree, so all seven go in with no migration.
- **ESLint**: `tseslint.configs.strict` + `stylistic` (only `stylistic` carries
  `consistent-type-assertions`), `assertionStyle: "never"`, plus a type-information block on the
  files the project service covers. `yarn lint` / `yarn format` extended to `test/`.
- **Exceptions are config entries with a reason, never inline disables.** Three:
  `src/vue.ts` for the two legacy assertions (→ new issue), `test/**` for `no-invalid-void-type`
  (the rule does not recognise a call expression's explicit type argument, `defer<void>()`), and
  `no-explicit-any: { ignoreRestArgs: true }` for `ToolContextApp`'s index signature (`never[]`
  there would make host functions uncallable). The stale
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in `src/types.ts` was pointing
  at the wrong line and had never applied — deleted.

## Steps

1. `src/vue.ts`: `dispatch` + `pubsub.subscribe` overloads, JSDoc stating why `parse` is required.
2. `src/runtime.ts`: `publish` drops `<T>`.
3. `src/types.ts`: `getConfig` overloads; index signature returns `unknown`.
4. `test/types/fakeHostRuntime.ts` + `test/types/pinnedSignatures.ts` + `tsconfig.json` include;
   rewire `test_createUseT.ts`; add `test_runtimeContract.ts`.
5. tsconfig flags + `eslint.config.mjs` + `lint`/`format` scripts.
6. Docs: `spec/PLUGIN_RUNTIME.md`, `spec/API_REFERENCE.md`, `AGENTS.md`, `docs/ChangeLog.md`
   (2.0.0 + migration table), `package.json` version.
7. `yarn format && yarn lint && yarn typecheck && yarn test && yarn build`.
