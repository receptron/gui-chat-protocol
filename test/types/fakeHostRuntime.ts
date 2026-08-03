/**
 * Reference host implementation of the four `parse`-taking members, written
 * with **zero type assertions** — that property is the whole point of #30, and
 * a signature that only *looks* implementable would be worse than the one it
 * replaced.
 *
 * This file is in `tsconfig.json`'s `include` (the rest of `test/` is not, so
 * it can't import `node:test`). Compiling it IS the assertion: if a host can no
 * longer satisfy `BrowserPluginRuntime` / `PluginRuntime` / `ToolContextApp`
 * without an `as`, `yarn typecheck` goes red here.
 *
 * The overload-declaration + rest-tuple-union shape below is what a real host
 * copies; `spec/PLUGIN_RUNTIME.md` points at it.
 */

import { ref, type Ref } from "vue";

import type {
  BrowserPluginRuntime,
  PluginRuntime,
  SubscribeOptions,
  ToolContextApp,
} from "../../src/vue";

/** One channel frame as it arrives from the wire: name + un-validated payload. */
export interface Frame {
  eventName: string;
  payload: unknown;
}

export interface FakeHost {
  runtime: BrowserPluginRuntime;
  pubsub: PluginRuntime["pubsub"];
  app: ToolContextApp;
  /** Feed a frame to every live subscriber, as the host's socket would. */
  emit(frame: Frame): void;
  /** Everything `publish()` put on the wire, in order. */
  published: Frame[];
  /** `log.*` calls, as `"<level>: <msg>"`. */
  logged: string[];
  /** URLs passed to `openUrl`. */
  openedUrls: string[];
}

export interface FakeHostOptions {
  locale?: Ref<string>;
  /** Raw JSON the fake dispatch route answers with. */
  dispatchResponse?: unknown;
  /** Backing store for `app.getConfig`. */
  config?: Record<string, unknown>;
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const { locale = ref("en"), dispatchResponse = {}, config = {} } = options;
  const listeners = new Map<string, Set<(raw: unknown) => void>>();
  const published: Frame[] = [];
  const logged: string[] = [];
  const openedUrls: string[] = [];
  const store: Record<string, unknown> = { ...config };
  const record = (level: string) => (msg: string) => {
    logged.push(`${level}: ${msg}`);
  };

  const onFrame = (
    eventName: string,
    handler: (raw: unknown) => void,
  ): (() => void) => {
    const handlers = listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    listeners.set(eventName, handlers);
    return () => {
      handlers.delete(handler);
    };
  };

  async function dispatch(args: object): Promise<unknown>;
  async function dispatch<T>(
    args: object,
    parse: (raw: unknown) => T,
  ): Promise<T>;
  // `__args` — the canned response ignores what was posted.
  async function dispatch<T>(__args: object, parse?: (raw: unknown) => T) {
    const raw: unknown = await Promise.resolve(dispatchResponse);
    return parse ? parse(raw) : raw;
  }

  function subscribe(
    eventName: string,
    handler: (payload: unknown) => void,
  ): () => void;
  function subscribe<T>(
    eventName: string,
    opts: SubscribeOptions<T>,
    handler: (payload: T) => void,
  ): () => void;
  // A union of argument tuples, narrowed by `rest.length`, is what lets the
  // implementation read `opts` and `handler` without asserting either.
  function subscribe<T>(
    eventName: string,
    ...rest:
      | [handler: (payload: unknown) => void]
      | [opts: SubscribeOptions<T>, handler: (payload: T) => void]
  ): () => void {
    if (rest.length === 1) {
      return onFrame(eventName, rest[0]);
    }
    const [opts, handler] = rest;
    return onFrame(eventName, (raw) => {
      const payload = opts.parse(raw);
      if (payload !== null) {
        handler(payload);
      }
    });
  }

  function getConfig(key: string): unknown;
  function getConfig<T>(key: string, parse: (raw: unknown) => T): T | undefined;
  function getConfig<T>(key: string, parse?: (raw: unknown) => T) {
    const raw: unknown = store[key];
    if (raw === undefined) {
      return undefined;
    }
    return parse ? parse(raw) : raw;
  }

  return {
    runtime: {
      locale,
      pubsub: { subscribe },
      log: {
        debug: record("debug"),
        info: record("info"),
        warn: record("warn"),
        error: record("error"),
      },
      openUrl(url) {
        openedUrls.push(url);
      },
      dispatch,
    },
    pubsub: {
      publish(eventName, payload) {
        published.push({ eventName, payload });
      },
    },
    app: {
      getConfig,
      setConfig(key, value) {
        store[key] = value;
      },
    },
    emit({ eventName, payload }) {
      listeners.get(eventName)?.forEach((handler) => handler(payload));
    },
    published,
    logged,
    openedUrls,
  };
}
