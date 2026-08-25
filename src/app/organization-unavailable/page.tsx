import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace unavailable",
};

/**
 * Platform Admin Organization Suspension, PR 1. The one destination every
 * suspension denial redirects to (src/lib/organization-access.ts's own
 * ORGANIZATION_UNAVAILABLE_PATH) — deliberately at the top level of the
 * app, a sibling of /privacy and /terms, never nested inside
 * (dashboard)/portal's own route groups: either of those groups' layouts
 * would immediately re-trigger this exact same redirect, an infinite loop.
 *
 * Deliberately static and data-free: no Prisma query, no session read, no
 * dynamic content of any kind — there is nothing here for this page to
 * accidentally leak. It never discloses a suspension reason, timestamp,
 * the acting admin's identity, the organization's own name or id, an
 * invitation token, or any other identifier — the copy below is fixed and
 * generic by design (see the design investigation's own explicit "may
 * suspension/organization existence be disclosed" decision: no). No link,
 * button, or form of any kind — nothing here is interactive, and nothing
 * here is a mutation control.
 */
export default function OrganizationUnavailablePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Workspace unavailable</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-600">
        This workspace is currently unavailable. Contact support.
      </p>
    </main>
  );
}
