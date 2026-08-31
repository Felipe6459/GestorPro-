import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import type { BillingPageViewModel } from "@/lib/billing/view-model";
import { NoticeBanner } from "./notice-banner";
import { ManageSubscriptionButton } from "./manage-subscription-button";

export function CurrentPlanSection({ data }: { data: BillingPageViewModel }) {
  return (
    <section aria-labelledby="billing-current-plan-heading" className={`p-5 ${CARD_SURFACE_CLASSES}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="billing-current-plan-heading" className="text-text-primary text-base font-semibold">
            {data.currentPlanName}
          </h2>
          <div className="mt-1.5">
            <StatusBadge status={data.statusLabel} />
          </div>
        </div>

        {data.permissions.canManageSubscription ? (
          <ManageSubscriptionButton />
        ) : (
          <div className="text-right">
            <Button type="button" variant="secondary" disabled aria-disabled="true">
              Manage subscription
            </Button>
            <p className="text-text-muted mt-1 text-xs">Only the organization owner can manage billing.</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <NoticeBanner notice={data.statusNotice} />
      </div>

      <dl className="text-text-secondary mt-4 space-y-1 text-sm">
        {data.trialEndsAt && !data.trialExpired && (
          <div>
            <dt className="sr-only">Trial ends</dt>
            <dd>
              Trial ends on {data.trialEndsAt.toLocaleDateString()}
              {data.trialDaysRemaining !== null &&
                ` (${data.trialDaysRemaining} ${data.trialDaysRemaining === 1 ? "day" : "days"} remaining)`}
              .
            </dd>
          </div>
        )}

        {data.cancelAtPeriodEnd && data.currentPeriodEnd && (
          <div>
            <dt className="sr-only">Subscription ends</dt>
            <dd>Your subscription will end on {data.currentPeriodEnd.toLocaleDateString()}.</dd>
          </div>
        )}

        {!data.cancelAtPeriodEnd && data.currentPeriodEnd && data.statusLabel === "ACTIVE" && (
          <div>
            <dt className="sr-only">Renews</dt>
            <dd>Renews on {data.currentPeriodEnd.toLocaleDateString()}.</dd>
          </div>
        )}

        {data.gracePeriodEndsAt && (
          <div>
            <dt className="sr-only">Grace period ends</dt>
            <dd>Grace period ends on {data.gracePeriodEndsAt.toLocaleDateString()}.</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
