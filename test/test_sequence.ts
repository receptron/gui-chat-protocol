import { test } from "node:test";
import assert from "node:assert/strict";

import {
  continueSequenceInstructions,
  createSequenceKeeper,
  stepAfterUserSpokeInstructions,
  type SequenceKeeperOptions,
} from "../src/sequence";
import type { SequenceStep, ToolResult } from "../src/types";

const GRACE_MS = 5;

/** Waits long enough for the keeper's check to run. */
const afterGrace = (checks = 1) =>
  new Promise((resolve) => setTimeout(resolve, GRACE_MS * (checks + 2)));

const slide = (
  step: number,
  total = 3,
  extra: Partial<SequenceStep> = {},
): SequenceStep => ({
  step,
  total,
  kind: "slideshow",
  label: `Slide ${step} of ${total}`,
  onShown: "explain it",
  nextCall: `call presentSlide for slide ${step + 1} of ${total}`,
  ...extra,
});

const shown = (sequence: SequenceStep | null): ToolResult => ({
  message: "shown",
  sequence,
});

/** A keeper on a clock the test moves, recording what it sent. */
function setup(overrides: Partial<SequenceKeeperOptions> = {}) {
  let clock = 1000;
  const sent: string[] = [];
  const state = { idle: true };
  const keeper = createSequenceKeeper({
    isIdle: () => state.idle,
    sendInstructions: (instructions) => sent.push(instructions),
    graceMs: GRACE_MS,
    now: () => clock,
    ...overrides,
  });
  const tick = (ms = 1) => {
    clock += ms;
    return clock;
  };
  return { keeper, sent, state, tick };
}

test("asks once to go on when a reply ends mid-sequence", async () => {
  const { keeper, sent, tick } = setup();
  assert.equal(keeper.observe(shown(slide(1)), tick()), undefined);
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, [continueSequenceInstructions(slide(1))]);

  // Asked once per step: another reply ending doesn't ask again.
  keeper.replyEnded();
  await afterGrace();
  assert.equal(sent.length, 1);
});

test("doesn't ask when the model went on by itself", async () => {
  const { keeper, sent, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  keeper.replyEnded();
  // The next step arrives before the check runs: the check is cancelled.
  keeper.observe(shown(slide(2)), tick());
  await afterGrace();
  assert.deepEqual(sent, []);
});

test("doesn't ask after the last step or a step that waits for the user", async () => {
  for (const step of [slide(3), slide(1, 3, { waitsForUser: true })]) {
    const { keeper, sent, tick } = setup();
    keeper.observe(shown(step), tick());
    keeper.replyEnded();
    await afterGrace();
    assert.deepEqual(sent, [], step.label);
  }
});

test("looks again while the host is busy, and asks once it is idle", async () => {
  const { keeper, sent, state, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  state.idle = false; // a tool is still running, and no other event follows
  keeper.replyEnded();
  await afterGrace(2);
  assert.deepEqual(sent, []);
  state.idle = true;
  await afterGrace(2);
  assert.deepEqual(sent, [continueSequenceInstructions(slide(1))]);
});

test("a tool finishing after the reply ended waits for the reply to its result", async () => {
  const { keeper, sent, state, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  // The reply ends while the call for slide 2 is still running: the keeper
  // looks again while the host is busy.
  state.idle = false;
  keeper.replyEnded();
  await afterGrace();
  // Slide 2 arrives. The host is idle for a moment before the model answers
  // it; a check kept from before would ask for slide 3 now, while slide 2's
  // own instructions also do. So its check is cancelled…
  keeper.observe(shown(slide(2)), tick());
  state.idle = true;
  await afterGrace(2);
  assert.deepEqual(sent, []);
  // …and the reply to slide 2 arms the next one, which asks once.
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, [continueSequenceInstructions(slide(2))]);
});

test("takes a turn for unanswered instructions before asking to go on", async () => {
  let turns = 0;
  const { keeper, sent, tick } = setup({
    continueConversation: () => {
      turns += 1;
      return true;
    },
  });
  // Even for the last step: its own instructions may be the unanswered ones.
  keeper.observe(shown(slide(3)), tick());
  keeper.replyEnded();
  await afterGrace();
  assert.equal(turns, 1);
  assert.deepEqual(sent, []);
});

test("the user speaking stops it, and says when they spoke", async () => {
  const { keeper, sent, tick } = setup();
  assert.equal(keeper.userSpokeAt(), undefined);
  keeper.observe(shown(slide(1)), tick());
  const spoke = tick();
  keeper.userSpoke();
  assert.equal(keeper.userSpokeAt(), spoke);
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, []);
});

test("a step asked for before the user spoke tells the model to answer them", async () => {
  const { keeper, sent, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  const startedAt = tick(); // slide 2 is asked for…
  tick();
  keeper.userSpoke(); // …the user speaks while it is drawn…
  tick();
  const instructions = keeper.observe(shown(slide(2)), startedAt); // …then it arrives
  assert.equal(instructions, stepAfterUserSpokeInstructions(slide(2)));
  // It doesn't start the tracking again.
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, []);
});

test("a step that wasn't shown stops it", async () => {
  const { keeper, sent, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  assert.equal(keeper.observe(shown(null), tick()), undefined);
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, []);
});

test("other tools' results and cancelled calls change nothing", async () => {
  const { keeper, sent, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  keeper.observe({ message: "a chart" }, tick());
  keeper.observe({ message: "held", sequence: null, cancelled: true }, tick());
  keeper.replyEnded();
  await afterGrace();
  assert.deepEqual(sent, [continueSequenceInstructions(slide(1))]);
});

test("stop() cancels a pending check", async () => {
  const { keeper, sent, tick } = setup();
  keeper.observe(shown(slide(1)), tick());
  keeper.replyEnded();
  keeper.stop();
  await afterGrace();
  assert.deepEqual(sent, []);
});
