"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { createActivity } from "@/lib/activity/create-activity";
import { buildClientActivityMetadata } from "@/lib/activity/client-metadata";

export async function deleteClientAction(clientId: string) {
  const { user, organizationId } = await getCurrentUserOrganization();

  // Delete and its (conditional) Activity row are one atomic unit — a
  // failed Activity insert rolls the delete back too.
  await prisma.$transaction(async (tx) => {
    // Snapshot taken before deletion — Activity.entityId is not a foreign
    // key, so this row (and its metadata) is what keeps the entry readable
    // once the Client row itself is gone.
    const existing = await tx.client.findFirst({
      where: { id: clientId, organizationId },
    });

    if (!existing) {
      return;
    }

    const result = await tx.client.deleteMany({
      where: { id: clientId, organizationId },
    });

    if (result.count === 0) {
      return;
    }

    await createActivity(tx, {
      organizationId,
      actorId: user.id,
      entityType: "CLIENT",
      entityId: clientId,
      action: "DELETED",
      metadata: buildClientActivityMetadata(existing, user.name),
    });
  });

  revalidatePath("/clients");
}
