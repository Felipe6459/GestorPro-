import { getCurrentMembership } from "@/lib/current-user";
import { getBillingPageData } from "@/lib/billing/view-model";
import { AccessModeBanner } from "@/components/billing/access-mode-banner";
import { CurrentPlanSection } from "@/components/billing/current-plan-section";
import { UsageSection } from "@/components/billing/usage-section";
import { PlansSection } from "@/components/billing/plans-section";

/**
 * Billing & Subscriptions Stage 3 (this stage's own §2/§3/§4). Staff-only
 * by construction — this route lives under (dashboard), whose layout
 * already redirects any Client Portal-only identity to /portal before this
 * page ever renders (src/app/(dashboard)/layout.tsx). organizationId and
 * role are always server-resolved via getCurrentMembership() — never
 * accepted from the client.
 *
 * Every staff role (OWNER/ADMIN/MEMBER) can view this page — role only
 * gates which controls are interactive (getBillingPageData's own
 * `permissions` field, rendered by CurrentPlanSection/PlansSection). No
 * 500/crash path: getBillingPageData never throws for a missing
 * Subscription row (that's the LEGACY state, not an error) or an
 * unrecognized planKey (falls back to a generic label).
 */
export default async function BillingPage() {
  const { organizationId, membership } = await getCurrentMembership();
  const data = await getBillingPageData({ organizationId, role: membership.role });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your organization&apos;s plan and usage.</p>

      <div className="mt-6 space-y-6">
        <AccessModeBanner banner={data.accessModeBanner} />
        <CurrentPlanSection data={data} />
        <UsageSection rows={data.usageRows} />
        <PlansSection data={data} />
      </div>
    </div>
  );
}
