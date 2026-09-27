/**
 * Sequence keeper — keeps a sequence going for a host.
 *
 * A sequence is a set of steps the model shows one at a time with a tool
 * (a slideshow's slides, a story's panels): each step's result tells the
 * model to talk about it and call the next one in the same reply
 * (`ToolResult.instructions`), and says where the sequence is
 * (`ToolResult.sequence`). Models sometimes end the reply without calling
 * the next step. So when a reply is over, nothing is playing or running,
 * and steps are left, the keeper asks the model once to go on.
 *
 * - A step that waits for the user (`waitsForUser`), and the last step,
 *   are not asked about: the model goes on when the user says so.
 * - Asked once per step: a model that still doesn't go on has a reason
 *   (it is answering something else), and asking again would loop.
 * - The user speaking (or sending a message) stops the tracking: they may
 *   have said "stop", and if they said "go on", the next step starts it
 *   again. Speech can be noticed late (a transcript that arrives seconds
 *   after), so the request to go on also defers to the user.
 * - A step asked for before the user spoke, which arrives after, gets
 *   instructions to answer the user first instead of its own "go on"
 *   (models otherwise said "I've stopped" and carried on).
 *
 * Framework-agnostic: the host calls `observe`, `replyEnded`,
 * `userSpoke` and `stop` from its own events. Found in MulmoGlass and
 * MulmoChat, on OpenAI Realtime, Gemini Live, Grok Voice and text chat.
 */

import type { SequenceStep, ToolResult } from "./types";

export interface SequenceKeeperOptions {
  /** No reply running, no audio playing, no tool running, and the user
   *  silent: the moment to ask the model to go on. */
  isIdle: () => boolean;
  /**
   * Send follow-up instructions to the model. They are required: a host
   * that can drop instructions (a "suppress instructions" setting) sends
   * these anyway, and a turn-based host takes a turn for them.
   */
  sendInstructions: (instructions: string) => unknown;
  /**
   * For a turn-based host (text chat): take a turn for instructions that
   * were queued and that no turn has answered yet, such as the last step's
   * own instructions after the host's follow-up limit. Returns false when
   * there are none. The keeper tries this first, and asks the model to go
   * on only when it returns false. Omit for voice.
   */
  continueConversation?: () => boolean;
  /** After a reply ends, how long to wait for the model to go on by itself,
   *  and how often to look again while the host is busy. Default 2000 ms. */
  graceMs?: number;
  /** The clock, in milliseconds. Default `Date.now`. `observe`'s
   *  `startedAt` and `userSpokeAt()` use it. */
  now?: () => number;
  /** Where the keeper says what it did. Default: nowhere. */
  log?: (message: string) => void;
}

export interface SequenceKeeper {
  /**
   * Every tool result, with when its call started (`now()` at the call).
   * Returns instructions that replace the result's own, or undefined to
   * keep them: a step asked for before the user spoke gets instructions to
   * answer the user first.
   */
  observe(result: ToolResult, startedAt: number): string | undefined;
  /**
   * The model's reply, or its audio, ended. Call it for every reply,
   * including the one that answers a tool's result: a step's result cancels
   * any check already waiting (see `observe`), and the reply to that result
   * is what arms the next one. A host that skips it for that reply leaves
   * the sequence without a check.
   */
  replyEnded(): void;
  /** The user started speaking or sent a message. */
  userSpoke(): void;
  /** Stop keeping the sequence going (the chat ended). */
  stop(): void;
  /** When the user last spoke, for `ToolContext.userSpokeAt`; undefined
   *  before they have. */
  userSpokeAt(): number | undefined;
}

const DEFAULT_GRACE_MS = 2000;

/** The request to go on, when the model ended a reply mid-sequence. */
export const continueSequenceInstructions = ({
  kind,
  nextCall,
  onShown,
}: SequenceStep): string =>
  `Continue the ${kind}: ${nextCall} now, and ${onShown} when it appears. If the user has just asked you to stop or asked something else, answer them instead.`;

/** For a step that arrived after the user spoke (asked while they did). */
export const stepAfterUserSpokeInstructions = ({
  label,
  kind,
}: SequenceStep): string =>
  `${label} is now on the screen, but the user spoke while it was being made. Respond to what they said; go on with the ${kind} only if they want you to.`;

/**
 * Creates a keeper. One per conversation.
 *
 * ```ts
 * const keeper = createSequenceKeeper({ isIdle, sendInstructions });
 * // a tool call started:   const startedAt = Date.now();
 * // its result arrived:    result.instructions = keeper.observe(result, startedAt) ?? result.instructions;
 * // the reply ended:       keeper.replyEnded();
 * // the user spoke:        keeper.userSpoke();
 * // a tool call's context: { …, userSpokeAt: keeper.userSpokeAt() }
 * ```
 */
export function createSequenceKeeper(
  options: SequenceKeeperOptions,
): SequenceKeeper {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const now = options.now ?? Date.now;
  const log = (message: string) => options.log?.(message);

  let progress: { step: SequenceStep; asked: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // When tracking last stopped. A step whose call started before that (the
  // user interrupted while it was being made) doesn't start it again.
  let stoppedAt = -Infinity;
  let lastUserSpeech: number | undefined;

  const cancelCheck = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const stop = () => {
    progress = null;
    stoppedAt = now();
    cancelCheck();
  };

  const observe = (
    result: ToolResult,
    startedAt: number,
  ): string | undefined => {
    // Not a sequence's step, or a held or repeated call: nothing changes.
    if (result.sequence === undefined || result.cancelled) return undefined;
    const step = result.sequence;
    if (startedAt <= stoppedAt) {
      return step ? stepAfterUserSpokeInstructions(step) : undefined;
    }
    // A step that wasn't shown: asking for it again would fail again, and
    // its result keeps its failure's instructions.
    if (!step) {
      stop();
      return undefined;
    }
    // A check set before this step arrived would ask for the step its own
    // instructions are about to ask for: the host is briefly idle between
    // the result and the model's reply to it, and a check firing then would
    // ask the model to go on while the step's instructions also do (the
    // model skips the step or calls the next one twice). So it is
    // cancelled, not kept; the reply to this result calls replyEnded().
    cancelCheck();
    progress = { step, asked: false };
    return undefined;
  };

  const replyEnded = (): void => {
    if (!progress || progress.asked) return;
    cancelCheck();
    timer = setTimeout(() => {
      timer = null;
      if (!progress || progress.asked) return;
      // A reply can end while a tool it called is still running, and no
      // other event may follow: look again later rather than give up.
      if (!options.isIdle()) {
        replyEnded();
        return;
      }
      progress.asked = true;
      const { step } = progress;
      if (options.continueConversation?.()) {
        log(`a turn for ${step.label}'s instructions`);
        return;
      }
      if (step.step >= step.total || step.waitsForUser) return;
      log(`asking to ${step.nextCall}`);
      options.sendInstructions(continueSequenceInstructions(step));
    }, graceMs);
  };

  const userSpoke = (): void => {
    lastUserSpeech = now();
    stop();
  };

  return {
    observe,
    replyEnded,
    userSpoke,
    stop,
    userSpokeAt: () => lastUserSpeech,
  };
}
