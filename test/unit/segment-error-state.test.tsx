import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentErrorState } from "@/components/ui/segment-error-state";

/**
 * Product UI/UX PR 2 — genuine behavior-level render coverage for the
 * shared segment error-boundary presentation, adopted by the two new
 * `(platform-admin)/error.tsx` and `portal/(app)/error.tsx` boundaries.
 *
 * This repo has no DOM/component-interaction harness (no
 * `@testing-library/react`/jsdom — see
 * invoice-issue-controls-contract.test.ts's own established precedent),
 * so a real click-simulated "reset gets invoked" proof is not expressible
 * here. `renderToStaticMarkup` (react-dom/server, already an existing
 * dependency — no new package added) is used instead for genuine
 * behavior-level proof: it actually executes the real component function,
 * including its hooks (`useId`), through React's real render pipeline —
 * unlike a source-contract test, this catches a component that throws,
 * renders the wrong text, or fails to omit sensitive content, by actually
 * running it. Its one real limitation: server-rendered static markup
 * never includes event handlers (onClick is stripped from the output by
 * design), so this file cannot behaviorally prove a click invokes
 * `reset()` — that specific invariant is covered by the companion
 * source-contract test (segment-error-boundaries-adoption-contract.test.ts),
 * which proves the exact wiring (`onClick={() => reset()}`, nothing else),
 * plus this repo's real production build and existing E2E regression
 * suite (see this PR's own report for the full disclosed limitation).
 *
 * "use client" is a bundler/RSC-boundary directive consumed by Next.js's
 * own build tooling — it has no effect when the component is imported and
 * rendered directly here, outside that pipeline; React renders it as an
 * ordinary function component.
 */

const SENSITIVE_MESSAGE = "SENSITIVE_MARKER_MESSAGE_organizationId_9f2c";
const SENSITIVE_STACK = "SENSITIVE_MARKER_STACK at /src/lib/prisma.ts:42";
const SENSITIVE_DIGEST = "SENSITIVE_MARKER_DIGEST_abcd1234";
const SENSITIVE_CAUSE_MESSAGE = "SENSITIVE_MARKER_CAUSE_client_email@example.com";

function makeSensitiveError(): Error & { digest?: string } {
  const cause = new Error(SENSITIVE_CAUSE_MESSAGE);
  const error = new Error(SENSITIVE_MESSAGE, { cause }) as Error & { digest?: string };
  error.stack = SENSITIVE_STACK;
  error.digest = SENSITIVE_DIGEST;
  return error;
}

describe("SegmentErrorState — real render, never leaks raw error content", () => {
  it("renders a calm English heading and the supplied description", () => {
    const html = renderToStaticMarkup(
      <SegmentErrorState error={makeSensitiveError()} reset={() => {}} description="We couldn't load this page. Please try again." />,
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("We couldn&#x27;t load this page. Please try again.");
  });

  it("renders a visible \"Try again\" control", () => {
    const html = renderToStaticMarkup(
      <SegmentErrorState error={makeSensitiveError()} reset={() => {}} description="Test description." />,
    );
    expect(html).toContain("Try again");
    expect(html).toMatch(/<button[^>]*>[\s\S]*Try again[\s\S]*<\/button>/);
  });

  it("uses the shared Button component's primary (Aqenra accent) variant classes — matches existing app conventions", () => {
    const html = renderToStaticMarkup(
      <SegmentErrorState error={makeSensitiveError()} reset={() => {}} description="Test description." />,
    );
    const buttonMatch = html.match(/<button[^>]*class="([^"]*)"[^>]*>/);
    expect(buttonMatch).not.toBeNull();
    // Aqenra brand PR 2 — Button's primary variant moved from bg-black to
    // the Aqenra accent token (src/components/ui/button.tsx). Still
    // proving the same thing this test always proved: SegmentErrorState
    // genuinely reuses the shared Button component's real primary
    // variant, not a hand-rolled duplicate.
    expect(buttonMatch![1]).toContain("bg-accent");
    expect(buttonMatch![1]).toContain("focus-visible:ring-2");
  });

  it("renders an accessible alert region with a labelled heading", () => {
    const html = renderToStaticMarkup(
      <SegmentErrorState error={makeSensitiveError()} reset={() => {}} description="Test description." />,
    );
    expect(html).toMatch(/role="alert"/);
    const labelledByMatch = html.match(/aria-labelledby="([^"]+)"/);
    expect(labelledByMatch).not.toBeNull();
    expect(html).toContain(`id="${labelledByMatch![1]}"`);
  });

  it("never renders error.message, error.stack, error.cause's message, or error.digest anywhere in the output, even though all four are populated with identifiable content", () => {
    const html = renderToStaticMarkup(
      <SegmentErrorState error={makeSensitiveError()} reset={() => {}} description="Test description." />,
    );
    expect(html).not.toContain(SENSITIVE_MESSAGE);
    expect(html).not.toContain(SENSITIVE_STACK);
    expect(html).not.toContain(SENSITIVE_DIGEST);
    expect(html).not.toContain(SENSITIVE_CAUSE_MESSAGE);
    expect(html).not.toContain("organizationId");
    expect(html).not.toContain("@example.com");
  });

  it("never renders a JSON/stringified serialization of the error object", () => {
    const error = makeSensitiveError();
    const html = renderToStaticMarkup(<SegmentErrorState error={error} reset={() => {}} description="Test description." />);
    expect(html).not.toContain(JSON.stringify(error.message));
    expect(html).not.toMatch(/\{"message":|\{"stack":|\{"digest":/);
  });

  it("renders successfully even when error.digest is undefined (a Client Component-originated error may have no digest)", () => {
    const error = new Error("client error, no digest") as Error & { digest?: string };
    expect(() => renderToStaticMarkup(<SegmentErrorState error={error} reset={() => {}} description="Test description." />)).not.toThrow();
  });
});
