"use client";

import { useActionState } from "react";
import { CopyLinkButton } from "./copy-link-button";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import type { InvitationFormState } from "@/types";

const initialState: InvitationFormState = { error: null };

export function ResendInvitationForm({
  action,
  initialToken,
}: {
  action: (
    prevState: InvitationFormState,
    formData: FormData,
  ) => Promise<InvitationFormState>;
  initialToken: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  // Copy must always reflect the latest token — once a resend succeeds,
  // state.token holds the fresh one; until then it falls back to the prop.
  const token = state.token ?? initialToken;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <CopyLinkButton token={token} />
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className={`${ACTION_LINK_CLASSES} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {pending ? "Resending…" : "Resend"}
          </button>
        </form>
      </div>
      {state.error && (
        <p role="alert" className="text-danger text-xs">
          {state.error}
        </p>
      )}
      {state.message && !state.error && (
        <p
          role="status"
          className={`text-xs ${state.emailFailed ? "text-warning" : "text-success"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
