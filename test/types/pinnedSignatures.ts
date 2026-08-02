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
  PluginRuntime,
  ToolContextApp,
} from "../../src/vue";

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
        parse: (raw: unknown) => T | null,
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
