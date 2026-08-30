"use client";

import { useRef, useState } from "react";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";

export function TransferOwnershipButton({
  memberName,
  onConfirm,
}: {
  memberName: string;
  /** Calls changeRoleAction(membershipId, "OWNER") and returns its error, if any. */
  onConfirm: () => Promise<{ error: string | null }>;
}) {
  const dialogRef = useRef<ConfirmDialogHandle>(null);
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await onConfirm();
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(`${memberName} is now the owner`);
      }
    } catch {
      showToast(`Failed to transfer ownership to ${memberName}.`, "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => dialogRef.current?.open()}
        className={`${ACTION_LINK_CLASSES} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Make owner
      </button>
      <ConfirmDialog
        ref={dialogRef}
        title="Transfer ownership"
        description={`Make ${memberName} the owner of this organization? You will become an Admin.`}
        confirmLabel="Transfer ownership"
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
