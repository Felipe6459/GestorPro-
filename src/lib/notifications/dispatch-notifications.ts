import type { Prisma } from "@/generated/prisma/client";
import { resolveNotificationRule, type CreatedActivity, type NotificationContext } from "./notification-rules";

/**
 * Called from inside createActivity, on the same tx as the Activity insert
 * and the business mutation it records — never opens its own transaction,
 * so if the Notification insert below fails, everything in that transaction
 * rolls back together.
 *
 * No-op for any Activity whose (entityType, action) isn't one of the
 * approved MVP NotificationTypes (see notification-rules.ts).
 */
export async function dispatchNotificationsForActivity(
  tx: Prisma.TransactionClient,
  input: { activity: CreatedActivity; context?: NotificationContext },
): Promise<void> {
  const { activity, context } = input;

  const rule = resolveNotificationRule(activity.entityType, activity.action);
  if (!rule) {
    return;
  }

  const candidates = await rule.resolveRecipients(tx, activity, context);

  // Exclude the actor and dedupe — done once, uniformly, here rather than
  // per-rule: it's what makes OWNERSHIP_TRANSFERRED's "previous owner"
  // ambiguity resolve correctly (previousOwnerId always equals actorId in
  // every current code path, so it's excluded here rather than needing a
  // special case in that rule), and it satisfies "never notify the actor
  // about their own action" for every rule generically.
  const recipientIds = [...new Set(candidates)].filter((id) => id !== activity.actorId);
  if (recipientIds.length === 0) {
    return;
  }

  // A deleted/absent recipient (e.g. the inviter's User row no longer
  // exists) must be a silent no-op, not a foreign-key error that would
  // wrongly roll back the whole transaction — so existence is checked
  // before the insert rather than relied on via the FK constraint.
  const existingUsers = await tx.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingUsers.map((u) => u.id));
  const finalRecipientIds = recipientIds.filter((id) => existingIds.has(id));
  if (finalRecipientIds.length === 0) {
    return;
  }

  const metadata = rule.buildMetadata(activity);

  await tx.notification.createMany({
    data: finalRecipientIds.map((recipientId) => ({
      organizationId: activity.organizationId,
      recipientId,
      activityId: activity.id,
      type: rule.type,
      entityType: activity.entityType,
      entityId: activity.entityId,
      metadata,
    })),
  });
}
