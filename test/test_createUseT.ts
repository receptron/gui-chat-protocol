// `createUseT` is what plugins actually call, and 1.1.0 changed how it behaves
// when no host runtime is present (it used to throw via `useRuntime()`, it now
// falls back to English). That change is the whole reason plugins could adopt
// it, so it needs to be pinned rather than described.
//
// `app.runWithContext()` lets `inject()` resolve outside a component's setup,
// so these run headless — no DOM, no mount.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp, ref, type Ref } from "vue";

import {
  createUseT,
  PLUGIN_RUNTIME_KEY,
  type BrowserPluginRuntime,
} from "../src/vue";

const MESSAGES = {
  en: { hello: "Hello" },
  ja: { hello: "こんにちは" },
  de: { hello: "Hallo" },
} as const;

/** Minimal stand-in for the host runtime — only `locale` is read here. */
function fakeRuntime(locale: Ref<string>): BrowserPluginRuntime {
  return {
    locale,
    pubsub: { subscribe: () => () => {} },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    openUrl() {},
    dispatch: async () => ({}),
  };
}

function withRuntime<T>(locale: Ref<string>, fn: () => T): T {
  const app = createApp({});
  app.provide(PLUGIN_RUNTIME_KEY, fakeRuntime(locale));
  return app.runWithContext(fn);
}

describe("createUseT", () => {
  it("resolves the table for the host's locale", () => {
    const useT = createUseT(MESSAGES);
    const t = withRuntime(ref("ja"), () => useT());
    assert.deepEqual(t.value, { hello: "こんにちは" });
  });

  it("tracks the host locale reactively", () => {
    const useT = createUseT(MESSAGES);
    const locale = ref("en");
    const t = withRuntime(locale, () => useT());
    assert.deepEqual(t.value, { hello: "Hello" });
    locale.value = "de";
    assert.deepEqual(
      t.value,
      { hello: "Hallo" },
      "computed should re-evaluate when the host switches locale",
    );
  });

  it("falls back to English for a locale the plugin doesn't ship", () => {
    const useT = createUseT(MESSAGES);
    const t = withRuntime(ref("fr"), () => useT());
    assert.deepEqual(t.value, { hello: "Hello" });
  });

  // The 1.1.0 behaviour change: `useRuntime()` throws here, `createUseT` must
  // not — a plugin's components have to render standalone (storybook, unit
  // test, a page mounted outside the host's plugin scope).
  it("falls back to English instead of throwing when no host runtime is provided", () => {
    const useT = createUseT(MESSAGES);
    const app = createApp({});
    const t = app.runWithContext(() => useT());
    assert.deepEqual(t.value, { hello: "Hello" });
  });

  it("does not treat an inherited property name as a locale", () => {
    const useT = createUseT(MESSAGES);
    const t = withRuntime(ref("toString"), () => useT());
    assert.deepEqual(t.value, { hello: "Hello" });
  });
});
