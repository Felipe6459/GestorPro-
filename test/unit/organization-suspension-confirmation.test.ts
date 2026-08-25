import { describe, expect, it } from "vitest";
import {
  suspendConfirmationMatches,
  canConfirmSuspend,
  showsNameMismatch,
} from "@/lib/platform-admin/organization-suspension-confirmation";

/**
 * Platform Admin Organization Suspension — confirmation-input hardening
 * hotfix. Proves the exact-name equality contract is never weakened
 * (no trim, no case-fold, no substring, no Unicode normalization) while
 * also proving the new visible-mismatch-feedback logic behaves exactly
 * as the component uses it. See organization-suspension-confirmation.ts's
 * own header for why this is a pure module rather than requiring a DOM
 * render.
 */

const ORG_NAME = "Acme, Inc.";

describe("suspendConfirmationMatches — the one authoritative equality rule", () => {
  it("matches only the exact string", () => {
    expect(suspendConfirmationMatches(ORG_NAME, ORG_NAME)).toBe(true);
  });

  it("is false for an empty string", () => {
    expect(suspendConfirmationMatches("", ORG_NAME)).toBe(false);
  });

  it("is false for a case-changed variant", () => {
    expect(suspendConfirmationMatches("acme, inc.", ORG_NAME)).toBe(false);
    expect(suspendConfirmationMatches("ACME, INC.", ORG_NAME)).toBe(false);
  });

  it("is false for a whitespace-changed variant (leading, trailing, and doubled internal space)", () => {
    expect(suspendConfirmationMatches(` ${ORG_NAME}`, ORG_NAME)).toBe(false);
    expect(suspendConfirmationMatches(`${ORG_NAME} `, ORG_NAME)).toBe(false);
    expect(suspendConfirmationMatches("Acme,  Inc.", ORG_NAME)).toBe(false);
  });

  it("is false for a straight-apostrophe vs curly-apostrophe mismatch — the leading Production hypothesis this hotfix targets", () => {
    const straight = "Alex's Workspace";
    const curly = "Alex’s Workspace"; // U+2019 RIGHT SINGLE QUOTATION MARK — what Safari's Smart Quotes silently substitutes
    expect(suspendConfirmationMatches(straight, straight)).toBe(true);
    expect(suspendConfirmationMatches(curly, straight)).toBe(false);
    expect(suspendConfirmationMatches(straight, curly)).toBe(false);
  });

  it("is false for a hyphen-minus vs en dash / em dash mismatch", () => {
    const hyphen = "Acme - Consulting";
    const enDash = "Acme – Consulting"; // U+2013 EN DASH
    const emDash = "Acme — Consulting"; // U+2014 EM DASH
    expect(suspendConfirmationMatches(enDash, hyphen)).toBe(false);
    expect(suspendConfirmationMatches(emDash, hyphen)).toBe(false);
  });

  it("is false for a straight double-quote vs curly double-quote mismatch", () => {
    const straight = 'The "Best" Co';
    const curly = "The “Best” Co"; // U+201C/U+201D curly double quotes
    expect(suspendConfirmationMatches(curly, straight)).toBe(false);
  });

  it("never coerces via trim, case-fold, or Unicode normalization — same code point sequence is the only thing that ever matches", () => {
    // NFC vs NFD forms of an accented character (é as U+00E9 vs "e" + combining acute U+0065 U+0301) are visually
    // identical and would be equal under Unicode normalization, but must NOT be treated as equal here.
    const nfc = "Café";
    const nfd = "Café";
    expect(nfc).not.toBe(nfd); // sanity: genuinely different code point sequences
    expect(suspendConfirmationMatches(nfd, nfc)).toBe(false);
  });
});

describe("canConfirmSuspend — gates on both an exact match AND a selected reason", () => {
  it("is false with an empty confirmation text, even with a reason selected", () => {
    expect(canConfirmSuspend("", ORG_NAME, "OTHER")).toBe(false);
  });

  it("is false with a reason of \"\" (none selected), even with an exact name match", () => {
    expect(canConfirmSuspend(ORG_NAME, ORG_NAME, "")).toBe(false);
  });

  it("is false when the name matches exactly but no reason is selected, and false when a reason is selected but the name doesn't match", () => {
    expect(canConfirmSuspend(ORG_NAME, ORG_NAME, "")).toBe(false);
    expect(canConfirmSuspend("wrong name", ORG_NAME, "OTHER")).toBe(false);
  });

  it("is true only when both an exact match and a non-empty reason are present", () => {
    expect(canConfirmSuspend(ORG_NAME, ORG_NAME, "OTHER")).toBe(true);
  });

  it("stays false for every mismatch variant even with a reason selected", () => {
    expect(canConfirmSuspend("acme, inc.", ORG_NAME, "OTHER")).toBe(false);
    expect(canConfirmSuspend(`${ORG_NAME} `, ORG_NAME, "OTHER")).toBe(false);
    expect(canConfirmSuspend("Alex’s Workspace", "Alex's Workspace", "OTHER")).toBe(false);
  });
});

describe("showsNameMismatch — bounded, non-empty-only mismatch signal", () => {
  it("is false for an empty field — not yet started, not a mismatch to call out", () => {
    expect(showsNameMismatch("", ORG_NAME)).toBe(false);
  });

  it("is false once the text exactly matches", () => {
    expect(showsNameMismatch(ORG_NAME, ORG_NAME)).toBe(false);
  });

  it("is true for any non-empty text that doesn't exactly match", () => {
    expect(showsNameMismatch("A", ORG_NAME)).toBe(true);
    expect(showsNameMismatch("acme, inc.", ORG_NAME)).toBe(true);
    expect(showsNameMismatch(`${ORG_NAME} `, ORG_NAME)).toBe(true);
  });

  it("clears the instant the text becomes an exact match again (simulated by two successive calls, as the component's own re-render would produce)", () => {
    expect(showsNameMismatch("Acme, Inc", ORG_NAME)).toBe(true); // missing trailing period
    expect(showsNameMismatch("Acme, Inc.", ORG_NAME)).toBe(false); // now exact
  });
});
