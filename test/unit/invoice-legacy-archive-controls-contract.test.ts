import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-contract coverage for InvoiceLegacyArchiveControls's own
 * client-side rejection handling — mirrors
 * invoice-issue-controls-contract.test.ts exactly (see that file's own
 * header comment for why this repo verifies at the source level rather
 * than via a DOM/component-interaction harness).
 */

const source = readFileSync("src/components/invoices/invoice-legacy-archive-controls.tsx", "utf-8");

describe("InvoiceLegacyArchiveControls — client Server Action rejection handling (source contract)", () => {
  it("wraps the archiveLegacyInvoiceAction() call in try/catch", () => {
    const callIndex = source.indexOf("await archiveLegacyInvoiceAction(");
    expect(callIndex).toBeGreaterThan(-1);
    const precedingTry = source.lastIndexOf("try {", callIndex);
    expect(precedingTry).toBeGreaterThan(-1);
    const between = source.slice(precedingTry, callIndex);
    expect(between).not.toContain("await ");
  });

  it("the catch block never references the caught error (no thrown detail is ever surfaced to the UI)", () => {
    const catchMatch = source.match(/\}\s*catch\s*\{([\s\S]*?)\n\s{6}\}/);
    expect(catchMatch).not.toBeNull();
    const catchBody = catchMatch![1];
    expect(source).toMatch(/\}\s*catch\s*\{/);
    expect(catchBody).not.toMatch(/\.message\b/);
  });

  it("the catch block shows the same generic safe failure toast used elsewhere in this component, never a distinct message", () => {
    const catchMatch = source.match(/\}\s*catch\s*\{([\s\S]*?)\n\s{6}\}/);
    const catchBody = catchMatch![1];
    expect(catchBody).toContain('showToast("Could not archive this invoice — try again.", "error")');
  });

  it("the catch block never calls router.refresh() or re-invokes archiveLegacyInvoiceAction() — no implicit retry", () => {
    const catchMatch = source.match(/\}\s*catch\s*\{([\s\S]*?)\n\s{6}\}/);
    const catchBody = catchMatch![1];
    expect(catchBody).not.toContain("router.refresh()");
    expect(catchBody).not.toContain("archiveLegacyInvoiceAction(");
  });

  it("archiveLegacyInvoiceAction is called exactly once per runArchive() invocation — the catch path returns rather than looping", () => {
    const occurrences = source.match(/archiveLegacyInvoiceAction\(/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it("both ARCHIVED and ALREADY_ARCHIVED outcomes are treated as non-alarming success — neither branch shows an error toast", () => {
    const resultOkMatch = source.match(/if \(result\.ok\) \{([\s\S]*?)\n\s{6}\}/);
    expect(resultOkMatch).not.toBeNull();
    const body = resultOkMatch![1];
    expect(body).not.toMatch(/"error"/);
    expect(body).toContain("router.refresh()");
    expect(body).toMatch(/ARCHIVED/);
    expect(body).toMatch(/ALREADY_ARCHIVED/);
  });

  it("never displays a raw error/path/provider value — only fixed literal toast strings appear in every failure branch", () => {
    // Every showToast(...) call in this file's failure branches must be a
    // fixed string literal — never string concatenation/interpolation of
    // anything from the Server Action's own result.
    const showToastCalls = [...source.matchAll(/showToast\(([^,]+),/g)].map((m) => m[1].trim());
    for (const arg of showToastCalls) {
      expect(arg.startsWith('"') || arg.startsWith("result.outcome ===")).toBe(true);
    }
  });

  it("is a Client Component that never imports a server-only PDF module", () => {
    expect(source).toMatch(/^"use client";/m);
    expect(source).not.toContain("@/lib/invoices/pdf");
  });
});
