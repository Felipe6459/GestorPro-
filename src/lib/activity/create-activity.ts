import type { Prisma } from "@/generated/prisma/client";
import type { ActivityAction, ActivityEntityType } from "@/generated/prisma/enums";

export type CreateActivityInput = {
  organizationId: string;
  actorId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Writes one Activity row. Takes a Prisma.TransactionClient — never the
 * top-level `prisma` client — and never opens its own transaction, so the
 * caller must invoke this from inside the same prisma.$transaction(...)
 * block as the business mutation it's recording: if this insert fails
 * (or throws for any reason), that mutation rolls back with it.
 *
 * metadata must only ever contain a safe snapshot/diff (entity name,
 * status, changed field names, actor name) — never full form payloads,
 * tokens, API keys, or other secrets. Never logs its input.
 */
export async function createActivity(
  tx: Prisma.TransactionClient,
  input: CreateActivityInput,
): Promise<void> {
  await tx.activity.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: input.metadata ?? {},
    },
  });
}
