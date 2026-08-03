// The `parse`-taking signatures (#30) carry two rules a type cannot state, and
// both are what a host has to get right: `parse` is applied to the raw value
// rather than trusted around it, and a `null` from `subscribe`'s `parse` DROPS
// the frame instead of delivering it. `test/types/fakeHostRuntime.ts` is the
// reference implementation the spec points hosts at, so those rules are pinned
// by running it — the file's own compilation covers the type surface.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createFakeHost, type Frame } from "./types/fakeHostRuntime";

interface Bookmark {
  url: string;
}

const isBookmark = (raw: unknown): raw is Bookmark =>
  typeof raw === "object" &&
  raw !== null &&
  typeof Reflect.get(raw, "url") === "string";

const asBookmarkOrNull = (raw: unknown): Bookmark | null =>
  isBookmark(raw) ? raw : null;

const asBookmark = (raw: unknown): Bookmark => {
  if (!isBookmark(raw)) {
    throw new Error("not a bookmark");
  }
  return raw;
};

describe("dispatch", () => {
  it("hands the raw JSON to parse and resolves to what parse returned", async () => {
    const host = createFakeHost({
      dispatchResponse: { url: "https://example.com", extra: 1 },
    });
    const bookmark = await host.runtime.dispatch({ kind: "get" }, asBookmark);
    assert.equal(bookmark.url, "https://example.com");
  });

  it("rejects with the validator's error when the response does not match", async () => {
    const host = createFakeHost({ dispatchResponse: { nope: true } });
    await assert.rejects(
      () => host.runtime.dispatch({ kind: "get" }, asBookmark),
      /not a bookmark/,
    );
  });

  it("returns the response untouched when no parse is given", async () => {
    const host = createFakeHost({ dispatchResponse: { nope: true } });
    assert.deepEqual(await host.runtime.dispatch({ kind: "get" }), {
      nope: true,
    });
  });
});

describe("subscribe", () => {
  it("delivers parse's return value, not the raw frame", () => {
    const host = createFakeHost();
    const seen: Bookmark[] = [];
    host.runtime.pubsub.subscribe(
      "changed",
      { parse: asBookmarkOrNull },
      (bookmark) => seen.push(bookmark),
    );

    host.emit({
      eventName: "changed",
      payload: { url: "https://example.com" },
    });

    assert.deepEqual(seen, [{ url: "https://example.com" }]);
  });

  it("drops the frame when parse returns null", () => {
    const host = createFakeHost();
    const seen: Bookmark[] = [];
    host.runtime.pubsub.subscribe(
      "changed",
      { parse: asBookmarkOrNull },
      (bookmark) => seen.push(bookmark),
    );

    host.emit({ eventName: "changed", payload: { url: 42 } });
    host.emit({ eventName: "changed", payload: null });
    host.emit({
      eventName: "changed",
      payload: { url: "https://example.com" },
    });

    assert.deepEqual(
      seen,
      [{ url: "https://example.com" }],
      "a non-matching frame must not reach the handler, and must not kill the subscription",
    );
  });

  // `{ parse: (raw) => Schema.parse(raw) }` is the idiom `dispatch` and
  // `fetchJson` document, and Zod's `parse` throws rather than returning null.
  // Copying it here must not be able to take a shared channel down.
  it("treats a throwing parse as a drop, and keeps the channel alive", () => {
    const host = createFakeHost();
    const seen: Bookmark[] = [];
    host.runtime.pubsub.subscribe(
      "changed",
      { parse: asBookmark },
      (bookmark) => seen.push(bookmark),
    );

    const other: unknown[] = [];
    host.runtime.pubsub.subscribe("changed", (payload) => other.push(payload));

    assert.doesNotThrow(() =>
      host.emit({ eventName: "changed", payload: { nope: true } }),
    );
    host.emit({
      eventName: "changed",
      payload: { url: "https://example.com" },
    });

    assert.deepEqual(
      seen,
      [{ url: "https://example.com" }],
      "the throwing frame is skipped, and the subscription survives it",
    );
    assert.equal(
      other.length,
      2,
      "a co-subscriber on the same channel must still receive both frames",
    );
    assert.ok(
      host.logged.some((line) =>
        line.startsWith("warn: dropped an unparseable frame"),
      ),
      "the drop is logged rather than silent",
    );
  });

  it("passes the raw payload through when no parse is given", () => {
    const host = createFakeHost();
    const seen: unknown[] = [];
    host.runtime.pubsub.subscribe("changed", (payload) => seen.push(payload));

    host.emit({ eventName: "changed", payload: { url: 42 } });

    assert.deepEqual(seen, [{ url: 42 }]);
  });

  it("stops delivering after the returned unsubscribe is called", () => {
    const host = createFakeHost();
    const seen: unknown[] = [];
    const off = host.runtime.pubsub.subscribe("changed", (payload) =>
      seen.push(payload),
    );

    host.emit({ eventName: "changed", payload: 1 });
    off();
    host.emit({ eventName: "changed", payload: 2 });

    assert.deepEqual(seen, [1]);
  });
});

describe("publish", () => {
  it("puts the payload on the named channel as-is", () => {
    const host = createFakeHost();
    host.pubsub.publish("changed", { url: "https://example.com" });

    const expected: Frame[] = [
      { eventName: "changed", payload: { url: "https://example.com" } },
    ];
    assert.deepEqual(host.published, expected);
  });
});

describe("getConfig", () => {
  it("narrows a present value through parse", () => {
    const host = createFakeHost({ config: { retries: "3" } });
    const retries = host.app.getConfig("retries", (raw) => Number(raw));
    assert.equal(retries, 3);
  });

  it("returns undefined for a missing key without calling parse", () => {
    const host = createFakeHost({ config: {} });
    const retries = host.app.getConfig("retries", () => {
      throw new Error("parse must not run for a missing key");
    });
    assert.equal(retries, undefined);
  });

  it("returns the stored value untouched when no parse is given", () => {
    const host = createFakeHost({ config: { retries: "3" } });
    assert.equal(host.app.getConfig("retries"), "3");
  });
});
