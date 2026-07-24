/**
 * Serial lock — run async work one at a time.
 *
 * Plugins that do read-modify-write against their own files need the
 * steps serialised, or two parallel calls both read the same snapshot
 * and one update is silently dropped.
 */

/** Runs `fn` after every previously-queued call has settled. */
export type SerialLock = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates an independent lock. Each call queues behind the previous one,
 * so a read-modify-write cycle cannot interleave with another.
 *
 * ```ts
 * const withWriteLock = createSerialLock();
 * await withWriteLock(async () => {
 *   const current = await read();
 *   await write(current + 1);
 * });
 * ```
 *
 * A rejected call does not poison the queue: the chain head swallows the
 * rejection so the next caller still runs, while the caller that queued
 * the failing work still sees its own error (we return the un-swallowed
 * promise).
 */
export function createSerialLock(): SerialLock {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(fn);
    tail = next.catch(() => undefined);
    return next;
  };
}
