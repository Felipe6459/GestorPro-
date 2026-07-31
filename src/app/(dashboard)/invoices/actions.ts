"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";

export async function deleteInvoiceAction(invoiceId: string) {
  const { organizationId } = await getCurrentUserOrganization();

  await prisma.invoice.deleteMany({
    where: { id: invoiceId, project: { organizationId } },
  });

  revalidatePath("/invoices");
}
