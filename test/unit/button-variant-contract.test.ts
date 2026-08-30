import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Correction — Invoice System Slice 4 post-deploy fix. A production defect
 * (reproduced directly: real computed styles showed color:rgb(255,255,255)
 * on backgroundColor:rgb(255,255,255) — genuinely invisible button text)
 * traced to Button's own base classes ("bg-black ... text-white") and a
 * caller-appended override className ("bg-white text-gray-900 ...")
 * sharing equal CSS specificity — which one wins a same-specificity
 * conflict is decided by the compiled stylesheet's own utility order (a
 * Tailwind content-scan/build-time detail), never by the className
 * string's own left-to-right order. `variant` replaces that fragile
 * pattern with a set of mutually exclusive class strings — exactly one is
 * ever rendered per element — that can never combine to conflict at all.
 * A third variant (dangerOutline) was added in the consistency-pass
 * follow-up to close the same latent risk on InvoiceLifecycleControls'
 * Cancel invoice button, which used a distinct text-red-600 override.
 *
 * No DOM/component-rendering harness exists in this repo (see
 * invoice-issue-controls-contract.test.ts's own header comment) — this is
 * therefore a source-contract proxy, same as every other component test
 * here, plus a real computed-style E2E proof (test/e2e/invoices.spec.ts).
 */

const source = readFileSync("src/components/ui/button.tsx", "utf8");

const ALL_VARIANTS = ["primary", "secondary", "dangerOutline"] as const;
type Variant = (typeof ALL_VARIANTS)[number];

function extractClassValue(variant: Variant): string {
  const match = source.match(new RegExp(`${variant}:\\s*"([^"]*)"`));
  expect(match).not.toBeNull();
  return match![1];
}

// Matches a genuine Tailwind color utility (bg-black, text-white,
// bg-gray-900, text-red-500, ...) — deliberately excludes non-color
// text-* utilities that share the same prefix (text-sm, text-center,
// text-left, ...), which are sizing/alignment, not color, and must never
// be flagged as a same-property conflict. "accent"/"surface"/"danger" are
// Aqenra custom Tailwind v4 theme colors (globals.css's --color-accent /
// --color-surface / --color-danger) — without them here, bg-accent/
// bg-surface would silently stop being recognized as color utilities at
// all, quietly disabling this test's own "background and foreground
// utilities must never be the same color" check for exactly the variants
// (primary, then secondary/dangerOutline via Design System Phase 2) this
// same historical bug originally hit. "text-text-primary"/
// "text-text-secondary" (etc.) are matched via the trailing
// `(-[a-z]+)?` group — Tailwind's own semantic-category-echoes-prefix
// naming quirk (see globals.css's own comment on this), not a mistake.
const COLOR_UTILITY_PATTERN =
  /^(bg|text)-(black|white|transparent|current|inherit|accent|surface|danger(-subtle)?|text-(primary|secondary|muted|inverse)|[a-z]+-\d{2,3})$/;

function tailwindColorUtilities(classString: string): string[] {
  return classString.split(/\s+/).filter((cls) => COLOR_UTILITY_PATTERN.test(cls));
}

describe("Button — variant classes never overlap on the same color utility (contract)", () => {
  it("every variant exists as a distinct, non-empty class string", () => {
    for (const variant of ALL_VARIANTS) {
      expect(extractClassValue(variant).length).toBeGreaterThan(0);
    }
  });

  it("no variant's own class string is itself internally self-conflicting (at most one bg-* and one text-* utility each, and never the identical utility for both)", () => {
    // Two DIFFERENT variants sharing a bg-* or text-* utility (e.g.
    // secondary and dangerOutline both using bg-white) is fine and
    // expected — variant is a single mutually-exclusive selection, so two
    // variants' classes are never both applied to one element at once.
    // The real invariant carried over from the original bug is narrower:
    // within ONE variant's own class string, its background and
    // foreground utilities must never be the same color (that is what
    // "invisible button text" actually means), and neither utility may
    // appear more than once (which would itself be ambiguous).
    for (const variant of ALL_VARIANTS) {
      const colors = tailwindColorUtilities(extractClassValue(variant));
      const bg = colors.filter((c) => c.startsWith("bg-"));
      const text = colors.filter((c) => c.startsWith("text-"));
      expect(bg.length).toBeLessThanOrEqual(1);
      expect(text.length).toBeLessThanOrEqual(1);
      if (bg.length === 1 && text.length === 1) {
        expect(bg[0].replace(/^bg-/, "")).not.toBe(text[0].replace(/^text-/, ""));
      }
    }
  });

  it("the default variant is primary, so every existing caller that never passed `variant` renders unchanged", () => {
    expect(source).toMatch(/variant\s*=\s*"primary"/);
  });

  it("the rendered className applies the resolved variant classes, never a hardcoded color utility outside VARIANT_CLASSES", () => {
    const renderedTemplate = source.match(/className=\{`([^`]*)`\}/);
    expect(renderedTemplate).not.toBeNull();
    const literalColorUtilities = tailwindColorUtilities(renderedTemplate![1]);
    expect(literalColorUtilities).toEqual([]);
  });

  // Aqenra brand PR 2 — the primary variant's own accent color, proven
  // directly rather than only via the generic same-color-conflict check
  // above: it must use the Aqenra accent tokens (globals.css), never the
  // old bg-black/hover:bg-gray-800 pair.
  it("the primary variant uses the Aqenra accent tokens, not the old black background", () => {
    const primary = extractClassValue("primary");
    expect(primary).toContain("bg-accent");
    expect(primary).toContain("hover:bg-accent-hover");
    expect(primary).not.toMatch(/\bbg-black\b/);
    expect(primary).not.toMatch(/hover:bg-gray-800\b/);
    // White foreground is unchanged by this brand correction.
    expect(primary).toContain("text-white");
  });

  // Design System Phase 2 — secondary/dangerOutline's raw
  // border-gray-300/bg-white/text-gray-900/text-red-600 are replaced with
  // semantic tokens so both variants render correctly on Dark's own
  // surface. text-danger (not a literal red) is deliberate: it's a text
  // color, never a solid white-on-fill button background — see this
  // variant's own doc comment in button.tsx for why --danger specifically
  // must not be used that way.
  it("secondary and dangerOutline use semantic surface/border/text tokens, never the old raw grays", () => {
    for (const variant of ["secondary", "dangerOutline"] as const) {
      const classes = extractClassValue(variant);
      expect(classes).toContain("bg-surface");
      expect(classes).toContain("border-border-strong");
      expect(classes).not.toMatch(/\bbg-white\b/);
      expect(classes).not.toMatch(/\btext-gray-\d+\b/);
      expect(classes).not.toMatch(/\bborder-gray-\d+\b/);
      expect(classes).not.toMatch(/hover:bg-gray-\d+\b/);
    }
    expect(extractClassValue("secondary")).toContain("text-text-primary");
    expect(extractClassValue("dangerOutline")).toContain("text-danger");
    expect(extractClassValue("dangerOutline")).not.toMatch(/\btext-red-\d+\b/);
  });

  // The shared focus-visible ring (rendered outside VARIANT_CLASSES, in
  // the button's own base classes) must use the semantic --focus-ring
  // token, not the old literal black — illegible on a Dark surface.
  it("the shared focus-visible ring uses the semantic focus-ring token, not the old literal black", () => {
    const renderedTemplate = source.match(/className=\{`([^`]*)`\}/);
    expect(renderedTemplate).not.toBeNull();
    expect(renderedTemplate![1]).toContain("focus-visible:ring-focus-ring");
    expect(renderedTemplate![1]).not.toMatch(/focus-visible:ring-black\b/);
  });
});
