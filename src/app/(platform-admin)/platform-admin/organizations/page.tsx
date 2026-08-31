import type { Metadata } from "next";
import Link from "next/link";
import { formatStatusLabel } from "@/lib/format";
import { getTotalPages, type RawSearchParams } from "@/lib/list-params";
import {
  listOrganizations,
  parseOrganizationListParams,
  type OrganizationLifecycleStatus,
} from "@/lib/platform-admin/queries/organizations";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchFilterBar } from "@/components/list/search-filter-bar";
import { Pagination } from "@/components/list/pagination";
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Organizations — Platform Admin",
};

// Design System Phase 2's own established per-file pattern (see e.g.
// (dashboard)/clients/page.tsx) for a <Link> styled as the page's primary
// action — used here for the EmptyState "Clear search"/"Clear filter"
// actions, mechanically equivalent to the previous raw bg-black button.
const PRIMARY_LINK_CLASSES =
  "focus-visible:ring-focus-ring rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const BASE_PATH = "/platform-admin/organizations";

// Display order for the filter dropdown — deliberately not
// ORGANIZATION_LIFECYCLE_STATUSES's own declaration order (which follows
// the classification mapping table), this is purely a UI reading-order
// choice.
const STATUS_FILTER_ORDER: readonly OrganizationLifecycleStatus[] = [
  "LEGACY",
  "TRIAL",
  "PAID",
  "EXPIRED",
  "SUSPENDED",
  "CANCELED",
  "ARCHIVED",
];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name (A–Z)" },
];

// Responsive column tiers — one <table> markup at every breakpoint (never
// a second, parallel mobile-only component): Organization/Lifecycle/
// Actions always visible; Owner/Access mode/Staff/Portal appear at the
// tablet breakpoint (md); Clients/Projects/Created appear only at desktop
// (lg). See Table component's own doc comment on TableHeaderCell/
// TableCell's className prop.
const TABLET_UP = "hidden md:table-cell";
const DESKTOP_UP = "hidden lg:table-cell";

export default async function PlatformAdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const listParams = parseOrganizationListParams(resolvedSearchParams);
  const now = new Date();

  const { organizations, total } = await listOrganizations(listParams, now);
  const totalPages = getTotalPages(total);
  const hasActiveParams = Boolean(listParams.q || listParams.status);

  return (
    <div>
      <div>
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {total} {total === 1 ? "organization" : "organizations"}
        </p>
      </div>

      <SearchFilterBar
        basePath={BASE_PATH}
        searchValue={listParams.q}
        searchPlaceholder="Search by name, slug, or owner email"
        filters={[
          {
            name: "status",
            label: "Status",
            value: listParams.status ?? "",
            options: [
              { value: "", label: "All" },
              ...STATUS_FILTER_ORDER.map((status) => ({ value: status, label: formatStatusLabel(status) })),
            ],
          },
        ]}
        sort={{ value: listParams.sortCombined, options: SORT_OPTIONS }}
        hasActiveParams={hasActiveParams}
      />

      {total === 0 ? (
        listParams.q ? (
          <EmptyState
            title="No matching organizations"
            description={`No organizations match "${listParams.q}". Try a different search term.`}
            action={
              <Link href={BASE_PATH} className={PRIMARY_LINK_CLASSES}>
                Clear search
              </Link>
            }
          />
        ) : listParams.status ? (
          <EmptyState
            title="No organizations in this status"
            description={`No organizations are currently ${formatStatusLabel(listParams.status)}.`}
            action={
              <Link href={BASE_PATH} className={PRIMARY_LINK_CLASSES}>
                Clear filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No organizations yet"
            description="Organizations will appear here as they register."
          />
        )
      ) : (
        <>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Organization</TableHeaderCell>
                <TableHeaderCell className={TABLET_UP}>Owner</TableHeaderCell>
                <TableHeaderCell>Lifecycle</TableHeaderCell>
                <TableHeaderCell className={TABLET_UP}>Access mode</TableHeaderCell>
                <TableHeaderCell className={TABLET_UP} align="right">
                  Staff
                </TableHeaderCell>
                <TableHeaderCell className={TABLET_UP} align="right">
                  Portal users
                </TableHeaderCell>
                <TableHeaderCell className={DESKTOP_UP} align="right">
                  Clients
                </TableHeaderCell>
                <TableHeaderCell className={DESKTOP_UP} align="right">
                  Projects
                </TableHeaderCell>
                <TableHeaderCell className={DESKTOP_UP}>Created</TableHeaderCell>
                {/*
                  Future columns (Health, MRR, Email status, Billing
                  provider, Storage usage, Last activity, ...) each slot in
                  here as one more TableHeaderCell/TableCell pair — nothing
                  about this table's structure assumes today's column set
                  is final.
                */}
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell emphasis>
                    <div>{org.name}</div>
                    <div className="text-text-muted text-xs font-normal">{org.slug}</div>
                  </TableCell>
                  <TableCell className={TABLET_UP}>
                    {org.owner ? (
                      <>
                        <div>{org.owner.name}</div>
                        <div className="text-text-muted text-xs">{org.owner.email}</div>
                      </>
                    ) : (
                      <span className="text-text-muted">No owner</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={org.lifecycleStatus} />
                  </TableCell>
                  <TableCell className={TABLET_UP}>
                    <StatusBadge status={org.accessMode} />
                  </TableCell>
                  <TableCell className={TABLET_UP} align="right">
                    {org.staffCount}
                  </TableCell>
                  <TableCell className={TABLET_UP} align="right">
                    {org.portalUsersCount}
                  </TableCell>
                  <TableCell className={DESKTOP_UP} align="right">
                    {org.clientsCount}
                  </TableCell>
                  <TableCell className={DESKTOP_UP} align="right">
                    {org.projectsCount}
                  </TableCell>
                  <TableCell className={DESKTOP_UP}>{org.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Link
                      href={`${BASE_PATH}/${org.id}`}
                      className={ACTION_LINK_CLASSES}
                    >
                      View<span className="sr-only"> {org.name}</span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            basePath={BASE_PATH}
            params={{
              ...(listParams.q ? { q: listParams.q } : {}),
              ...(listParams.status ? { status: listParams.status } : {}),
              sort: listParams.sortCombined,
            }}
            page={listParams.page}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}

