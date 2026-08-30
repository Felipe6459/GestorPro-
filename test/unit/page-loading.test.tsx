import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RouteLoadingAnnouncement,
  EditPageHeaderSkeleton,
  PageHeadingSkeleton,
  FormCardSkeleton,
  TableRowsSkeleton,
} from "@/components/ui/page-loading";

/**
 * Product UI/UX PR 4 — genuine behavior-level render coverage for the
 * shared route-`loading.tsx` composition pieces (Product UI/UX Design
 * Investigation, finding F5: Client/Project/Task/Invoice `[id]/edit`
 * pages, Team, Settings/*, and Portal `/profile` had no `loading.tsx` at
 * all — a blank/flash transition instead of the list pages' existing
 * skeleton).
 *
 * This repo has no DOM/component-interaction harness (no
 * `@testing-library/react`/jsdom — see
 * invoice-issue-controls-contract.test.ts's own established precedent).
 * `renderToStaticMarkup` (react-dom/server, an existing dependency) is
 * used instead, exactly as record-list.test.tsx already established for
 * this repo's other presentation-only shared primitives.
 */

describe("RouteLoadingAnnouncement — the one real, non-decorative loading status per page boundary", () => {
  it("renders a real role=status/aria-live=polite element with the given label as visible-to-AT text", () => {
    const html = renderToStaticMarkup(<RouteLoadingAnnouncement label="Loading client" />);
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toContain("Loading client");
  });

  it("is visually hidden (sr-only), never aria-hidden — it must remain in the accessibility tree", () => {
    const html = renderToStaticMarkup(<RouteLoadingAnnouncement label="Loading team" />);
    expect(html).toMatch(/\bsr-only\b/);
    expect(html).not.toMatch(/aria-hidden/);
  });
});

describe("EditPageHeaderSkeleton — the title+Cancel/Back header shape shared by every [id]/edit page", () => {
  it("renders two decorative bars and no focusable/interactive element", () => {
    const html = renderToStaticMarkup(<EditPageHeaderSkeleton />);
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(barCount).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/<button|<a\s|<input|<select|<textarea/);
  });
});

describe("PageHeadingSkeleton — the stacked title/subtitle header shape shared by Team/Settings/Portal Profile", () => {
  it("renders title and subtitle placeholders, and no action placeholder by default", () => {
    const html = renderToStaticMarkup(<PageHeadingSkeleton />);
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(barCount).toBe(2);
  });

  it("renders one additional action placeholder when withAction is set (e.g. Team's Leave button, Settings/Notifications' Reset button)", () => {
    const html = renderToStaticMarkup(<PageHeadingSkeleton withAction />);
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(barCount).toBe(3);
  });

  it("renders no focusable/interactive fake control", () => {
    const html = renderToStaticMarkup(<PageHeadingSkeleton withAction />);
    expect(html).not.toMatch(/<button|<a\s|<input|<select|<textarea/);
  });
});

describe("FormCardSkeleton — the bordered form/detail card shared by edit pages, Settings forms, and Portal Profile sections", () => {
  it("renders the bordered card wrapper and exactly `fields` field-row placeholders (label+input pair each)", () => {
    const html = renderToStaticMarkup(<FormCardSkeleton fields={5} />);
    // Design System Phase 2 — the bordered card wrapper now uses the
    // shared CARD_SURFACE_CLASSES semantic tokens (border-border-default/
    // bg-surface/rounded-lg), not the old raw border-gray-200/bg-white.
    expect(html).toMatch(/\brounded-lg\b/);
    expect(html).toMatch(/\bborder-border-default\b/);
    expect(html).toMatch(/\bbg-surface\b/);
    expect(html).not.toMatch(/\bbg-white\b/);
    expect(html).not.toMatch(/\bborder-gray-\d+\b/);
    // Each field is a label bar + an input bar => 2 decorative elements,
    // plus the trailing submit-button bar (withButton defaults to true).
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(barCount).toBe(5 * 2 + 1);
  });

  it("omits the trailing button placeholder when withButton is false (Portal Profile's read-only sections have no submit control)", () => {
    const html = renderToStaticMarkup(<FormCardSkeleton fields={3} withButton={false} />);
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    expect(barCount).toBe(3 * 2);
  });

  it("renders an in-card heading placeholder when heading is set (Portal Profile's three sections each have one; the four [id]/edit pages don't)", () => {
    const withHeading = renderToStaticMarkup(<FormCardSkeleton fields={2} heading withButton={false} />);
    const withoutHeading = renderToStaticMarkup(<FormCardSkeleton fields={2} withButton={false} />);
    const withCount = (withHeading.match(/aria-hidden="true"/g) ?? []).length;
    const withoutCount = (withoutHeading.match(/aria-hidden="true"/g) ?? []).length;
    expect(withCount).toBe(withoutCount + 1);
  });

  it("renders no focusable/interactive fake control (no fake submit button, no fake input)", () => {
    const html = renderToStaticMarkup(<FormCardSkeleton fields={4} />);
    expect(html).not.toMatch(/<button|<a\s|<input|<select|<textarea/);
  });
});

describe("TableRowsSkeleton — the table-shaped placeholder used by Team's two tables and Settings/Notifications", () => {
  it("renders a header bar and `rows` rows of `columns` cell placeholders each", () => {
    const html = renderToStaticMarkup(<TableRowsSkeleton columns={5} rows={3} />);
    const barCount = (html.match(/aria-hidden="true"/g) ?? []).length;
    // 3 rows * 5 columns = 15 cell placeholders (the header bar itself is
    // a plain empty div, not a Skeleton, matching ListPageSkeleton's own
    // existing convention for its header strip).
    expect(barCount).toBe(15);
  });

  it("renders no focusable/interactive fake control and no real <table> element", () => {
    const html = renderToStaticMarkup(<TableRowsSkeleton columns={4} rows={2} />);
    expect(html).not.toMatch(/<button|<a\s|<input|<select|<textarea|<table/);
  });
});

describe("shared primitives — no new dependency, no hooks/effects/fetch", () => {
  it("page-loading.tsx imports only from react and this repo's own modules", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/ui/page-loading.tsx", "utf-8");
    const importLines = source.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      const fromMatch = line.match(/from\s+["']([^"']+)["']/);
      expect(fromMatch).not.toBeNull();
      const specifier = fromMatch![1];
      expect(specifier === "react" || specifier.startsWith("@/") || specifier.startsWith(".")).toBe(true);
    }
  });

  it("page-loading.tsx contains no hooks, no effects, no fetch, no Prisma, no Server Action, no client directive", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/ui/page-loading.tsx", "utf-8");
    expect(source).not.toMatch(/"use client"/);
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(source).not.toMatch(/useEffect|useState/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/from ["']@\/lib\/prisma["']/);
    expect(source).not.toMatch(/"use server"/);
    expect(source).not.toMatch(/setTimeout|setInterval|Math\.random|new Date\(\)|process\.env/);
  });
});
