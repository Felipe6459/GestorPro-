"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { createActivity } from "@/lib/activity/create-activity";
import { buildInvoiceMetadata } from "@/lib/activity/invoice-metadata";

export async function deleteInvoiceAction(invoiceId: string) {
  const { user, organizationId } = await getCurrentUserOrganization();

  // Delete and its Activity row are one atomic unit — a failed Activity
  // insert rolls the delete back too.
  await prisma.$transaction(async (tx) => {
    // Snapshot taken before deletion — Activity.entityId is not a foreign
    // key, so this row (and its metadata) is what keeps the entry readable
    // once the Invoice row itself is gone.
    const existing = await tx.invoice.findFirst({
      where: { id: invoiceId, project: { organizationId } },
      include: { project: { select: { name: true } } },
    });

    if (!existing) {
      return;
    }

    const result = await tx.invoice.deleteMany({
      where: { id: invoiceId, project: { organizationId } },
    });

    if (result.count === 0) {
      return;
    }

    await createActivity(tx, {
      organizationId,
      actorId: user.id,
      entityType: "INVOICE",
      entityId: invoiceId,
      action: "DELETED",
      metadata: buildInvoiceMetadata(existing, existing.project.name, user.name),
    });
  });

  revalidatePath("/invoices");
}
