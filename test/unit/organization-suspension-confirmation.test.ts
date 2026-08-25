import { describe, expect, it } from "vitest";
import {
  buildSuspendConfirmationPhrase,
  suspendConfirmationMatches,
  canConfirmSuspend,
  showsPhraseMismatch,
} from "@/lib/platform-admin/organization-suspension-confirmation";

/**
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction. Proves the
 * confirmation contract is now keyed entirely to Organization.slug via
 * the fixed phrase `SUSPEND <slug>` — never Organization.name — and
 * that the exact-match equality is never weakened (no trim, no
 * case-fold, no substring, no Unicode normalization). See
 * organization-suspension-confirmation.ts's own header for why slug
 * (not name) is the sole identifier here.
 */

const SLUG = "acme-corp-a1b2c3d4";
const PHRASE = `SUSPEND ${SLUG}`;

describe("buildSuspendConfirmationPhrase — deterministic, slug-only derivation", () => {
  it("is exactly SUSPEND <slug>", () => {
    expect(buildSuspendConfirmationPhrase(SLUG)).toBe(PHRASE);
  });

  it("changes only with the slug", () => {
    expect(buildSuspendConfirmationPhrase("other-slug")).toBe("SUSPEND other-slug");
  });
});

describe("suspendConfirmationMatches — exact phrase equality, never organization-name matching", () => {
  it("matches the exact derived phrase", () => {
    expect(suspendConfirmationMatches(PHRASE, SLUG)).toBe(true);
  });

  it("is false for an empty string", () => {
    expect(suspendConfirmationMatches("", SLUG)).toBe(false);
  });

  it("is false when the SUSPEND prefix is missing (bare slug alone is not enough)", () => {
    expect(suspendConfirmationMatches(SLUG, SLUG)).toBe(false);
  });

  it("is false for the wrong slug, even with the correct prefix — this is the actual wrong-organization protection", () => {
    expect(suspendConfirmationMatches("SUSPEND wrong-slug", SLUG)).toBe(false);
  });

  it("is false for a case-changed variant of either the prefix or the slug", () => {
    expect(suspendConfirmationMatches(`suspend ${SLUG}`, SLUG)).toBe(false);
    expect(suspendConfirmationMatches(`SUSPEND ${SLUG.toUpperCase()}`, SLUG)).toBe(false);
  });

  it("is false for a whitespace-changed variant (leading, trailing, doubled internal space)", () => {
    expect(suspendConfirmationMatches(` ${PHRASE}`, SLUG)).toBe(false);
    expect(suspendConfirmationMatches(`${PHRASE} `, SLUG)).toBe(false);
    expect(suspendConfirmationMatches(`SUSPEND  ${SLUG}`, SLUG)).toBe(false);
  });

  it("is false with one extra trailing character", () => {
    expect(suspendConfirmationMatches(`${PHRASE}!`, SLUG)).toBe(false);
  });

  it("is false for organization-name-shaped text — the old, replaced contract — even paired with the correct prefix", () => {
    expect(suspendConfirmationMatches("Acme Corp", SLUG)).toBe(false);
    expect(suspendConfirmationMatches("SUSPEND Acme Corp", SLUG)).toBe(false);
    expect(suspendConfirmationMatches("Alex's Workspace", SLUG)).toBe(false);
  });

  it("never coerces via trim, case-fold, or Unicode normalization", () => {
    const nfc = "café-corp"; // é as U+00E9, precomposed
    const nfd = "café-corp"; // "e" + U+0301 combining acute accent — same rendered glyph, different code point sequence
    expect(nfc).not.toBe(nfd); // sanity: genuinely different code point sequences, not a typo
    expect(suspendConfirmationMatches(`SUSPEND ${nfd}`, nfc)).toBe(false);
  });
});

describe("canConfirmSuspend — gates on both an exact phrase match AND a selected reason", () => {
  it("is false with an empty confirmation text, even with a reason selected", () => {
    expect(canConfirmSuspend("", SLUG, "OTHER")).toBe(false);
  });

  it('is false with a reason of "" (none selected), even with an exact phrase match', () => {
    expect(canConfirmSuspend(PHRASE, SLUG, "")).toBe(false);
  });

  it("is true only when both an exact phrase match and a non-empty reason are present", () => {
    expect(canConfirmSuspend(PHRASE, SLUG, "OTHER")).toBe(true);
  });

  it("stays false for every mismatch variant even with a reason selected", () => {
    expect(canConfirmSuspend(SLUG, SLUG, "OTHER")).toBe(false);
    expect(canConfirmSuspend("SUSPEND wrong-slug", SLUG, "OTHER")).toBe(false);
    expect(canConfirmSuspend("Acme Corp", SLUG, "OTHER")).toBe(false);
  });
});

describe("showsPhraseMismatch — bounded, non-empty-only mismatch signal", () => {
  it("is false for an empty field — not yet started, not a mismatch to call out", () => {
    expect(showsPhraseMismatch("", SLUG)).toBe(false);
  });

  it("is false once the text exactly matches", () => {
    expect(showsPhraseMismatch(PHRASE, SLUG)).toBe(false);
  });

  it("is true for any non-empty text that doesn't exactly match", () => {
    expect(showsPhraseMismatch(SLUG, SLUG)).toBe(true);
    expect(showsPhraseMismatch("Acme Corp", SLUG)).toBe(true);
  });

  it("clears the instant the text becomes an exact match again", () => {
    expect(showsPhraseMismatch(`${PHRASE}!`, SLUG)).toBe(true);
    expect(showsPhraseMismatch(PHRASE, SLUG)).toBe(false);
  });
});

describe("Organization.name is not an input to this contract at all", () => {
  it("every exported function's own parameter list contains a slug, never an organization-name parameter — proven structurally by arity, not just by omission from these tests' own call sites", () => {
    expect(buildSuspendConfirmationPhrase).toHaveLength(1); // (slug)
    expect(suspendConfirmationMatches).toHaveLength(2); // (confirmText, slug)
    expect(canConfirmSuspend).toHaveLength(3); // (confirmText, slug, reasonCode)
    expect(showsPhraseMismatch).toHaveLength(2); // (confirmText, slug)
  });
});
