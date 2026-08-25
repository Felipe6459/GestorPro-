"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { suspendOrganizationAction, reactivateOrganizationAction } from "@/app/(platform-admin)/platform-admin/organizations/[id]/actions";
import { SUSPENSION_REASON_CODES, type SuspensionReasonCode } from "@/lib/platform-admin/organization-suspension-reasons";
import { canConfirmSuspend, showsNameMismatch } from "@/lib/platform-admin/organization-suspension-confirmation";

/**
 * Platform Admin Organization Suspension, PR 2. The one status
 * indicator + control pair on Organization Detail — deliberately never
 * reuses StatusBadge/STATUS_TONES' own "SUSPENDED" key (that belongs to
 * OrganizationLifecycleStatus, a distinct billing-derived concept — see
 * this feature's own design investigation) and never renders the
 * organization's own id, the acting admin's email, or any audit data —
 * this is an operator control surface, but its own visible text stays as
 * bounded as the tenant-facing /organization-unavailable page's does.
 */

const REASON_LABELS: Record<SuspensionReasonCode, string> = {
  BILLING_DISPUTE: "Billing dispute",
  POLICY_VIOLATION: "Policy violation",
  SECURITY_RISK: "Security risk",
  CUSTOMER_REQUEST: "Customer request",
  OTHER: "Other",
};

function formatSuspendedSince(suspendedAt: string): string {
  return new Date(suspendedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function OrganizationSuspensionControls({
  organizationId,
  organizationName,
  suspendedAt,
}: {
  organizationId: string;
  organizationName: string;
  /** ISO string, or null when active — a plain Date can't cross the Server->Client boundary as a prop. */
  suspendedAt: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Operator status</p>
        <p className="mt-1 text-sm font-medium text-gray-900">
          {suspendedAt ? `Suspended since ${formatSuspendedSince(suspendedAt)}` : "Active"}
        </p>
      </div>
      {suspendedAt ? (
        <ReactivateControl organizationId={organizationId} />
      ) : (
        <SuspendControl organizationId={organizationId} organizationName={organizationName} />
      )}
    </div>
  );
}

function SuspendControl({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [reasonCode, setReasonCode] = useState<SuspensionReasonCode | "">("");
  const titleId = useId();
  const descriptionId = useId();
  const nameReferenceId = useId();
  const nameInputId = useId();
  const nameMismatchId = useId();
  const reasonSelectId = useId();

  const canConfirm = canConfirmSuspend(confirmText, organizationName, reasonCode);
  const nameMismatches = showsNameMismatch(confirmText, organizationName);

  function closeAndReset() {
    dialogRef.current?.close();
    setConfirmText("");
    setReasonCode("");
  }

  function runSuspend() {
    if (!canConfirm) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof suspendOrganizationAction>>;
      try {
        result = await suspendOrganizationAction(organizationId, reasonCode);
      } catch {
        showToast("Something went wrong. Please try again.", "error");
        return;
      }
      if (result.ok) {
        closeAndReset();
        showToast("Organization suspended");
        router.refresh();
        return;
      }
      showToast(result.message, "error");
    });
  }

  return (
    <>
      <Button type="button" variant="dangerOutline" disabled={pending} onClick={() => dialogRef.current?.showModal()}>
        Suspend
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeAndReset();
        }}
        onClose={() => {
          setConfirmText("");
          setReasonCode("");
        }}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-xl backdrop:bg-black/40"
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          Suspend organization
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-gray-600">
          Suspending blocks staff and client access immediately. No data is deleted, and you can reactivate at any time.
        </p>

        <label htmlFor={reasonSelectId} className="mt-4 block text-sm font-medium text-gray-700">
          Reason
        </label>
        <select
          id={reasonSelectId}
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value as SuspensionReasonCode | "")}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          <option value="" disabled>
            Select a reason
          </option>
          {SUSPENSION_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {REASON_LABELS[code]}
            </option>
          ))}
        </select>

        {/*
          Discoverability hotfix: the exact expected value now has its own
          dedicated, never-truncated reference — not just the page header
          (which this same fix also protects, see page.tsx) and not just
          this dialog's own former inline rendering, both of which gave a
          long/unusual organization name nowhere reliably readable to copy
          from. select-all (user-select: all) makes a single click select
          the whole value, without any Clipboard API/automatic-copy/Copy
          button — deliberately out of scope for this minimal hotfix.
          wrap-anywhere (overflow-wrap: anywhere) guarantees even a
          single long unbroken token wraps instead of overflowing this
          fixed-max-width dialog — the stronger of Tailwind's two wrap
          utilities: break-words (overflow-wrap: break-word) alone was
          proven, by this exact discoverability hotfix's own E2E
          coverage, not to be respected by this dialog's min-content
          sizing for an unbroken string, while wrap-anywhere is. Never
          truncated, ellipsized, or line-clamped.
        */}
        <p className="mt-4 text-sm font-medium text-gray-700">Exact organization name</p>
        <p id={nameReferenceId} className="mt-1 w-full select-all wrap-anywhere rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
          {organizationName}
        </p>

        <label htmlFor={nameInputId} className="mt-4 block text-sm font-medium text-gray-700">
          Type the name above to confirm
        </label>
        <input
          id={nameInputId}
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={nameMismatches ? `${nameReferenceId} ${nameMismatchId}` : nameReferenceId}
          aria-invalid={nameMismatches ? true : undefined}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        />
        {nameMismatches ? (
          <p id={nameMismatchId} className="mt-1 text-sm text-red-600">
            Name does not match.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={closeAndReset} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="dangerOutline" loading={pending} disabled={!canConfirm || pending} onClick={runSuspend}>
            Suspend
          </Button>
        </div>
      </dialog>
    </>
  );
}

function ReactivateControl({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogRef = useRef<ConfirmDialogHandle>(null);
  const [pending, startTransition] = useTransition();

  function runReactivate() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof reactivateOrganizationAction>>;
      try {
        result = await reactivateOrganizationAction(organizationId);
      } catch {
        showToast("Something went wrong. Please try again.", "error");
        return;
      }
      if (result.ok) {
        showToast("Organization reactivated");
        router.refresh();
        return;
      }
      showToast(result.message, "error");
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" disabled={pending} onClick={() => dialogRef.current?.open()}>
        Reactivate
      </Button>
      <ConfirmDialog
        ref={dialogRef}
        title="Reactivate organization"
        description="Staff and client access will be restored immediately."
        confirmLabel="Reactivate"
        onConfirm={runReactivate}
      />
    </>
  );
}
