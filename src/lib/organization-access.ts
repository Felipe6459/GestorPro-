/**
 * Platform Admin Organization Suspension, PR 1 (design investigation:
 * PLATFORM_ADMIN_ORGANIZATION_SUSPENSION_DESIGN). The one place the exact
 * meaning of "is this organization suspended" is written down, imported
 * by name at every one of the three independently-confirmed organization-
 * resolution paths (src/lib/current-user.ts's resolveActiveOrganizationId,
 * src/lib/current-portal-user.ts's resolvePortalIdentity,
 * src/lib/search/request-context.ts's getSearchRequestContext) — so a
 * future change to what "suspended" means only ever needs to change here.
 *
 * Deliberately a pure predicate over an already-fetched row, never a
 * function that itself queries — the three call sites already fetch
 * Organization.suspendedAt as part of a query they need for other reasons
 * anyway (a membership/client lookup), so a second, independent query here
 * would be pure waste. Deliberately NOT wrapped in React's cache(): unlike
 * identity resolution (genuinely immutable for one request's lifetime,
 * which is exactly why requirePlatformAdmin()/getVerifiedAuthUser() are
 * cache()-memoized), suspension state can change between requests — a
 * Platform Admin can suspend or reactivate at any moment — so caching it,
 * even within a single request, would risk observing a stale answer.
 *
 * Deliberately just a boolean decision, never a redirect/response of its
 * own: the three real call sites have genuinely different response
 * contracts (a page redirect for staff/Portal vs. a JSON 403 for search —
 * see getSearchRequestContext's own SearchRequestContext type). Forcing
 * one shared redirect-shaped helper across all three would repeat the
 * exact class of hidden-assumption mistake this codebase's own execution-
 * order lesson (PLATFORM_ADMIN_EXECUTION_AUTHORIZATION_AUDIT) already
 * corrected once — each caller applies this decision the way appropriate
 * to its own contract instead.
 *
 * Deliberately does NOT import "server-only": this module has no secret,
 * no cookie/session read, and no database access of its own — a pure
 * predicate over a field name and a fixed route string, safe by
 * construction wherever it's imported. Adding the marker anyway would buy
 * nothing and would incorrectly force every existing caller of
 * current-user.ts (which imports this module) to also mock "server-only"
 * in its own unit tests, breaking several that have no reason to know
 * this module exists.
 */
export function isOrganizationSuspended(organization: { suspendedAt: Date | null }): boolean {
  return organization.suspendedAt !== null;
}

/**
 * The one route every suspended-organization denial redirects to —
 * generic, accessible, discloses nothing (see that page's own doc
 * comment). A single shared constant so the three call sites, and the
 * page itself, can never drift out of sync with each other.
 */
export const ORGANIZATION_UNAVAILABLE_PATH = "/organization-unavailable";
