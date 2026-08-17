import type { InvoiceStatus, Role } from "@/generated/prisma/browser";

/**
 * Invoice System Slice 2a — pure lifecycle helpers and a type-only Slice 3
 * contract (docs/invoicing-architecture.md §3.1/§14 Slice 2). Nothing in
 * this module is wired into any live route, Server Action, or component
 * yet — that wiring is Slice 2b's job. This file exists now so Slice 2b
 * can import a single, already-tested source of truth instead of
 * re-deriving the transition matrix inline a second time.
 *
 * No I/O, no Prisma Client import, no `new Date()` call anywhere in this
 * file — every function here is a pure function of its arguments.
 */

/**
 * The exact transition matrix from docs/invoicing-architecture.md §3.1.
 * `DRAFT` transitions to nothing here: `DRAFT -> SENT` is the future
 * Slice 3 Issue operation (not a status-change action, see
 * `IssueInvoiceResult` below), and `DRAFT -> CANCELLED`/`PAID`/`OVERDUE`
 * are all forbidden outright (abandoning a draft that was never issued is
 * a plain delete, never a status transition). `CANCELLED` is terminal.
 * `PAID -> CANCELLED`/`OVERDUE` are both forbidden directly — correcting a
 * mistaken `PAID` mark must go through `SENT` first (an explicit, single
 * "undo" step, not a silent multi-hop transition).
 *
 * `as const satisfies` gives every array a readonly tuple type (so
 * `ALLOWED_STATUS_TRANSITIONS.SENT.push(...)` fails to type-check) without
 * widening the literal status strings to `string`; `Object.freeze` on the
 * outer object additionally guards against runtime reassignment of a whole
 * row (e.g. `ALLOWED_STATUS_TRANSITIONS.SENT = [...]`) in non-type-checked
 * contexts.
 */
const TRANSITIONS_LITERAL = {
  DRAFT: [],
  SENT: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PAID", "SENT", "CANCELLED"],
  PAID: ["SENT"],
  CANCELLED: [],
} as const satisfies Record<InvoiceStatus, readonly InvoiceStatus[]>;

// Re-typed to a uniform `readonly InvoiceStatus[]` per row (rather than
// each row's own narrower literal-tuple type) — otherwise TypeScript
// infers `isTransitionAllowed`'s indexed lookup as a union of the
// differently-narrow per-row tuple types, which then rejects a plain
// `InvoiceStatus` argument to `.includes()` for any row inferred as
// `readonly never[]` (DRAFT/CANCELLED, both empty).
export const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> =
  Object.freeze(TRANSITIONS_LITERAL);

/** Whether `from -> to` is an allowed transition per the matrix above. `from === to` is never allowed (every row's own column is absent from its array). */
export function isTransitionAllowed(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export type PaidAtUpdate = { paidAt?: Date | null };

/**
 * Reproduces the exact 4-case `paidAt` rule already inline in
 * `src/app/(dashboard)/invoices/[id]/edit/actions.ts` today — this
 * function is not yet called by that file (Slice 2b rewires it); it exists
 * now, independently tested against the same 4 cases, so Slice 2b has a
 * single already-correct implementation to switch to rather than
 * re-deriving the rule a second time.
 *
 * `now` is an explicit, injected parameter — never `new Date()` internally
 * — so this function is genuinely deterministic and unit-testable without
 * faking the system clock. The future caller passes `new Date()` itself.
 *
 *   not-PAID -> PAID    : stamp a fresh paidAt         -> { paidAt: now }
 *   PAID -> not-PAID    : clear it                     -> { paidAt: null }
 *   PAID -> PAID        : omit the key (leave untouched) -> {}
 *   not-PAID -> not-PAID: omit the key (nothing to change) -> {}
 */
export function computePaidAtUpdate(wasPaid: boolean, willBePaid: boolean, now: Date): PaidAtUpdate {
  if (!wasPaid && willBePaid) return { paidAt: now };
  if (wasPaid && !willBePaid) return { paidAt: null };
  return {};
}

// ---------------------------------------------------------------------------
// Slice 3 Issue contract (docs/invoicing-architecture.md §8.1/§14 Slice 3)
// ---------------------------------------------------------------------------
//
// The live contract for src/lib/invoices/pdf/issue-invoice.ts's
// issueInvoice(), implemented in sub-PR 3b. Still type-only in this file —
// the real function lives in issue-invoice.ts, which imports these types
// rather than redeclaring them, so callers (the Server Action, tests) and
// the implementation always agree on one shape.
//
// Corrected from the original Slice 2a placeholder: `IssueInvoiceInput` no
// longer accepts a bare `organizationId` from a caller — every field on
// `TrustedIssueActor` must come from server-side session/membership
// resolution (getCurrentMembership()), never from FormData/client input.
// `IssueInvoiceSuccess` no longer exposes `pdfStoragePath` — the archive
// path is server-internal only, never returned to any caller (see
// issue-invoice.ts's own header comment for why).

export type TrustedIssueActor = {
  organizationId: string;
  userId: string;
  userName: string;
  role: Role;
};

export type IssueInvoiceInput = {
  actor: TrustedIssueActor;
  invoiceId: string;
  /** The exact page-rendered `Invoice.updatedAt.toISOString()` value — the same optimistic-concurrency contract updateInvoiceAction already uses. */
  expectedUpdatedAt: string;
};

export type IssueInvoiceSuccess = {
  ok: true;
  invoiceId: string;
  finalizedAt: Date;
};

export type IssueInvoiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_DRAFT"
  | "STALE_VERSION"
  | "SNAPSHOT_INVALID"
  | "STORAGE_NOT_CONFIGURED"
  | "RENDER_FAILED"
  | "PDF_TOO_LARGE"
  | "UPLOAD_FAILED"
  | "CONFLICT"
  | "FINALIZATION_FAILED";

export type IssueInvoiceFailure = {
  ok: false;
  error: IssueInvoiceErrorCode;
};

export type IssueInvoiceResult = IssueInvoiceSuccess | IssueInvoiceFailure;
