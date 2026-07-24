# Changelog

## 1.2.0 — 2026-07-24

- **`createSerialLock()` — new SDK surface** (#27). A factory that queues async work so it runs one at a time. Plugin authors doing read-modify-write against their own files need this: two parallel calls otherwise read the same snapshot and one update is silently dropped. Three places in [receptron/mulmoclaude](https://github.com/receptron/mulmoclaude) carried a byte-identical hand-rolled copy (`bookmarks-plugin`, `recipe-book-plugin`, and the `create-mulmoclaude-plugin` scaffold template — so every generated plugin inherited another copy). Exported from the root entry alongside `runtime` / `schema`; no new subpath.

  ```ts
  import { createSerialLock } from "gui-chat-protocol";

  const withWriteLock = createSerialLock();

  await withWriteLock(async () => {
    const current = await read();
    await write(current + 1); // cannot interleave with another call
  });
  ```

  The `.catch(() => undefined)` on the chain head is load-bearing and easy to get wrong when hand-copied: it stops a rejected call from poisoning the queue, while the caller that queued the failing work still sees its own error. Both properties are pinned by tests, and the serialisation itself is mutation-verified (dropping it turns the read-modify-write test red with `actual: 1, expected: 3` — exactly the dropped-update bug).

- **`createUseT` is now actually executed by tests** (#26). The existing suite covered only the pure `pickMessages` half and explicitly excluded `createUseT` as "two lines of glue" — but those two lines were what 1.1.0 changed (throw when the host provides nothing → English fallback), and three mulmoclaude plugins had their behaviour changed on that basis without the function ever running under test. Using `app.runWithContext()` lets `inject()` resolve outside a component `setup`, so the behaviour is verified headlessly with no DOM and no mounting.

📦 npm: [`gui-chat-protocol@1.2.0`](https://www.npmjs.com/package/gui-chat-protocol/v/1.2.0)
