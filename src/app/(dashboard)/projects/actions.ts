"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";

export async function deleteProjectAction(projectId: string) {
  const { organizationId } = await getCurrentUserOrganization();

  await prisma.project.deleteMany({
    where: { id: projectId, organizationId },
  });

  revalidatePath("/projects");
}
