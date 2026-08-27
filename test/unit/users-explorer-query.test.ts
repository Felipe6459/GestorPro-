import { describe, expect, it } from "vitest";
import { parseUserListParams, buildUserWhere, buildUserOrderBy, USER_SORT_FIELDS } from "@/lib/platform-admin/queries/users";

/**
 * Platform Admin Users Explorer, PR 1. Mirrors organization-explorer-
 * query.test.ts's own coverage of parseOrganizationListParams/
 * buildOrganizationWhere/buildOrganizationOrderBy for the equivalent
 * Users functions — same shape, same list-params.ts helpers underneath.
 */

describe("parseUserListParams", () => {
  it("defaults: empty q, name ascending, page 1", () => {
    expect(parseUserListParams({})).toEqual({
      q: "",
      sortField: "name",
      sortDir: "asc",
      sortCombined: "name:asc",
      page: 1,
    });
  });

  it("reads q, trimmed", () => {
    expect(parseUserListParams({ q: "  ada  " }).q).toBe("ada");
  });

  it("accepts every valid sort field", () => {
    for (const field of USER_SORT_FIELDS) {
      expect(parseUserListParams({ sort: `${field}:asc` }).sortField).toBe(field);
    }
  });

  it("accepts createdAt sort, both directions", () => {
    expect(parseUserListParams({ sort: "createdAt:desc" })).toMatchObject({ sortField: "createdAt", sortDir: "desc" });
    expect(parseUserListParams({ sort: "createdAt:asc" })).toMatchObject({ sortField: "createdAt", sortDir: "asc" });
  });

  it("an invalid sort field falls back to the default field (name), independent of direction", () => {
    const params = parseUserListParams({ sort: "notAField:desc" });
    expect(params.sortField).toBe("name");
    expect(params.sortDir).toBe("desc");
    expect(params.sortCombined).toBe("name:desc");
  });

  it("page below 1 falls back to 1", () => {
    expect(parseUserListParams({ page: "0" }).page).toBe(1);
    expect(parseUserListParams({ page: "-3" }).page).toBe(1);
  });

  it("a non-numeric page falls back to 1", () => {
    expect(parseUserListParams({ page: "not-a-number" }).page).toBe(1);
  });
});

describe("buildUserWhere", () => {
  it("empty q -> empty where (matches every user)", () => {
    expect(buildUserWhere({ q: "" })).toEqual({});
  });

  it("q -> case-insensitive OR across name and email only — never organization/membership/role fields", () => {
    const where = buildUserWhere({ q: "ada" });
    expect(where).toEqual({
      OR: [
        { name: { contains: "ada", mode: "insensitive" } },
        { email: { contains: "ada", mode: "insensitive" } },
      ],
    });
  });
});

describe("buildUserOrderBy", () => {
  it("name asc", () => {
    expect(buildUserOrderBy({ sortField: "name", sortDir: "asc" })).toEqual({ name: "asc" });
  });

  it("createdAt desc", () => {
    expect(buildUserOrderBy({ sortField: "createdAt", sortDir: "desc" })).toEqual({ createdAt: "desc" });
  });

  it("createdAt asc", () => {
    expect(buildUserOrderBy({ sortField: "createdAt", sortDir: "asc" })).toEqual({ createdAt: "asc" });
  });
});
