/**
 * Platform Admin Organization Suspension — confirmation-phrase contract.
 *
 * Design correction (ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN): the
 * Suspend confirmation no longer compares against Organization.name at
 * all. That field is a customer-facing display/brand name — used
 * verbatim in invoice PDFs and notification-email copy — genuinely
 * long, arbitrarily punctuated, and (per this feature's own two prior
 * hotfixes) never reliably retypeable. Organization.slug is the sole
 * organization-specific identifier used here instead: DB-unique,
 * immutable after creation, and produced by slugify() (src/lib/
 * current-user.ts) as lowercase ASCII `[a-z0-9-]` only — structurally
 * immune to the entire class of browser/OS text-substitution bugs
 * (smart quotes, autocapitalize, curly-vs-straight punctuation) that
 * affected the name-based contract, since a slug contains no character
 * any of those features would ever rewrite.
 *
 * The expected value is the fixed phrase `SUSPEND <slug>` — never a
 * bare slug alone (keeps a clear, explicit verb signaling destructive
 * intent, the same "type a specific phrase" shape most products use for
 * this class of confirmation) and never the organization's own name.
 *
 * This module holds only pure, deterministic string comparison —
 * independently unit-testable without a DOM/rendering environment (this
 * repo's unit Vitest config runs in `environment: "node"`, no jsdom).
 * The component calls these exact same functions, so a unit test
 * proving their behavior is proving real runtime behavior. No server,
 * database, network, or environment dependency of any kind.
 *
 * The comparison itself is deliberately never weakened: no `.trim()`,
 * no case-folding, no substring match, no Unicode normalization — exact
 * string identity against the derived phrase only.
 */

/** Deterministically derives the exact phrase an operator must type, from the organization's own slug — Organization.name is never an input here. */
export function buildSuspendConfirmationPhrase(slug: string): string {
  return `SUSPEND ${slug}`;
}

/** The one authoritative equality rule: exact, unmodified string identity against the derived phrase. */
export function suspendConfirmationMatches(confirmText: string, slug: string): boolean {
  return confirmText === buildSuspendConfirmationPhrase(slug);
}

/** Mirrors OrganizationSuspensionControls' own gating: a reason must be selected AND the typed text must exactly match the derived phrase. */
export function canConfirmSuspend(confirmText: string, slug: string, reasonCode: string): boolean {
  return suspendConfirmationMatches(confirmText, slug) && reasonCode !== "";
}

/**
 * True only once the operator has typed something and it still doesn't
 * match — deliberately never true for an empty field (that's simply
 * "not started yet," not a mismatch worth calling out before the
 * operator has typed anything at all).
 */
export function showsPhraseMismatch(confirmText: string, slug: string): boolean {
  return confirmText.length > 0 && !suspendConfirmationMatches(confirmText, slug);
}
