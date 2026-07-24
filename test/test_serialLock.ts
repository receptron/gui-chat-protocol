import { test } from "node:test";
import assert from "node:assert/strict";

import { createSerialLock } from "../src/serialLock";

const defer = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** Lets every already-queued microtask and timer callback run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("does not start the next call until the current one settles", async () => {
  const lock = createSerialLock();
  const order: string[] = [];
  const held = defer<void>();

  const first = lock(async () => {
    order.push("first:start");
    await held.promise;
    order.push("first:end");
  });
  const second = lock(async () => {
    order.push("second:start");
  });

  try {
    await tick();
    // `second` is queued behind `first`, which is still awaiting `held`.
    assert.deepEqual(order, ["first:start"]);
  } finally {
    held.resolve();
  }

  await Promise.all([first, second]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
});

test("serialises read-modify-write so no update is dropped", async () => {
  const lock = createSerialLock();
  let counter = 0;
  const increment = () =>
    lock(async () => {
      const current = counter;
      await tick();
      counter = current + 1;
    });

  await Promise.all([increment(), increment(), increment()]);
  assert.equal(counter, 3);
});

test("a rejected call does not poison the queue", async () => {
  const lock = createSerialLock();
  const failing = lock(async () => {
    throw new Error("boom");
  });

  await assert.rejects(failing, /boom/);
  assert.equal(await lock(async () => "ok"), "ok");
});

test("the caller of failing work sees its own error", async () => {
  const lock = createSerialLock();
  const failing = lock(async () => {
    throw new Error("mine");
  });
  const following = lock(async () => "unaffected");

  await assert.rejects(failing, /mine/);
  assert.equal(await following, "unaffected");
});

test("locks are independent of each other", async () => {
  const slow = createSerialLock();
  const other = createSerialLock();
  const held = defer<void>();
  const order: string[] = [];

  const blocked = slow(async () => {
    await held.promise;
    order.push("slow");
  });

  try {
    await other(async () => {
      order.push("other");
    });
    // `other` finished while `slow` still held its own lock.
    assert.deepEqual(order, ["other"]);
  } finally {
    held.resolve();
  }

  await blocked;
  assert.deepEqual(order, ["other", "slow"]);
});

test("resolves with the callback's value", async () => {
  const lock = createSerialLock();
  assert.equal(await lock(async () => 42), 42);
});
