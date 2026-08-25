/**
 * Platform Admin Organization Suspension — confirmation-input hardening
 * hotfix (discovered during a paused, authorized Production Suspend
 * cycle: the exact-name confirmation field had no protection against
 * browser/OS text assistance, and gave no visible feedback when the
 * typed text simply didn't match — indistinguishable, from the
 * operator's side, from a client-side bug).
 *
 * This module holds OrganizationSuspensionControls' own comparison
 * logic, deliberately extracted so it is independently unit-testable
 * without a DOM/rendering environment — this repo's unit Vitest config
 * runs with `environment: "node"` (see vitest.config.mts), not jsdom,
 * and no React Testing Library dependency exists here. The component
 * imports and calls these exact same functions, so a unit test proving
 * their behavior is proving real runtime behavior, never a duplicate
 * reimplementation that could drift out of sync.
 *
 * The comparison itself is deliberately never weakened by this hotfix:
 * no `.trim()`, no case-folding, no Unicode normalization, no substring
 * match. A typed straight apostrophe (U+0027 ' ) is never treated as
 * equal to a typed curly one (U+2019 ' ), an en dash (U+2013) is never
 * equal to a hyphen-minus (U+002D), and no other visually-similar
 * variant is ever silently coerced into matching — see this module's
 * own tests for the exact set of such cases this is proven NOT to
 * conflate. Hardening lives entirely in (a) the input's own
 * autoCorrect/autoCapitalize/spellCheck attributes, which stop the
 * browser from silently rewriting what the operator actually typed
 * before it ever reaches this comparison, and (b) visible feedback when
 * the text still doesn't match — never in loosening the equality check
 * a real suspend action depends on.
 */

/** The one authoritative equality rule: exact, unmodified string identity. */
export function suspendConfirmationMatches(confirmText: string, organizationName: string): boolean {
  return confirmText === organizationName;
}

/** Mirrors OrganizationSuspensionControls' own gating: a reason must be selected AND the typed text must exactly match. */
export function canConfirmSuspend(confirmText: string, organizationName: string, reasonCode: string): boolean {
  return suspendConfirmationMatches(confirmText, organizationName) && reasonCode !== "";
}

/**
 * True only once the operator has typed something and it still doesn't
 * match — deliberately never true for an empty field (that's simply
 * "not started yet," not a mismatch worth calling out before the
 * operator has typed anything at all).
 */
export function showsNameMismatch(confirmText: string, organizationName: string): boolean {
  return confirmText.length > 0 && !suspendConfirmationMatches(confirmText, organizationName);
}
