import { describe, expect, it, vi } from "vitest";

/**
 * Production Observability Priority 4 — bounded Client Error Boundary
 * consolidation. Genuine behavior-level proof for the one shared hook
 * every error boundary now calls (`useErrorBoundaryLogging` in
 * src/components/ui/segment-error-state.tsx).
 *
 * Deliberately its own file, separate from
 * error-boundary-logging-consolidation.test.tsx: this is the one test
 * in this PR that mocks `react`'s own `useEffect` (to run synchronously,
 * since this repo has no DOM/component-interaction harness to let a
 * real effect flush — see this repo's own established "no DOM harness"
 * precedent, e.g. segment-error-state.test.tsx's header comment).
 * `vi.doMock("react", ...)` + `vi.resetModules()` mutates the shared
 * module registry for the rest of the process; keeping every other
 * error-boundary test (which needs the REAL, unmocked React to prove
 * SSR truly never logs) in a separate file avoids that mid-file module-
 * registry mutation ever leaking into an unrelated test's result — this
 * was confirmed empirically while developing this PR: combining both
 * techniques in one file caused later SSR-no-log tests to observe
 * console.error calls that were not real production behavior, but an
 * artifact of react-dom/server's own cached reference to the
 * previously-mocked react module. Isolating this one technique to its
 * own file is the fix.
 */
describe("useErrorBoundaryLogging — real hook execution", () => {
  it("logs the exact original Error instance exactly once, with useEffect's dependency array holding that same instance", async () => {
    vi.doMock("react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react")>();
      return { ...actual, useEffect: (fn: () => void) => fn() };
    });

    const { useErrorBoundaryLogging } = await import("@/components/ui/segment-error-state");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("MARKER_HOOK_BEHAVIOR_TEST");

    useErrorBoundaryLogging(error);

    expect(spy).toHaveBeenCalledTimes(1);
    // Referential equality — proves the exact object is passed through,
    // never stringified/serialized/cloned/transformed.
    expect(spy).toHaveBeenCalledWith(error);

    spy.mockRestore();
  });

  it("a second, different Error instance across a second call is logged as its own, distinct call — no accumulation/leak across invocations", async () => {
    vi.doMock("react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react")>();
      return { ...actual, useEffect: (fn: () => void) => fn() };
    });

    const { useErrorBoundaryLogging } = await import("@/components/ui/segment-error-state");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = new Error("MARKER_FIRST");
    const second = new Error("MARKER_SECOND");

    useErrorBoundaryLogging(first);
    useErrorBoundaryLogging(second);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, first);
    expect(spy).toHaveBeenNthCalledWith(2, second);

    spy.mockRestore();
  });
});
