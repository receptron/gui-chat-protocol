# Changelog

## 2.0.0 — 2026-08-03

- **BREAKING: `dispatch` / `subscribe` / `getConfig` take a reader; `publish` drops its type parameter** ([#30](https://github.com/receptron/gui-chat-protocol/issues/30)). Four signatures let the *caller* name a type that nothing verified, and the *host* had to produce it from an untyped HTTP response or channel frame — unprovable by construction, so no host could implement them without a type assertion. The package already answered this correctly one file over: `fetchJson<T>` requires `opts.parse`. These now do the same.

  ```ts
  // before — the plugin names the type, nobody checks it
  const list = await dispatch<Bookmark[]>({ kind: "list" });

  // after — the plugin says how to get it
  const list = await dispatch({ kind: "list" }, (raw) => Bookmarks.parse(raw));
  ```

  | | before | after |
  |---|---|---|
  | `dispatch` | `dispatch<T>(args)` | `dispatch(args)` → `unknown`, or `dispatch(args, parse)` |
  | `subscribe` | `subscribe<T>(name, handler)` | `subscribe(name, handler)` with `unknown`, or `subscribe(name, parse, handler)` |
  | `getConfig` | `getConfig<T>(key)` | `getConfig(key)` → `unknown`, or `getConfig(key, parse)` |
  | `publish` | `publish<T>(name, payload)` | `publish(name, payload)` — `payload: unknown` |

  The rule underneath, written up in [`spec/PLUGIN_RUNTIME.md`](../spec/PLUGIN_RUNTIME.md#why-these-take-a-reader): **a type parameter that appears only in the return position is a type assertion with nicer syntax** — `dispatch<Bookmark[]>(args)` and `(await dispatch(args)) as Bookmark[]` were the same thing, except the second is visible to a reviewer. Passing a reader turns `T` from a *declaration* into an *inference*, derived from `parse`'s return type. `publish<T>` was the opposite case: `T` sat in an argument position, so it was inferred and could not lie — just useless, since the type does not survive JSON. It was deleted rather than fixed.

  Un-parameterized call sites are unaffected (`dispatch(args)` was already `Promise<unknown>`). What breaks: any call that passed an explicit type argument, and every host implementing `BrowserPluginRuntime` / `PluginRuntime` / `ToolContextApp`. `subscribe`'s `parse` returns `T | null` because a subscription is a stream — a frame that does not match is **dropped**, not fatal.

  `ToolContextApp`'s index signature now returns `unknown` instead of `any` for the same reason: what a host's backend function hands back is not something this protocol can see.

  Verified two ways, because neither is sufficient alone: `test/types/fakeHostRuntime.ts` is a reference host implementation that compiles with **zero type assertions** (overload declarations + a rest-tuple union narrowed by `length`), and `test/types/pinnedSignatures.ts` pins the exact signatures — TypeScript relates overloaded sources leniently, so the reference host satisfies the *old* signature too and would not have caught a revert. Reverting each of the four, plus two near-misses (`parse?:` optional, `parse` unable to reject), turns the pins red.

- **Strict TypeScript + ESLint baseline** ([guide](https://github.com/isamu/zenn-docs/blob/master/guides/typescript-eslint-setup.md)). Seven compiler flags outside `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, …) were each measured at 0 errors on this tree and turned on. ESLint gains `tseslint.configs.strict` + `stylistic` — the latter is the only preset carrying `consistent-type-assertions`, now `assertionStyle: "never"`, so a package about type soundness can no longer ship an unchecked `as`. Type-information rules (`no-floating-promises`, `await-thenable`, …) run against the project service. `yarn lint` and `yarn format` now cover `test/` as well, and `tsconfig.json` typechecks `test/types/**`.

  Two pre-existing assertions in `src/vue.ts` (`useRuntime<E>()`, `pickMessages<M>()`) are the same unsound-generic family and are excluded via a documented allowlist entry rather than an inline disable — tracked in [#31](https://github.com/receptron/gui-chat-protocol/issues/31), since fixing them changes an API plugins call directly.

📦 npm: [`gui-chat-protocol@2.0.0`](https://www.npmjs.com/package/gui-chat-protocol/v/2.0.0)

## 1.2.0 — 2026-07-24

- **`createSerialLock()` — new SDK surface** (#27). A factory that queues async work so it runs one at a time. Plugin authors doing read-modify-write against their own files need this: two parallel calls otherwise read the same snapshot and one update is silently dropped. Three places in [receptron/mulmoclaude](https://github.com/receptron/mulmoclaude) carried a byte-identical hand-rolled copy (`bookmarks-plugin`, `recipe-book-plugin`, and the `create-mulmoclaude-plugin` scaffold template — so every generated plugin inherited another copy). Exported from the root entry alongside `runtime` / `schema`; no new subpath.

  ```ts
  import { createSerialLock } from "gui-chat-protocol";

  const withWriteLock = createSerialLock();

  await withWriteLock(async () => {
    const current = await read();
    await write(current + 1); // cannot interleave with another call
  });
  ```

  The `.catch(() => undefined)` on the chain head is load-bearing and easy to get wrong when hand-copied: it stops a rejected call from poisoning the queue, while the caller that queued the failing work still sees its own error. Both properties are pinned by tests, and the serialisation itself is mutation-verified (dropping it turns the read-modify-write test red with `actual: 1, expected: 3` — exactly the dropped-update bug).

- **`createUseT` is now actually executed by tests** (#26). The existing suite covered only the pure `pickMessages` half and explicitly excluded `createUseT` as "two lines of glue" — but those two lines were what 1.1.0 changed (throw when the host provides nothing → English fallback), and three mulmoclaude plugins had their behaviour changed on that basis without the function ever running under test. Using `app.runWithContext()` lets `inject()` resolve outside a component `setup`, so the behaviour is verified headlessly with no DOM and no mounting.

📦 npm: [`gui-chat-protocol@1.2.0`](https://www.npmjs.com/package/gui-chat-protocol/v/1.2.0)
