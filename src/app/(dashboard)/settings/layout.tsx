import { getCurrentMembership } from "@/lib/current-user";
import { canAccessPaymentDetails } from "@/lib/organization-setup/authorization";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * Pre-Launch Audit F1 fix. Before this layout, /settings/company,
 * /settings/payment, and /settings/domain were only ever reachable via the
 * onboarding card (dismissible/completable) or the invoice-issuance
 * readiness notice (renders nothing once both are configured) — no
 * persistent UI path existed back to them. This shared layout adds one,
 * consistent nav across every /settings/* page, mirroring how
 * app/portal/(app)/layout.tsx already renders <PortalNav /> once for its
 * whole route group rather than duplicating it per page.
 *
 * getCurrentMembership() here is the exact same call every settings page
 * already makes independently for its own authorization — calling it a
 * second time (layout + page) is the same redundant-per-request-resolution
 * shape (dashboard)/layout.tsx and every page below it already has, not a
 * new pattern. canAccessPaymentDetails() is the single canonical helper
 * (organization-setup/authorization.ts) — never re-derived here, and this
 * only controls whether the *link* renders. It is not the security
 * boundary: /settings/payment's own page-level
 * assertCanAccessPaymentDetails() check is completely unchanged and still
 * independently enforces the real access boundary for a direct URL visit.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { membership } = await getCurrentMembership();
  const canAccessPayment = canAccessPaymentDetails(membership.role);

  return (
    <div>
      <SettingsNav canAccessPayment={canAccessPayment} />
      {children}
    </div>
  );
}
