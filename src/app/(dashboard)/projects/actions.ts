"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";

export async function deleteProjectAction(projectId: string) {
  const user = await getOrCreateUser();

  await prisma.project.deleteMany({
    where: { id: projectId, ownerId: user.id },
  });

  revalidatePath("/projects");
}
