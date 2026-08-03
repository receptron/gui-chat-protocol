/**
 * The four signatures from #30, pinned exactly. `yarn typecheck` fails here if
 * any of them drifts back toward "the caller names a type nothing verified".
 *
 * Why a pin and not just "a host still compiles": TypeScript relates an
 * *overloaded* source leniently, so the reference host in `./fakeHostRuntime`
 * satisfies the OLD `dispatch<T = unknown>(args): Promise<T>` as happily as the
 * new pair. That file proves the shape is implementable without assertions; it
 * cannot prove the shape. Reverting each signature was checked against these
 * pins — and against a `parse?:`-optional near-miss, which they also reject.
 */

import type {
  BrowserPluginRuntime,
  DefaultPluginEndpoints,
  PluginRuntime,
  SubscribeOptions,
  ToolContextApp,
} from "../../src/vue";
import { useRuntime } from "../../src/vue";

/** True only for types that are mutually identical, not merely assignable. */
type IsExact<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false;

type Expect<T extends true> = T;

export type DispatchIsPinned = Expect<
  IsExact<
    BrowserPluginRuntime["dispatch"],
    {
      (args: object): Promise<unknown>;
      <T>(args: object, parse: (raw: unknown) => T): Promise<T>;
    }
  >
>;

export type SubscribeIsPinned = Expect<
  IsExact<
    BrowserPluginRuntime["pubsub"]["subscribe"],
    {
      (eventName: string, handler: (payload: unknown) => void): () => void;
      <T>(
        eventName: string,
        opts: SubscribeOptions<T>,
        handler: (payload: T) => void,
      ): () => void;
    }
  >
>;

export type PublishIsPinned = Expect<
  IsExact<
    PluginRuntime["pubsub"]["publish"],
    (eventName: string, payload: unknown) => void
  >
>;

export type GetConfigIsPinned = Expect<
  IsExact<
    ToolContextApp["getConfig"],
    {
      (key: string): unknown;
      <T>(key: string, parse: (raw: unknown) => T): T | undefined;
    }
  >
>;

/**
 * The reader travels in an object for a reason, and this pins the reason.
 *
 * With a bare `parse` argument, `subscribe(name, parse)` — the handler
 * forgotten — compiled: every unary function satisfies
 * `(payload: unknown) => void`, because a `void` return type accepts any
 * return value. The validator was then registered AS the handler, so every
 * frame was parsed and thrown away, silently, with no error at either compile
 * or run time. `SubscribeOptions` is an object, so that call cannot resolve.
 *
 * If `opts` ever goes back to being callable, this stops being `never` and the
 * hazard is back.
 */
export type HandlerlessSubscribeIsRejected = Expect<
  IsExact<
    Extract<SubscribeOptions<{ url: string }>, (...args: never[]) => unknown>,
    never
  >
>;

/**
 * `useRuntime<E>()` is a KNOWN remaining hole, not an oversight: `E` appears
 * only in `endpoints?: E`, so the caller names it and `inject()` cannot supply
 * it — the same defect the four signatures above just lost. It is pinned rather
 * than fixed because closing it changes an API plugins call directly, and it is
 * pinned rather than left alone so the hole cannot widen or spread unnoticed:
 * changing this signature forces a decision, and the ESLint allowlist entry in
 * `eslint.config.mjs` points at the same issue.
 *
 * Tracked: https://github.com/receptron/gui-chat-protocol/issues/31
 */
export type UseRuntimeHoleIsContained = Expect<
  IsExact<
    typeof useRuntime,
    <E = DefaultPluginEndpoints>() => BrowserPluginRuntime<E>
  >
>;
