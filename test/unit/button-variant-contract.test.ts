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
 * pattern with two mutually exclusive class sets that can never both be
 * present on one element to conflict at all.
 *
 * No DOM/component-rendering harness exists in this repo (see
 * invoice-issue-controls-contract.test.ts's own header comment) — this is
 * therefore a source-contract proxy, same as every other component test
 * here, plus a real computed-style E2E proof (test/e2e/invoices.spec.ts).
 */

const source = readFileSync("src/components/ui/button.tsx", "utf8");

function extractClassValue(variant: "primary" | "secondary"): string {
  const match = source.match(new RegExp(`${variant}:\\s*"([^"]*)"`));
  expect(match).not.toBeNull();
  return match![1];
}

// Matches a genuine Tailwind color utility (bg-black, text-white,
// bg-gray-900, text-red-500, ...) — deliberately excludes non-color
// text-* utilities that share the same prefix (text-sm, text-center,
// text-left, ...), which are sizing/alignment, not color, and must never
// be flagged as a same-property conflict.
const COLOR_UTILITY_PATTERN = /^(bg|text)-(black|white|transparent|current|inherit|[a-z]+-\d{2,3})$/;

function tailwindColorUtilities(classString: string): string[] {
  return classString.split(/\s+/).filter((cls) => COLOR_UTILITY_PATTERN.test(cls));
}

describe("Button — variant classes never overlap on the same color utility (contract)", () => {
  it("the primary and secondary variants exist as distinct, non-empty class strings", () => {
    expect(extractClassValue("primary").length).toBeGreaterThan(0);
    expect(extractClassValue("secondary").length).toBeGreaterThan(0);
  });

  it("primary and secondary never share a bg-*/text-* utility — the exact class of conflict that produced invisible button text", () => {
    const primaryColors = tailwindColorUtilities(extractClassValue("primary"));
    const secondaryColors = tailwindColorUtilities(extractClassValue("secondary"));
    const overlap = primaryColors.filter((cls) => secondaryColors.includes(cls));
    expect(overlap).toEqual([]);
  });

  it("neither variant's own class string is itself internally self-conflicting (at most one bg-* and one text-* utility each)", () => {
    for (const variant of ["primary", "secondary"] as const) {
      const colors = tailwindColorUtilities(extractClassValue(variant));
      expect(colors.filter((c) => c.startsWith("bg-")).length).toBeLessThanOrEqual(1);
      expect(colors.filter((c) => c.startsWith("text-")).length).toBeLessThanOrEqual(1);
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
});
