export type AuthActionState = {
  error: string | null;
  message?: string | null;
};

export type ClientFormState = {
  error: string | null;
  fieldErrors?: Partial<
    Record<"name" | "email" | "company" | "phone" | "status", string>
  >;
};

export type ProjectFormState = {
  error: string | null;
  fieldErrors?: Partial<
    Record<"name" | "clientId" | "status" | "startDate" | "endDate", string>
  >;
};

export type TaskFormState = {
  error: string | null;
  fieldErrors?: Partial<
    Record<"title" | "projectId" | "status" | "priority" | "dueDate", string>
  >;
};

export type InvoiceFormState = {
  error: string | null;
  fieldErrors?: Partial<
    Record<
      "invoiceNumber" | "projectId" | "amount" | "status" | "dueDate",
      string
    >
  >;
};

export type InvitationFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<"email" | "role", string>>;
  message?: string | null;
  /** Set on success so the UI can render a copyable invite link. */
  token?: string;
  /**
   * True when the Invitation was created/updated successfully but the
   * email itself could not be delivered — `message` still describes what
   * happened, this just tells the UI to render it as a warning instead of
   * a success (Copy link remains the fallback either way).
   */
  emailFailed?: boolean;
};

export type InviteAcceptState = {
  error: string | null;
};

export type PortalInvitationFormState = {
  error: string | null;
  fieldErrors?: Partial<Record<"email", string>>;
  message?: string | null;
  /** Set on success so the UI can render a copyable invite link. */
  token?: string;
  /**
   * True when the ClientInvitation was created/updated successfully but the
   * email itself could not be delivered — `message` still describes what
   * happened, this just tells the UI to render it as a warning instead of
   * a success (Copy link remains the fallback either way).
   */
  emailFailed?: boolean;
};

export type MembershipActionState = {
  error: string | null;
};

export type AttachmentUploadState = {
  error: string | null;
};
