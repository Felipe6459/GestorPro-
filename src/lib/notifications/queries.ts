import { prisma } from "@/lib/prisma";
import type { Notification } from "@/generated/prisma/client";

/**
 * Served by the [recipientId, readAt, createdAt, id] index — readAt IS NULL
 * is a highly selective prefix match, so this stays an index-only count
 * rather than a full-table scan (see docs/notifications-architecture.md §5).
 */
export async function getUnreadNotificationCount(params: {
  organizationId: string;
  recipientId: string;
}): Promise<number> {
  return prisma.notification.count({
    where: {
      organizationId: params.organizationId,
      recipientId: params.recipientId,
      readAt: null,
    },
  });
}

/**
 * The dropdown's preview list — a plain LIMIT, not cursor pagination. The
 * full, paginated inbox (keyset, mirroring /activity's cursor.ts) is a
 * future /notifications page's concern, not this preview's.
 */
export async function getRecentNotifications(params: {
  organizationId: string;
  recipientId: string;
  limit: number;
}): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: {
      organizationId: params.organizationId,
      recipientId: params.recipientId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit,
  });
}
