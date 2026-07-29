"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";
import { parseInvoiceForm } from "@/lib/validation/invoice";
import { withToast } from "@/lib/toast-url";
import type { InvoiceFormState } from "@/types";

export async function updateInvoiceAction(
  invoiceId: string,
  _prevState: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { values, fieldErrors } = parseInvoiceForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const user = await getOrCreateUser();

  // Changing the project is allowed, but only to one owned by this user —
  // re-verify server-side regardless of what the <select> offered.
  const project = await prisma.project.findFirst({
    where: { id: values.projectId, ownerId: user.id },
    select: { id: true, clientId: true },
  });

  if (!project) {
    return {
      error: null,
      fieldErrors: { projectId: "Select a valid project." },
    };
  }

  try {
    // Ownership-scoped through the invoice's *current* project — never by
    // id alone.
    const result = await prisma.invoice.updateMany({
      where: { id: invoiceId, project: { ownerId: user.id } },
      data: {
        invoiceNumber: values.invoiceNumber,
        amount: values.amount,
        status: values.status,
        dueDate: values.dueDate,
        notes: values.notes,
        projectId: project.id,
        clientId: project.clientId,
      },
    });

    if (result.count === 0) {
      return { error: "This invoice could not be found." };
    }
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

  redirect(withToast("/invoices", "Invoice updated"));
}
