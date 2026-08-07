import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import type { BillingMetrics, PrismaClientOrTx } from "../types";

/**
 * Analytics Stage 1 (docs/analytics-architecture.md §5.5). Deliberately a
 * thin wrapper over src/lib/billing/entitlements.ts's own
 * `getOrganizationEntitlements()` — read-only reuse of Billing's own
 * planKey/LEGACY-normalization logic (Stage 5 audit fix), never a
 * reimplementation. This is the one query in the analytics domain that
 * reaches into another domain's module; every other query file only ever
 * touches Prisma directly.
 */
export async function getBillingMetrics(client: PrismaClientOrTx, organizationId: string, now: Date): Promise<BillingMetrics> {
  const entitlements = await getOrganizationEntitlements(organizationId, { client, now });
  return {
    planKey: entitlements.planKey,
    subscriptionStatus: entitlements.subscriptionStatus,
  };
}
