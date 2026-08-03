# CLAUDE.md — gui-chat-protocol

Layout, scripts, and contributor workflow live in [`AGENTS.md`](./AGENTS.md). This file holds the
rules specific to what this package *is*: a description of types a host has to be able to honour.
Everything here was paid for by a bug, so each rule says which one.

## Type design

### NEVER add a type parameter that appears only in the return position

That is a type assertion with nicer syntax. Nothing in the call gives the compiler a way to derive
`T`, so whatever the caller writes is what it gets:

```ts
dispatch<T = unknown>(args: object): Promise<T>;   // ✗ T is nowhere in the arguments

const list = await dispatch<Bookmark[]>(args);     // ≡ (await dispatch(args)) as Bookmark[]
```

The `as` is visible to a reviewer and to `consistent-type-assertions`. The signature above is not,
and it pushes the assertion into the **host**, which has no way to produce `Promise<T>` from an
untyped response except `json as T` — the API makes lying a requirement of implementing it. Nothing
breaks at runtime, which is what makes it dangerous: only *what the compiler believes* changes, so
the program dies later, far from the cause.

**Instead, take a reader**, so `T` is *inferred from evidence* rather than declared:

```ts
dispatch(args: object): Promise<unknown>;                             // ✓ no reader → unknown
dispatch<T>(args: object, parse: (raw: unknown) => T): Promise<T>;    // ✓ T comes from parse
```

The test: if a type parameter appears in an argument position it is inferred and cannot lie
(`publish<T>(name, payload: T)` was *useless*, not unsound — it was deleted, not fixed). If it
appears only in the output, it is the caller's unverified word. See
[`spec/PLUGIN_RUNTIME.md` → "Why these take a reader"](./spec/PLUGIN_RUNTIME.md#why-these-take-a-reader).
(#30, 2.0.0. `useRuntime<E>()` is the known remaining instance — #31.)

### A reader that can be passed as something else is a footgun

`subscribe` takes `{ parse }`, not a bare `parse` argument, because **a `void` return type accepts
any return value** — so every unary function satisfies `(payload: unknown) => void`, and
`subscribe(name, parse)` with the handler forgotten compiled, registered the validator *as* the
handler, and discarded every frame with no error at compile time or run time. An object is not
callable. When adding an overload where two adjacent parameters are both functions, check that
omitting one is a type error. (#32)

### Say what a throwing reader means

`parse: (raw) => MySchema.parse(raw)` is the idiom this package documents, and Zod's `parse`
**throws**. Whatever a reader is attached to must specify what a throw does: `dispatch` rejects the
promise; `subscribe` drops that frame and keeps delivering, because otherwise one malformed frame
takes down a shared channel and every other subscriber on it. (#32)

## Changing a public signature

`yarn typecheck` covers `src/**` and `test/types/**`. A signature change needs **both** fixtures —
neither is sufficient alone:

- `test/types/fakeHostRuntime.ts` — a reference host implementation that must compile with **zero
  type assertions**. Proves a host can satisfy the interface. Copy its overload-declaration +
  rest-tuple-union shape when implementing one.
- `test/types/pinnedSignatures.ts` — exact-type pins (`IsExact`). Proves the shape is what we say.

The second exists because the first does not catch a revert: **TypeScript relates an overloaded
source leniently**, so the reference host satisfies the *old* `dispatch<T = unknown>(args)` exactly
as happily as the new pair. Reverting the signature left typecheck green until the pins existed.

MUST mutation-test a new pin: break the thing it pins, confirm typecheck goes red, restore. A pin
that cannot fail is worse than no pin, because it reads as coverage.

## Exceptions

NEVER use an inline `// eslint-disable`. `consistent-type-assertions` is `assertionStyle: "never"`;
exceptions live in `eslint.config.mjs` as one entry with one reason, and a link to the issue that
would let the entry be deleted. There are three today, each carrying its rationale.

## Breaking changes

State every route by which callers lose a type, not just the obvious one. For 2.0.0 there were
three, and only the first has a type argument to grep for:

```ts
dispatch<Bookmark[]>(args);                      // explicit type argument
subscribe("changed", (p: Bookmark[]) => { … });  // inferred from the handler annotation
const list: Bookmark[] = await dispatch(args);   // inferred from the assignment target
```

Verify migration claims against the built `dist/*.d.ts`, not `src/` — that is what consumers
actually resolve.
