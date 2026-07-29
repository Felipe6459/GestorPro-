"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";

export async function deleteInvoiceAction(invoiceId: string) {
  const user = await getOrCreateUser();

  await prisma.invoice.deleteMany({
    where: { id: invoiceId, project: { ownerId: user.id } },
  });

  revalidatePath("/invoices");
}
