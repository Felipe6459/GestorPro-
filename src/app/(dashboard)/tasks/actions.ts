"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";

export async function deleteTaskAction(taskId: string) {
  const user = await getOrCreateUser();

  await prisma.task.deleteMany({
    where: { id: taskId, project: { ownerId: user.id } },
  });

  revalidatePath("/tasks");
}
