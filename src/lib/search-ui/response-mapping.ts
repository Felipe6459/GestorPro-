import type { SearchResultGroup } from "@/lib/search/types";

/**
 * Global Search Stage 3 (docs/search-architecture.md §14, and this stage's
 * own explicit state contract). Pure — takes an already-parsed HTTP status
 * and JSON body, never a real `Response`/`fetch` call itself (that lives in
 * use-global-search.ts, where it's exercised end-to-end by the E2E suite
 * rather than a unit test — this project has no component/DOM-rendering
 * test infrastructure, see the Stage 3 report). Never re-derives ranking
 * or filtering — `groups` is passed through exactly as the backend
 * returned it (§4's contract), only reshaped into a discriminated union
 * the UI can switch on directly.
 */
export type SearchOutcome =
  | { kind: "success"; groups: SearchResultGroup[] }
  | { kind: "unauthorized" }
  | { kind: "rate_limited"; message: string }
  | { kind: "error" };

/** Never the real 401/403 body text ("Not authenticated."/"Not authorized.") — a signed-in staff user seeing an auth-flavored error inside a search box mid-keystroke would read as alarming/confusing for what's almost always a rare, transient session hiccup. */
export const SEARCH_UNAUTHORIZED_MESSAGE = "Something went wrong. Please refresh the page.";

/** Never the real 500 body text — a generic, never-Prisma, never-stack message, per docs/search-architecture.md §14. */
export const SEARCH_GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Matches the backend's own RATE_LIMIT_MESSAGE (src/lib/rate-limit/index.ts) verbatim — kept as an independent client-side copy rather than importing a server module into the client bundle just for one string constant; used only as a fallback if the response body is ever unparseable. */
const RATE_LIMIT_FALLBACK_MESSAGE = "Too many requests. Please try again later.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildSearchOutcome(status: number, body: unknown): SearchOutcome {
  if (status === 200) {
    const groups = isRecord(body) && Array.isArray(body.groups) ? (body.groups as SearchResultGroup[]) : [];
    return { kind: "success", groups };
  }

  if (status === 401 || status === 403) {
    return { kind: "unauthorized" };
  }

  if (status === 429) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : RATE_LIMIT_FALLBACK_MESSAGE;
    return { kind: "rate_limited", message };
  }

  return { kind: "error" };
}
