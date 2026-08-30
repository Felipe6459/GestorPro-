"use client";

import { useRef, useState } from "react";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { Button } from "@/components/ui/button";

export function LeaveOrganizationButton({
  action,
  disabled = false,
  disabledReason,
}: {
  /** leaveOrganizationAction — takes no arguments, redirects on success. */
  action: () => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const dialogRef = useRef<ConfirmDialogHandle>(null);
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      // On success this redirects (and never returns) — a toast for that
      // case is shown by the destination page via the action's own
      // redirect(withToast(...)). We only need to handle the error path.
      await action();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to leave the organization.",
        "error",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || pending}
        onClick={() => dialogRef.current?.open()}
      >
        Leave organization
      </Button>
      {disabled && disabledReason && (
        <p className="text-text-muted mt-1 text-xs">{disabledReason}</p>
      )}
      <ConfirmDialog
        ref={dialogRef}
        title="Leave organization"
        description="Are you sure you want to leave this organization? You'll lose access to its clients, projects, tasks, and invoices."
        confirmLabel="Leave"
        destructive
        onConfirm={handleConfirm}
      />
    </div>
  );
}
