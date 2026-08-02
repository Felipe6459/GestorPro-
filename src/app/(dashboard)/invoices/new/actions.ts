"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseInvoiceForm } from "@/lib/validation/invoice";
import { withToast } from "@/lib/toast-url";
import { createActivity } from "@/lib/activity/create-activity";
import { buildInvoiceMetadata } from "@/lib/activity/invoice-metadata";
import type { InvoiceFormState } from "@/types";

export async function createInvoiceAction(
  _prevState: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { values, fieldErrors } = parseInvoiceForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { user, organizationId } = await getCurrentUserOrganization();

  // The <select> only lists this org's projects, but the submitted value
  // is still client-controlled input — re-verify ownership server-side so a
  // tampered projectId can never attach an invoice to another org's project.
  // Also require the project's client to be in the same org, so a stale or
  // inconsistent clientId FK can never carry over onto the invoice.
  const project = await prisma.project.findFirst({
    where: { id: values.projectId, organizationId, client: { organizationId } },
    select: { id: true, clientId: true, name: true },
  });

  if (!project) {
    return {
      error: null,
      fieldErrors: { projectId: "Select a valid project." },
    };
  }

  try {
    // Invoice create and its Activity row are one atomic unit — if the
    // Activity insert fails for any reason, the Invoice create rolls back
    // with it rather than leaving an unlogged row behind.
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: values.invoiceNumber,
          amount: values.amount,
          status: values.status,
          dueDate: values.dueDate,
          notes: values.notes,
          projectId: project.id,
          // Derived from the project, never a form field — keeps the two
          // FKs from ever disagreeing about which client this invoice bills.
          clientId: project.clientId,
          // Server-set, never from formData — the form does allow creating
          // an invoice directly in PAID status (no restriction to DRAFT),
          // so that case must record a real paidAt from the start, same as
          // any later DRAFT/SENT -> PAID transition would.
          paidAt: values.status === "PAID" ? new Date() : null,
        },
      });

      await createActivity(tx, {
        organizationId,
        actorId: user.id,
        entityType: "INVOICE",
        entityId: invoice.id,
        action: "CREATED",
        metadata: buildInvoiceMetadata(invoice, project.name, user.name),
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        error: null,
        fieldErrors: {
          invoiceNumber: "An invoice with this number already exists.",
        },
      };
    }
    throw err;
  }

  redirect(withToast("/invoices", "Invoice created"));
}
