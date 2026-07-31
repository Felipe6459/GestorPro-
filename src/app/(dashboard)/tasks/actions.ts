"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";

export async function deleteTaskAction(taskId: string) {
  const { organizationId } = await getCurrentUserOrganization();

  await prisma.task.deleteMany({
    where: { id: taskId, project: { organizationId } },
  });

  revalidatePath("/tasks");
}
