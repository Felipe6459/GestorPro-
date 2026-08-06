import { describe, expect, it } from "vitest";
import {
  buildSearchOutcome,
  SEARCH_UNAUTHORIZED_MESSAGE,
  SEARCH_GENERIC_ERROR_MESSAGE,
} from "@/lib/search-ui/response-mapping";

describe("buildSearchOutcome — success (200)", () => {
  it("passes the groups array through unmodified", () => {
    const groups = [{ type: "CLIENT" as const, items: [] }];
    expect(buildSearchOutcome(200, { query: "acme", groups })).toEqual({ kind: "success", groups });
  });

  it("falls back to an empty groups array when the body is malformed", () => {
    expect(buildSearchOutcome(200, null)).toEqual({ kind: "success", groups: [] });
    expect(buildSearchOutcome(200, {})).toEqual({ kind: "success", groups: [] });
    expect(buildSearchOutcome(200, { groups: "not-an-array" })).toEqual({ kind: "success", groups: [] });
  });
});

describe("buildSearchOutcome — 401/403 mapping", () => {
  it("maps 401 to unauthorized", () => {
    expect(buildSearchOutcome(401, { error: "Not authenticated." })).toEqual({ kind: "unauthorized" });
  });

  it("maps 403 to unauthorized", () => {
    expect(buildSearchOutcome(403, { error: "Not authorized." })).toEqual({ kind: "unauthorized" });
  });

  it("never surfaces the raw backend auth message", () => {
    const outcome = buildSearchOutcome(401, { error: "Not authenticated." });
    expect(JSON.stringify(outcome)).not.toContain("Not authenticated");
    expect(SEARCH_UNAUTHORIZED_MESSAGE).not.toContain("authenticated");
  });
});

describe("buildSearchOutcome — 429 mapping", () => {
  it("passes through the backend's own rate-limit message", () => {
    expect(buildSearchOutcome(429, { error: "Too many requests. Please try again later." })).toEqual({
      kind: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
  });

  it("falls back to a generic rate-limit message if the body is malformed", () => {
    const outcome = buildSearchOutcome(429, null);
    expect(outcome.kind).toBe("rate_limited");
    expect(outcome.kind === "rate_limited" && outcome.message.length > 0).toBe(true);
  });
});

describe("buildSearchOutcome — 500 and unrecognized statuses", () => {
  it("maps 500 to a generic error", () => {
    expect(buildSearchOutcome(500, { error: "Internal server error, stack trace, etc." })).toEqual({ kind: "error" });
  });

  it("never surfaces the raw backend error body for a 500", () => {
    const outcome = buildSearchOutcome(500, { error: "raw prisma stack trace" });
    expect(JSON.stringify(outcome)).not.toContain("prisma");
    expect(SEARCH_GENERIC_ERROR_MESSAGE).not.toContain("prisma");
  });

  it("maps any other unexpected status to a generic error rather than throwing", () => {
    expect(buildSearchOutcome(418, {})).toEqual({ kind: "error" });
    expect(buildSearchOutcome(0, undefined)).toEqual({ kind: "error" });
  });
});

describe("buildSearchOutcome — stable response shape", () => {
  it("a successful response's groups are referentially the same array passed in (no copying/mutation)", () => {
    const groups = [{ type: "PROJECT" as const, items: [] }];
    const outcome = buildSearchOutcome(200, { groups });
    expect(outcome.kind === "success" && outcome.groups).toBe(groups);
  });
});
