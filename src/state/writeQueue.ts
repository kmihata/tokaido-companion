/**
 * One write queue for every IndexedDB store.
 *
 * Every write in this app is read-modify-write, so two in flight can clobber
 * each other — ticking the last checklist box and immediately marking a day
 * prepared did exactly that, and the timestamp lost the race. Separate queues
 * per store would not help, because the failure is about ordering within a
 * store; one shared queue is simpler and the volume here is trivial.
 */
let queue: Promise<unknown> = Promise.resolve();

export function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}
