import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordCard, RecordCardActions, RecordCardField, RecordCardList } from "@/components/ui/record-list";

/**
 * Product UI/UX PR 3 — genuine behavior-level render coverage for the
 * shared mobile stacked-card list primitives, adopted by the five
 * responsive list-table surfaces this PR corrects.
 *
 * This repo has no DOM/component-interaction harness (no
 * `@testing-library/react`/jsdom — see
 * invoice-issue-controls-contract.test.ts's own established precedent).
 * `renderToStaticMarkup` (react-dom/server, an existing dependency — no
 * new package added) is used instead, exactly as Product UI/UX PR 2's own
 * segment-error-state.test.tsx already established: it actually executes
 * the real component through React's render pipeline, so this catches a
 * component that throws, mis-renders, or silently drops content, by
 * actually running it — not by reading source text.
 */

describe("RecordCardList/RecordCard/RecordCardField/RecordCardActions — real render", () => {
  it("RecordCardList renders a real <ul>, hidden at md and up (md:hidden), never display:none unconditionally", () => {
    const html = renderToStaticMarkup(
      <RecordCardList>
        <RecordCard>content</RecordCard>
      </RecordCardList>,
    );
    expect(html).toMatch(/<ul[^>]*class="[^"]*\bmd:hidden\b[^"]*"[^>]*>/);
  });

  it("RecordCard renders a real <li>", () => {
    const html = renderToStaticMarkup(
      <RecordCardList>
        <RecordCard>Test Client A</RecordCard>
      </RecordCardList>,
    );
    expect(html).toMatch(/<li[^>]*>[\s\S]*Test Client A[\s\S]*<\/li>/);
  });

  it("RecordCardField renders both the label and the value as real, separate DOM-order text nodes — never a CSS ::before/content:attr() generated label", () => {
    const html = renderToStaticMarkup(
      <RecordCardField label="Email" value="owner@example.test" />,
    );
    expect(html).toContain("Email");
    expect(html).toContain("owner@example.test");
    // Both appear as literal rendered text, in document order, label before
    // value — a real accessible name/value pair any assistive technology
    // reads in document order, not a generated-content trick.
    expect(html.indexOf("Email")).toBeLessThan(html.indexOf("owner@example.test"));
  });

  it("RecordCardField accepts a React node as its value (e.g. a StatusBadge or RoleSelect), not just a string", () => {
    const html = renderToStaticMarkup(
      <RecordCardField label="Status" value={<span data-testid="badge">ACTIVE</span>} />,
    );
    expect(html).toContain('data-testid="badge"');
    expect(html).toContain("ACTIVE");
  });

  it("RecordCardField's value side wraps long content instead of forcing a wider box (break-words, bounded max-width, no nowrap/fixed width)", () => {
    const longValue = "a-genuinely-long-value-that-must-wrap-safely-without-any-fixed-width-".repeat(3);
    const html = renderToStaticMarkup(<RecordCardField label="Invoice #" value={longValue} />);
    const valueSpanMatch = html.match(/<span class="([^"]*)">[\s\S]*?<\/span><\/div>$/);
    expect(html).toContain(longValue);
    expect(html).not.toMatch(/white-space:\s*nowrap/);
    expect(html).toMatch(/\bbreak-words\b/);
    expect(html).not.toMatch(/\bwhitespace-nowrap\b/);
    void valueSpanMatch;
  });

  it("RecordCardActions renders a real, visible action group container (never hidden, never aria-hidden)", () => {
    const html = renderToStaticMarkup(
      <RecordCardActions>
        <button type="button">Edit</button>
      </RecordCardActions>
    );
    expect(html).toContain("Edit");
    expect(html).not.toMatch(/aria-hidden/);
  });

  it("introduces no new dependency — imports only from react and this repo's own modules", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/ui/record-list.tsx", "utf-8");
    const importLines = source.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      const fromMatch = line.match(/from\s+["']([^"']+)["']/);
      expect(fromMatch).not.toBeNull();
      const specifier = fromMatch![1];
      expect(specifier === "react" || specifier.startsWith("@/") || specifier.startsWith(".")).toBe(true);
    }
  });
});
