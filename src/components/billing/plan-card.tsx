import { formatFileSize } from "@/lib/format";
import type { PlanCardViewModel, BillingManagementPermissions } from "@/lib/billing/view-model";
import { PlanActionButton } from "./plan-action-button";

const NOT_OWNER_REASON = "Only the organization owner can manage billing.";

export function PlanCard({
  plan,
  permissions,
}: {
  plan: PlanCardViewModel;
  permissions: BillingManagementPermissions;
}) {
  const disabledReason = plan.isCurrentPlan
    ? undefined
    : !permissions.canManagePlan
      ? NOT_OWNER_REASON
      : undefined;

  return (
    // Not CARD_SURFACE_CLASSES here — the current-plan state needs its own
    // conditional border color (border-accent), and bundling
    // border-border-default from that constant alongside it would put two
    // same-specificity border-color utilities in one className, which
    // Tailwind's generated-CSS order (not source order) resolves
    // unpredictably (see button.tsx's own doc comment on this exact bug
    // class) — spelled out separately instead so exactly one border-color
    // utility is ever present per render.
    <div
      className={`flex flex-col rounded-lg border bg-surface p-5 ${
        plan.isCurrentPlan ? "border-accent" : "border-border-default"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-text-primary text-base font-semibold">{plan.displayName}</h3>
        {plan.isCurrentPlan && (
          <span className="bg-accent inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white">
            Current plan
          </span>
        )}
      </div>

      <p className="text-text-muted mt-1 text-sm">{plan.description}</p>

      <ul className="text-text-secondary mt-4 space-y-1 text-sm">
        <li>{plan.maxMembers} members</li>
        <li>{plan.maxClients === null ? "Unlimited clients" : `${plan.maxClients} clients`}</li>
        <li>{plan.maxProjects === null ? "Unlimited projects" : `${plan.maxProjects} projects`}</li>
        <li>{formatFileSize(plan.maxStorageBytes)} storage</li>
      </ul>

      {/* No fake dollar amounts — this stage's own §7 rule: only ever this generic copy until a real provider is connected. */}
      <p className="text-text-muted mt-4 text-xs">Pricing configured by the product owner.</p>

      <div className="mt-4">
        <PlanActionButton
          planKey={plan.planKey}
          label={plan.ctaLabel}
          disabled={plan.ctaDisabled}
          disabledReason={disabledReason}
        />
      </div>
    </div>
  );
}
