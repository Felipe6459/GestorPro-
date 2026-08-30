import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardError from "@/app/(dashboard)/error";

/**
 * Design System Batch 5 — (dashboard)/error.tsx's own visual migration
 * (bg-surface/border-border-strong/text-text-primary/text-text-secondary,
 * raw <button> -> shared <Button>). Mirrors root-error-boundary.test.tsx's
 * own real-render pattern (renderToStaticMarkup, not a class-string
 * snapshot) rather than a live E2E trigger — this project's own testing
 * conventions reserve E2E for genuinely interactive behavior, and there is
 * no deterministic, non-Production way to force a real render-time throw
 * inside this boundary's own segment.
 */
describe("(dashboard)/error.tsx — real render, Batch 5", () => {
  it("is a real Client Component (source has the \"use client\" directive)", () => {
    const source = readFileSync("src/app/(dashboard)/error.tsx", "utf-8");
    expect(source).toMatch(/^"use client";/);
  });

  it("renders the semantic surface, a heading, and a Try again control", () => {
    const html = renderToStaticMarkup(
      <DashboardError error={Object.assign(new Error("mock"), { digest: "mock-digest" })} reset={() => {}} />,
    );
    expect(html).toMatch(/<h2[^>]*>/);
    expect(html).toContain("Try again");
    expect(html).toContain("bg-surface");
    expect(html).toContain("text-text-primary");
    expect(html).toContain("text-text-secondary");
  });

  it("never renders the error's message, stack, cause, or digest", () => {
    const markerError = Object.assign(
      new Error("MARKER_MESSAGE_should_never_render_7a21"),
      { digest: "MARKER_DIGEST_should_never_render_4c02", cause: "MARKER_CAUSE_should_never_render_9e18" },
    );
    markerError.stack = "MARKER_STACK_should_never_render_2f60";

    const html = renderToStaticMarkup(<DashboardError error={markerError} reset={() => {}} />);

    expect(html).not.toContain("MARKER_MESSAGE_should_never_render_7a21");
    expect(html).not.toContain("MARKER_DIGEST_should_never_render_4c02");
    expect(html).not.toContain("MARKER_CAUSE_should_never_render_9e18");
    expect(html).not.toContain("MARKER_STACK_should_never_render_2f60");
  });

  it("renders exactly one button (Try again), no form/link", () => {
    const html = renderToStaticMarkup(<DashboardError error={new Error("mock")} reset={() => {}} />);
    const buttonMatches = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttonMatches).toHaveLength(1);
    expect(html).not.toMatch(/<form\b|<a\s+href/);
  });

  it("zero raw ordinary-theme classes remain", () => {
    const source = readFileSync("src/app/(dashboard)/error.tsx", "utf-8");
    expect(source).not.toMatch(/bg-white|bg-gray-|text-gray-|border-gray-|bg-black|ring-black/);
  });
});
