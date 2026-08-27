import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin/authorization";
import { PAGE_SIZE, getOffset, parseSearchParam, parsePageParam, parseSortParam, type RawSearchParams } from "@/lib/list-params";

/**
 * Platform Admin Users Explorer, PR 1 — staff `User` only (never
 * `PortalUser`, a structurally different identity: it belongs to a
 * Client, not directly to an Organization, has no role, and is two
 * relation hops from Organization instead of one — see this feature's
 * own design investigation).
 *
 * Critical invariant: `User.role` (a vestigial top-level field predating
 * multi-tenancy — genuinely unread anywhere else in this codebase) is
 * never selected, read, or exposed here. All real role information comes
 * from `Membership.role`, one row per (user, organization) pair. A user
 * can belong to many organizations; each Membership carries its own
 * `organization` relation, so pairing an organization with its own role
 * is structural (Prisma resolves each membership's own relation
 * individually) — there is no manual join step that could cross-match
 * one user's Acme membership with their own, unrelated Widgets Inc. role.
 */

export const USER_SORT_FIELDS = ["name", "createdAt"] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export type UserListParams = {
  q: string;
  sortField: UserSortField;
  sortDir: "asc" | "desc";
  sortCombined: string;
  page: number;
};

export function parseUserListParams(searchParams: RawSearchParams): UserListParams {
  const q = parseSearchParam(searchParams.q);
  const { field, dir, combined } = parseSortParam(searchParams.sort, USER_SORT_FIELDS, "name:asc");
  const page = parsePageParam(searchParams.page);

  return { q, sortField: field, sortDir: dir, sortCombined: combined, page };
}

/** Case-insensitive `contains` across name and email — the same shape buildOrganizationWhere() already uses for its own owner-email search. */
export function buildUserWhere({ q }: Pick<UserListParams, "q">): Prisma.UserWhereInput {
  return q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
}

export function buildUserOrderBy(params: Pick<UserListParams, "sortField" | "sortDir">): Prisma.UserOrderByWithRelationInput {
  return { [params.sortField]: params.sortDir };
}

/**
 * `organizationId` exists here only to build a link href
 * (`/platform-admin/organizations/${organizationId}`, the same pattern
 * the Organization Explorer list already uses for its own row links) —
 * never rendered as visible text. `role` is this specific membership's
 * own `Membership.role`, never `User.role`.
 */
export type UserMembershipRow = {
  organizationId: string;
  organizationName: string;
  role: Role;
};

/** Deliberately narrow — no avatarUrl, no auth/provider data, nothing PortalUser-specific. `id` is used only as a React key / internal identifier, never rendered as visible text. */
export type UserListRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  memberships: UserMembershipRow[];
};

/**
 * The Users Explorer list — one bulk query, the same
 * `$transaction([findMany, count])` shape listOrganizations() already
 * uses. requirePlatformAdmin() is the first awaited operation, before any
 * Prisma call (PLATFORM_ADMIN_EXECUTION_AUTHORIZATION_AUDIT discipline —
 * see organization-detail.ts's own getOrganizationDetail() doc comment
 * for why the shared layout's own call alone isn't enough).
 */
export async function listUsers(params: UserListParams): Promise<{ users: UserListRow[]; total: number }> {
  await requirePlatformAdmin();

  const where = buildUserWhere(params);
  const orderBy = buildUserOrderBy(params);

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy,
      skip: getOffset(params.page),
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const users: UserListRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    memberships: row.memberships.map((membership) => ({
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      role: membership.role,
    })),
  }));

  return { users, total };
}
