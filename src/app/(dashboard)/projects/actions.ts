"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { createActivity } from "@/lib/activity/create-activity";
import { buildProjectMetadata } from "@/lib/activity/project-metadata";

export async function deleteProjectAction(projectId: string) {
  const { user, organizationId } = await getCurrentUserOrganization();

  // Delete and its Activity row are one atomic unit — a failed Activity
  // insert rolls the delete back too.
  await prisma.$transaction(async (tx) => {
    // Snapshot taken before deletion — Activity.entityId is not a foreign
    // key, so this row (and its metadata) is what keeps the entry readable
    // once the Project row itself is gone.
    const existing = await tx.project.findFirst({
      where: { id: projectId, organizationId },
      include: { client: { select: { name: true } } },
    });

    if (!existing) {
      return;
    }

    const result = await tx.project.deleteMany({
      where: { id: projectId, organizationId },
    });

    if (result.count === 0) {
      return;
    }

    await createActivity(tx, {
      organizationId,
      actorId: user.id,
      entityType: "PROJECT",
      entityId: projectId,
      action: "DELETED",
      metadata: buildProjectMetadata(existing, existing.client.name, user.name),
    });
  });

  revalidatePath("/projects");
}
