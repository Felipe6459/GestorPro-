"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";

export async function deleteClientAction(clientId: string) {
  const { organizationId } = await getCurrentUserOrganization();

  await prisma.client.deleteMany({
    where: { id: clientId, organizationId },
  });

  revalidatePath("/clients");
}
