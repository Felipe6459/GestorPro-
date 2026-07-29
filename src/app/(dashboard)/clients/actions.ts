"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";

export async function deleteClientAction(clientId: string) {
  const user = await getOrCreateUser();

  await prisma.client.deleteMany({
    where: { id: clientId, userId: user.id },
  });

  revalidatePath("/clients");
}
