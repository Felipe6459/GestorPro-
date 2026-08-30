import { describe, expect, it, vi } from "vitest";
import { createLatestModePersistenceCoordinator } from "@/lib/theme/persist-latest-mode-coordinator";

/**
 * No real timers/network anywhere in this file — every persist() call is
 * a manually-controlled Promise (via an explicit deferred/resolvers
 * array), so ordering is deterministic and each test only ever awaits
 * exactly the microtask ticks it needs.
 */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets a test await "everything that's already scheduled has run" without a real timer. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createLatestModePersistenceCoordinator", () => {
  it("persists a single request", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("dark");
    await flushMicrotasks();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("dark");
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "dark" });
    expect(coordinator.isPersisting()).toBe(false);
  });

  it("never issues more than one persist() call at a time", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("light");
    expect(coordinator.isPersisting()).toBe(true);

    // A second, third, fourth rapid change while the first write is still
    // in flight must NOT start a second concurrent persist() call.
    coordinator.request("dark");
    coordinator.request("system");
    expect(persist).toHaveBeenCalledTimes(1);

    d1.resolve();
    await flushMicrotasks();
    await flushMicrotasks();

    // Only the LATEST queued value ("system") is persisted next — "dark"
    // (an intermediate value) is never separately written.
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenNthCalledWith(1, "light");
    expect(persist).toHaveBeenNthCalledWith(2, "system");
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "system" });
  });

  it("collapses many rapid changes during one in-flight write into a single follow-up persist of the final value", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("light");
    coordinator.request("dark");
    coordinator.request("system");
    coordinator.request("automatic"); // the actually-latest value, different from "light"

    d1.resolve();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenNthCalledWith(2, "automatic");
  });

  it("skips the follow-up write entirely when a rapid sequence cycles back to the value already being persisted", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("light");
    coordinator.request("dark");
    coordinator.request("system");
    coordinator.request("light"); // cycles all the way back to what's already in flight

    d1.resolve();
    await flushMicrotasks();
    await flushMicrotasks();

    // "light" is already what's being (and was just) persisted — no
    // wasted second write for a value that's already correct.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "light" });
  });

  it("skips a redundant follow-up write when the queued value equals what was just persisted", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("dark");
    coordinator.request("dark"); // same value queued while in flight

    d1.resolve();
    await flushMicrotasks();
    await flushMicrotasks();

    // The queued "dark" already matches what was just persisted — no
    // second, wasted network call for an identical value.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "dark" });
  });

  it("terminates boundedly on failure: does not retry automatically, and discards anything queued during the failed attempt", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("dark");
    coordinator.request("system"); // queued while the first attempt is in flight

    const error = new Error("network down");
    d1.reject(error);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(coordinator.getLastOutcome()).toEqual({ ok: false, mode: "dark", error });
    expect(coordinator.isPersisting()).toBe(false);

    // No further persist() call ever happens on its own.
    await flushMicrotasks();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("a later, genuine new request() after a failure can succeed normally", async () => {
    const failure = new Error("network down");
    const persist = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("dark");
    await flushMicrotasks();
    expect(coordinator.getLastOutcome()).toEqual({ ok: false, mode: "dark", error: failure });

    coordinator.request("light");
    await flushMicrotasks();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "light" });
  });

  it("never produces an out-of-order final result: many overlapping requests always converge to the single, actually-latest value", async () => {
    const persistedOrder: string[] = [];
    const persist = vi.fn(async (mode: string) => {
      persistedOrder.push(mode);
    });
    const coordinator = createLatestModePersistenceCoordinator(persist);

    coordinator.request("light");
    coordinator.request("dark");
    coordinator.request("system");

    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    // Whatever intermediate calls happened, the LAST entry in the
    // persisted sequence — and the coordinator's own final recorded
    // outcome — must be the actually-latest requested value.
    expect(persistedOrder.at(-1)).toBe("system");
    expect(coordinator.getLastOutcome()).toEqual({ ok: true, mode: "system" });
  });

  it("reports isPersisting() accurately across a request/settle cycle", async () => {
    const d1 = deferred<void>();
    const persist = vi.fn().mockReturnValueOnce(d1.promise);
    const coordinator = createLatestModePersistenceCoordinator(persist);

    expect(coordinator.isPersisting()).toBe(false);
    coordinator.request("dark");
    expect(coordinator.isPersisting()).toBe(true);

    d1.resolve();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(coordinator.isPersisting()).toBe(false);
  });

  it("getLastOutcome() is null before any request has settled", () => {
    const coordinator = createLatestModePersistenceCoordinator(vi.fn().mockResolvedValue(undefined));
    expect(coordinator.getLastOutcome()).toBeNull();
  });
});
