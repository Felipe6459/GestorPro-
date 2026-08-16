"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { changeInvoiceStatusAction } from "@/app/(dashboard)/invoices/[id]/status-actions";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/invoices/lifecycle";
import type { InvoiceStatusValue } from "@/lib/validation/invoice";

/** Human copy per (from, to) pair — "Issued" terminology throughout, never "Sent" (docs/invoicing-architecture.md §3.1). */
const TRANSITION_LABELS: Partial<Record<string, string>> = {
  "SENT:PAID": "Mark as paid",
  "SENT:OVERDUE": "Mark as overdue",
  "OVERDUE:PAID": "Mark as paid",
  "OVERDUE:SENT": "Mark as issued",
  "PAID:SENT": "Undo — mark as issued",
};

/**
 * Invoice System Slice 2b — lifecycle transition buttons for an existing
 * non-DRAFT invoice, plus Cancel (the same CANCELLED transition, behind a
 * confirmation dialog, never a separate business implementation — §3.2).
 * No status dropdown anywhere. Reuses changeInvoiceStatusAction for every
 * button, including Cancel.
 */
export function InvoiceLifecycleControls({
  invoiceId,
  status,
  invoiceNumber,
}: {
  invoiceId: string;
  status: InvoiceStatusValue;
  invoiceNumber: string;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const cancelDialogRef = useRef<ConfirmDialogHandle>(null);

  const allTargets = ALLOWED_STATUS_TRANSITIONS[status];
  const targets = allTargets.filter((target) => target !== "CANCELLED");
  const canCancel = allTargets.includes("CANCELLED");

  if (targets.length === 0 && !canCancel) return null;

  function runTransition(target: string) {
    startTransition(async () => {
      const result = await changeInvoiceStatusAction(invoiceId, target);
      if (result.ok) {
        showToast("Invoice updated");
      } else {
        showToast("This invoice could not be updated — it may have changed elsewhere. Refresh and try again.", "error");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {targets.map((target) => (
        <Button
          key={target}
          type="button"
          disabled={pending}
          loading={pending}
          onClick={() => runTransition(target)}
          className="border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
        >
          {TRANSITION_LABELS[`${status}:${target}`] ?? target}
        </Button>
      ))}
      {canCancel && (
        <>
          <Button
            type="button"
            disabled={pending}
            onClick={() => cancelDialogRef.current?.open()}
            className="border border-gray-300 bg-white text-red-600 hover:bg-red-50"
          >
            Cancel invoice
          </Button>
          <ConfirmDialog
            ref={cancelDialogRef}
            title="Cancel invoice"
            description={`Cancel invoice ${invoiceNumber}? This cannot be undone.`}
            confirmLabel="Cancel invoice"
            destructive
            onConfirm={() => runTransition("CANCELLED")}
          />
        </>
      )}
    </div>
  );
}
