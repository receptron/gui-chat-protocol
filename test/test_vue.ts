// `pickMessages` is the pure half of `createUseT` — the half worth pinning.
// `createUseT` itself is two lines of glue over `useRuntime()` + `computed()`,
// which need a mounted Vue app with the host's provider to exercise.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickMessages } from "../src/vue";

const MESSAGES = {
  en: { hello: "Hello" },
  ja: { hello: "こんにちは" },
} as const;

describe("pickMessages", () => {
  it("returns the table for a supported locale", () => {
    assert.deepEqual(pickMessages(MESSAGES, "ja"), { hello: "こんにちは" });
  });

  it("returns English for an unsupported locale", () => {
    assert.deepEqual(pickMessages(MESSAGES, "fr"), { hello: "Hello" });
  });

  it("returns English for an empty locale", () => {
    assert.deepEqual(pickMessages(MESSAGES, ""), { hello: "Hello" });
  });

  // Regression: the per-plugin copies this replaces tested membership with
  // `locale in MESSAGES`, which walks the prototype chain — so these names
  // "matched" and handed back an inherited value instead of a message table.
  it("does not treat inherited properties as locales", () => {
    for (const inherited of ["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"]) {
      assert.deepEqual(pickMessages(MESSAGES, inherited), { hello: "Hello" }, `${inherited} must fall back to en`);
    }
  });

  it("prefers an own property that shadows an inherited name", () => {
    const shadowed = { en: { hello: "Hello" }, toString: { hello: "shadowed" } } as const;
    assert.deepEqual(pickMessages(shadowed, "toString"), { hello: "shadowed" });
  });
});
