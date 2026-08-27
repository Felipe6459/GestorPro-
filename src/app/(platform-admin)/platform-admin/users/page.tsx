import type { Metadata } from "next";
import Link from "next/link";
import { getTotalPages, type RawSearchParams } from "@/lib/list-params";
import { listUsers, parseUserListParams } from "@/lib/platform-admin/queries/users";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchFilterBar } from "@/components/list/search-filter-bar";
import { Pagination } from "@/components/list/pagination";
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Users — Platform Admin",
};

const BASE_PATH = "/platform-admin/users";

const SORT_OPTIONS = [
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
];

/**
 * Platform Admin Users Explorer, PR 1. Staff `User` only — see
 * users.ts's own header comment for why `PortalUser` and a
 * `/platform-admin/users/[id]` detail page are both deliberately out of
 * scope here. Each row's organizations link straight to the existing
 * Organization Detail page (which already shows this same person, with
 * the same role, in that organization's own Team section) rather than
 * duplicating that context in a second, new detail page.
 */
export default async function PlatformAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const listParams = parseUserListParams(resolvedSearchParams);

  const { users, total } = await listUsers(listParams);
  const totalPages = getTotalPages(total);
  const hasActiveParams = Boolean(listParams.q);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-600">
          {total} {total === 1 ? "staff user" : "staff users"}, across every organization.
        </p>
      </div>

      <SearchFilterBar
        basePath={BASE_PATH}
        searchValue={listParams.q}
        searchPlaceholder="Search by name or email"
        sort={{ value: listParams.sortCombined, options: SORT_OPTIONS }}
        hasActiveParams={hasActiveParams}
      />

      {total === 0 ? (
        listParams.q ? (
          <EmptyState
            title="No matching users"
            description={`No users match "${listParams.q}". Try a different search term.`}
            action={
              <Link
                href={BASE_PATH}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                Clear search
              </Link>
            }
          />
        ) : (
          <EmptyState title="No users yet" description="Staff users will appear here as they join an organization." />
        )
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Organizations</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell emphasis className="wrap-anywhere">
                    {user.name}
                  </TableCell>
                  <TableCell className="wrap-anywhere">{user.email}</TableCell>
                  <TableCell>
                    {user.memberships.length === 0 ? (
                      <span className="text-gray-400">No organizations</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {user.memberships.map((membership) => (
                          <li key={membership.organizationId} className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/platform-admin/organizations/${membership.organizationId}`}
                              className="wrap-anywhere rounded text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                            >
                              {membership.organizationName}
                            </Link>
                            <StatusBadge status={membership.role} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>{user.createdAt.toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            basePath={BASE_PATH}
            params={{ ...(listParams.q ? { q: listParams.q } : {}), sort: listParams.sortCombined }}
            page={listParams.page}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}
