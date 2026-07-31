"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseInvoiceForm } from "@/lib/validation/invoice";
import { withToast } from "@/lib/toast-url";
import type { InvoiceFormState } from "@/types";

export async function createInvoiceAction(
  _prevState: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { values, fieldErrors } = parseInvoiceForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { organizationId } = await getCurrentUserOrganization();

  // The <select> only lists this org's projects, but the submitted value
  // is still client-controlled input — re-verify ownership server-side so a
  // tampered projectId can never attach an invoice to another org's project.
  const project = await prisma.project.findFirst({
    where: { id: values.projectId, organizationId },
    select: { id: true, clientId: true },
  });

  if (!project) {
    return {
      error: null,
      fieldErrors: { projectId: "Select a valid project." },
    };
  }

  try {
    await prisma.invoice.create({
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
      },
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
