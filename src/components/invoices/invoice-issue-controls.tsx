"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { issueInvoiceAction } from "@/app/(dashboard)/invoices/[id]/edit/issue-actions";

/**
 * Invoice System Official Slice 3, sub-PR 3b — OWNER-only Issue control for
 * a DRAFT invoice, rendered by InvoiceDraftPanel alongside InvoiceForm.
 * `expectedUpdatedAt` is always the page's own render-time
 * `invoice.updatedAt.toISOString()` — never re-fetched client-side. On a
 * stale/conflict/not-draft result this refreshes the page (never retries
 * with the same stale value); no PDF download link exists here — the
 * staff signed-download route is sub-PR 3c's.
 */
export function InvoiceIssueControls({
  invoiceId,
  invoiceNumber,
  expectedUpdatedAt,
  disabled,
}: {
  invoiceId: string;
  invoiceNumber: string;
  expectedUpdatedAt: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<ConfirmDialogHandle>(null);

  function runIssue() {
    startTransition(async () => {
      const result = await issueInvoiceAction(invoiceId, expectedUpdatedAt);

      if (result.ok) {
        showToast("Invoice issued");
        router.refresh();
        return;
      }

      if (result.error === "STALE_VERSION" || result.error === "CONFLICT" || result.error === "NOT_DRAFT" || result.error === "NOT_FOUND") {
        showToast("This invoice changed elsewhere — refreshing…", "error");
        router.refresh();
        return;
      }

      if (result.error === "FORBIDDEN") {
        showToast("Only the organization owner can issue invoices.", "error");
        return;
      }

      showToast("Could not issue this invoice — try again.", "error");
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {disabled && <p className="text-sm text-amber-700">Save changes before issuing.</p>}
      <Button
        type="button"
        disabled={disabled || pending}
        loading={pending}
        onClick={() => dialogRef.current?.open()}
        className="border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
      >
        Issue invoice
      </Button>
      <ConfirmDialog
        ref={dialogRef}
        title="Issue invoice"
        description={`Issue invoice ${invoiceNumber}? This creates a permanent, immutable PDF record and cannot be undone.`}
        confirmLabel="Issue invoice"
        destructive
        onConfirm={runIssue}
      />
    </div>
  );
}
