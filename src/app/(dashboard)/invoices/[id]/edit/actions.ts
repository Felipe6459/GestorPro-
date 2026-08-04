"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseInvoiceForm } from "@/lib/validation/invoice";
import { withToast } from "@/lib/toast-url";
import { createActivity } from "@/lib/activity/create-activity";
import { deliverNotificationEmails } from "@/lib/notifications/email/deliver-notification-email";
import {
  diffInvoiceFields,
  buildInvoiceStatusChangedMetadata,
  buildInvoiceUpdatedMetadata,
} from "@/lib/activity/invoice-metadata";
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

  const { user, organizationId } = await getCurrentUserOrganization();

  // Changing the project is allowed, but only to one owned by this org —
  // re-verify server-side regardless of what the <select> offered. Also
  // require the project's client to be in the same org, so a stale or
  // inconsistent clientId FK can never carry over onto the invoice, and
  // resolves the (possibly new) project's name for Activity metadata.
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
    // Update and its Activity row(s) are one atomic unit — if any Activity
    // insert fails, the whole update rolls back with it.
    const outcome = await prisma.$transaction(async (tx) => {
      // Scoped through the invoice's *current* project's organization —
      // never by id alone. Also doubles as the "before" snapshot for
      // change-detection below.
      const existing = await tx.invoice.findFirst({
        where: { id: invoiceId, project: { organizationId } },
      });

      if (!existing) {
        return { status: "not_found" as const, notificationIds: [] as string[] };
      }

      // paidAt lifecycle, server-derived only — never read from formData:
      //   not-PAID -> PAID   : stamp a fresh paidAt (a real payment moment,
      //                        including a repeat PAID after being reverted)
      //   PAID -> not-PAID   : clear it — it no longer represents a paid state
      //   PAID -> PAID       : omit the field entirely, so the existing value
      //                        (and a pure no-op resubmit) is left untouched
      //   not-PAID -> not-PAID: omit the field entirely — nothing to change
      const wasPaid = existing.status === "PAID";
      const willBePaid = values.status === "PAID";
      const paidAtUpdate: { paidAt?: Date | null } = {};
      if (!wasPaid && willBePaid) {
        paidAtUpdate.paidAt = new Date();
      } else if (wasPaid && !willBePaid) {
        paidAtUpdate.paidAt = null;
      }

      const result = await tx.invoice.updateMany({
        where: { id: invoiceId, project: { organizationId } },
        data: {
          invoiceNumber: values.invoiceNumber,
          amount: values.amount,
          status: values.status,
          dueDate: values.dueDate,
          notes: values.notes,
          projectId: project.id,
          clientId: project.clientId,
          ...paidAtUpdate,
        },
      });

      if (result.count === 0) {
        return { status: "not_found" as const, notificationIds: [] as string[] };
      }

      // A pure resubmit of identical values creates no Activity at all.
      // "status" is always split out into its own STATUS_CHANGED event, so
      // it's never listed in an UPDATED event's changedFields even when
      // both fire together. currency is never part of this diff — no form
      // or action lets it change.
      const changedFields = diffInvoiceFields(existing, values);
      const statusChanged = changedFields.includes("status");
      const otherChangedFields = changedFields.filter((field) => field !== "status");

      // Only STATUS_CHANGED ever fans out to Notification rows (UPDATED
      // never does — see docs/notifications-architecture.md §2) — this is
      // the only one of the two whose notificationIds matter.
      let notificationIds: string[] = [];
      if (statusChanged) {
        const activity = await createActivity(tx, {
          organizationId,
          actorId: user.id,
          entityType: "INVOICE",
          entityId: invoiceId,
          action: "STATUS_CHANGED",
          metadata: buildInvoiceStatusChangedMetadata(
            values,
            project.name,
            existing.status,
            values.status,
            user.name,
          ),
        });
        notificationIds = activity.notificationIds;
      }

      if (otherChangedFields.length > 0) {
        await createActivity(tx, {
          organizationId,
          actorId: user.id,
          entityType: "INVOICE",
          entityId: invoiceId,
          action: "UPDATED",
          metadata: buildInvoiceUpdatedMetadata(
            { ...values, currency: existing.currency },
            project.name,
            otherChangedFields,
            user.name,
          ),
        });
      }

      return { status: "updated" as const, notificationIds };
    });

    if (outcome.status === "not_found") {
      return { error: "This invoice could not be found." };
    }

    // Post-commit, best-effort — see deliverNotificationEmails's own header.
    await deliverNotificationEmails(outcome.notificationIds);
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
