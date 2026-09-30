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
  SequenceKeeper,
  SequenceKeeperOptions,
  SequenceStep,
  SubscribeOptions,
  ToolContext,
  ToolContextApp,
  ToolResult,
} from "../../src/vue";
import { ARTIFACTS_ROOT, useRuntime } from "../../src/vue";

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

/**
 * Sequences (2.1). What crosses from a plugin to a host is plain data, so it
 * survives a trip over HTTP: `sequence` is a step, `null` ("a step that wasn't
 * shown": the host stops) or absent ("not a step": the host changes nothing).
 * The three are different instructions to the keeper, so `null` must not
 * collapse into absent, nor the field become required.
 */
export type SequenceFieldIsPinned = Expect<
  IsExact<ToolResult["sequence"], SequenceStep | null | undefined>
>;

/** The literal, not `string`: a host and a plugin agree on the directory's
 *  name at compile time. */
export type ArtifactsRootIsPinned = Expect<
  IsExact<typeof ARTIFACTS_ROOT, "artifacts">
>;

/** An opaque string a server can receive: plugins compare it, not parse it. */
export type ConversationIdIsPinned = Expect<
  IsExact<ToolContext["conversationId"], string | undefined>
>;

/** A timestamp a server can receive, not a function it can't. */
export type UserSpokeAtIsPinned = Expect<
  IsExact<ToolContext["userSpokeAt"], number | undefined>
>;

/**
 * The keeper hands the host instructions to send and nothing else: the host
 * decides how (a user turn, `response.create`), and whatever it returns is
 * ignored rather than trusted.
 */
export type SendInstructionsIsPinned = Expect<
  IsExact<
    SequenceKeeperOptions["sendInstructions"],
    (instructions: string) => unknown
  >
>;

export type SequenceKeeperIsPinned = Expect<
  IsExact<
    SequenceKeeper,
    {
      observe(result: ToolResult, startedAt: number): string | undefined;
      replyEnded(): void;
      userSpoke(): void;
      stop(): void;
      userSpokeAt(): number | undefined;
    }
  >
>;
