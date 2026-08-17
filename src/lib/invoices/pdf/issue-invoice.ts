import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { assertCanAccessPaymentDetails, OrganizationSetupAccessError } from "@/lib/organization-setup/authorization";
import { getCompanyProfile } from "@/lib/organization-setup/company-profile";
import { getPaymentDetails } from "@/lib/organization-setup/payment-details";
import { createActivity } from "@/lib/activity/create-activity";
import { buildInvoiceStatusChangedMetadata } from "@/lib/activity/invoice-metadata";
import { deliverNotificationEmails } from "@/lib/notifications/email/deliver-notification-email";
import { calculateInvoiceTotals, type InvoiceCalculationInput } from "@/lib/invoices/calculations";
import type { IssueInvoiceInput, IssueInvoiceResult, IssueInvoiceErrorCode } from "@/lib/invoices/lifecycle";
import {
  buildIssuerSnapshotV1,
  buildRecipientSnapshotV1,
  parseIssuerSnapshot,
  parseRecipientSnapshot,
} from "./snapshot-types";
import { buildInvoicePdfViewModel, toRendererIssuerPresentation, toRendererRecipientPresentation } from "./view-model";
import { renderInvoicePdfBuffer } from "./document";
import { validatePdfBuffer } from "./buffer-validation";
import { buildInvoicePdfStoragePath, uploadInvoicePdfObject, removeInvoicePdfObject } from "./storage";
import { resolveInvoiceLogo, type ResolvedInvoiceLogo } from "./logo";

/**
 * Invoice System Official Slice 3, sub-PR 3b — the authoritative, OWNER-only
 * DRAFT -> SENT Issue/finalization service. Section references below are
 * this sub-PR's own implementation prompt.
 *
 * TRUSTED BOUNDARY: `input.actor` must be built entirely from server-side
 * session/membership resolution (getCurrentMembership()) by the caller (the
 * Server Action) — nothing here ever reads a cookie, header, or FormData
 * value itself. OWNER access is independently re-checked here regardless of
 * what the Server Action already verified (§7's own "never rely only on
 * hidden UI").
 *
 * NEVER RETURNED: pdfStoragePath, the Storage bucket name, raw
 * database/Storage errors, snapshot contents, or PDF bytes — see
 * IssueInvoiceResult's own definition in lifecycle.ts for the complete
 * closed result shape.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCanonicalIso(raw: string): boolean {
  const date = new Date(raw);
  return !Number.isNaN(date.getTime()) && date.toISOString() === raw;
}

/** Thrown only inside the final transaction's own callback, to distinguish "the guarded update matched zero rows" from every other unexpected failure — caught immediately below, never escapes this module. */
class IssueConflictError extends Error {}

export type IssueInvoiceDeps = {
  now: () => Date;
  generateArchiveId: () => string;
  resolveLogo: typeof resolveInvoiceLogo;
  render: typeof renderInvoicePdfBuffer;
  upload: typeof uploadInvoicePdfObject;
  remove: typeof removeInvoicePdfObject;
  deliverEmails: typeof deliverNotificationEmails;
};

const defaultDeps: IssueInvoiceDeps = {
  now: () => new Date(),
  generateArchiveId: () => randomUUID(),
  resolveLogo: resolveInvoiceLogo,
  render: renderInvoicePdfBuffer,
  upload: uploadInvoicePdfObject,
  remove: removeInvoicePdfObject,
  deliverEmails: deliverNotificationEmails,
};

function fail(error: IssueInvoiceErrorCode): IssueInvoiceResult {
  return { ok: false, error };
}

/**
 * Best-effort compensation for a Storage object that was successfully
 * uploaded but never got referenced by a committed Invoice — runs OUTSIDE
 * any DB transaction, after either an upload-ambiguous-failure or a failed
 * final transaction. Never deletes the ledger row outright; only ever
 * advances its status. If even this status update fails, the row is left
 * exactly as it was (PENDING_UPLOAD), which is itself still a safe,
 * discoverable state for the future Slice 3d reconciliation worker.
 */
async function compensateUpload(
  deps: IssueInvoiceDeps,
  ledgerId: string,
  path: string,
  now: Date,
): Promise<void> {
  const removal = await deps.remove({ path });

  try {
    if (removal.ok) {
      await prisma.invoicePdfArchiveObject.updateMany({
        where: { id: ledgerId, status: "PENDING_UPLOAD" },
        data: { status: "CLEANED", cleanedAt: now },
      });
    } else {
      await prisma.invoicePdfArchiveObject.updateMany({
        where: { id: ledgerId, status: "PENDING_UPLOAD" },
        data: {
          status: "CLEANUP_PENDING",
          cleanupAttemptCount: { increment: 1 },
          lastCleanupFailureCategory: removal.reason,
        },
      });
    }
  } catch {
    // The ledger row stays PENDING_UPLOAD — still a safe, discoverable
    // state; never re-thrown, since compensation is always best-effort.
  }
}

export async function issueInvoice(
  input: IssueInvoiceInput,
  overrides: Partial<IssueInvoiceDeps> = {},
): Promise<IssueInvoiceResult> {
  const deps: IssueInvoiceDeps = { ...defaultDeps, ...overrides };
  const { actor, invoiceId, expectedUpdatedAt } = input;

  // --- A. Authorization and early scoped read -------------------------------
  try {
    assertCanAccessPaymentDetails(actor.role);
  } catch (err) {
    if (err instanceof OrganizationSetupAccessError) return fail("FORBIDDEN");
    throw err;
  }

  if (!UUID_PATTERN.test(invoiceId)) return fail("NOT_FOUND");
  if (!isCanonicalIso(expectedUpdatedAt)) return fail("STALE_VERSION");
  const expectedDate = new Date(expectedUpdatedAt);

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: actor.organizationId,
      project: { organizationId: actor.organizationId },
      client: { organizationId: actor.organizationId },
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      invoiceNumber: true,
      currency: true,
      amount: true,
      subtotal: true,
      discountType: true,
      discountValue: true,
      taxRatePercent: true,
      taxLabel: true,
      issueDate: true,
      dueDate: true,
      notes: true,
      documentVersion: true,
      lineItems: {
        orderBy: { position: "asc" },
        select: { description: true, quantity: true, unitPrice: true },
      },
      project: { select: { name: true } },
      client: {
        select: {
          name: true,
          email: true,
          billingLegalName: true,
          company: true,
          taxId: true,
          streetAddress: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
    },
  });

  // Cross-org and nonexistent invoice ids are structurally indistinguishable
  // — the same scoped findFirst, the same NOT_FOUND result, either way.
  if (!invoice) return fail("NOT_FOUND");
  if (invoice.status !== "DRAFT") return fail("NOT_DRAFT");
  // Early fast-fail — avoids wasted render/upload work for a request that's
  // already doomed. The final transaction's own guarded updateMany (step E)
  // is the authoritative re-check against a race that happens DURING the
  // render/upload window below, never substituted by this early check alone.
  if (invoice.updatedAt.getTime() !== expectedDate.getTime()) return fail("STALE_VERSION");

  // --- B. Build immutable artifacts in memory (no DB transaction open) ------

  const calculationInput: InvoiceCalculationInput = {
    subtotalSource:
      invoice.lineItems.length > 0
        ? {
            mode: "lineItems",
            lineItems: invoice.lineItems.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
            })),
          }
        // Flat base is the pre-discount subtotal, never `amount` (already
        // net of discount/tax) — `amount` is only a fallback for a
        // genuinely null `subtotal`, which Slice 1's own migration defines
        // as equal to `amount` for exactly that legacy case.
        : { mode: "flat", amount: invoice.subtotal ?? invoice.amount },
    discount:
      invoice.discountType === "NONE"
        ? { type: "NONE" }
        : { type: invoice.discountType, value: invoice.discountValue ?? "0" },
    taxRatePercent: invoice.taxRatePercent,
  };

  const calculation = calculateInvoiceTotals(calculationInput);
  if (!calculation.ok) return fail("SNAPSHOT_INVALID");

  const recipientSnapshot = buildRecipientSnapshotV1(invoice.client);
  const parsedRecipient = parseRecipientSnapshot(recipientSnapshot);
  if (!parsedRecipient.ok) return fail("SNAPSHOT_INVALID");

  // Payment/company-profile data is read only after the OWNER check above —
  // getPaymentDetails() itself performs no role check of its own (see its
  // own doc comment); this is the one call site explicitly reviewed and
  // approved to read it, precisely because Issue is OWNER-only end to end.
  const [profile, paymentDetails, organization] = await Promise.all([
    getCompanyProfile(actor.organizationId),
    getPaymentDetails(actor.organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } }),
  ]);

  let resolvedLogo: ResolvedInvoiceLogo;
  try {
    resolvedLogo = await deps.resolveLogo({ organizationId: actor.organizationId, logoUrl: profile.logoUrl });
  } catch {
    resolvedLogo = { provenance: { included: false, reason: "fetch_failed" }, bytes: null };
  }

  const issuerSnapshot = buildIssuerSnapshotV1({
    organizationName: organization.name,
    profile: profile.legalName
      ? {
          legalName: profile.legalName,
          country: profile.country,
          taxId: profile.taxId,
          supportEmail: profile.supportEmail,
          phone: profile.phone,
          website: profile.website,
          brandColor: profile.brandColor,
          streetAddress: profile.streetAddress,
          city: profile.city,
          state: profile.state,
          postalCode: profile.postalCode,
        }
      : null,
    paymentDetails,
    logo: resolvedLogo.provenance,
  });
  const parsedIssuer = parseIssuerSnapshot(issuerSnapshot);
  if (!parsedIssuer.ok) return fail("SNAPSHOT_INVALID");

  const rendererIssuer = toRendererIssuerPresentation(parsedIssuer.snapshot, resolvedLogo.bytes);
  if (!rendererIssuer.ok) return fail("SNAPSHOT_INVALID");
  const rendererRecipient = toRendererRecipientPresentation(parsedRecipient.snapshot);

  const viewModel = buildInvoicePdfViewModel({
    documentStatus: "SENT",
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    calculation,
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    taxRatePercent: invoice.taxRatePercent,
    taxLabel: invoice.taxLabel,
    notes: invoice.notes,
    issuer: rendererIssuer.presentation,
    recipient: rendererRecipient,
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await deps.render(viewModel);
  } catch {
    return fail("RENDER_FAILED");
  }

  const validation = validatePdfBuffer(pdfBuffer);
  if (!validation.ok) {
    return fail(validation.reason === "TOO_LARGE" ? "PDF_TOO_LARGE" : "RENDER_FAILED");
  }

  // No ledger row and no Storage object exist for this attempt at this
  // point — both are created only from here on.

  // --- C. Ledger before upload ------------------------------------------
  const archiveId = deps.generateArchiveId();
  const path = buildInvoicePdfStoragePath({
    organizationId: actor.organizationId,
    invoiceId: invoice.id,
    documentVersion: invoice.documentVersion,
    archiveId,
  });

  try {
    await prisma.invoicePdfArchiveObject.create({
      data: {
        id: archiveId,
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        documentVersion: invoice.documentVersion,
        storagePath: path,
        status: "PENDING_UPLOAD",
      },
    });
  } catch {
    // Ledger creation itself failed — no upload is ever attempted.
    return fail("FINALIZATION_FAILED");
  }

  // --- D. Upload ----------------------------------------------------------
  const uploadResult = await deps.upload({ path, body: pdfBuffer });
  if (!uploadResult.ok) {
    // Upload failure can be ambiguous (a network error may have partially
    // completed server-side) — always attempt compensation rather than
    // assuming nothing was written.
    await compensateUpload(deps, archiveId, path, deps.now());
    return fail(uploadResult.reason === "storage_not_configured" ? "STORAGE_NOT_CONFIGURED" : "UPLOAD_FAILED");
  }

  // --- E. Final short transaction ------------------------------------------
  const now = deps.now();
  const nextUpdatedAt = new Date(Math.max(now.getTime(), expectedDate.getTime() + 1));

  type CommitOutcome = { ok: true; finalizedAt: Date; notificationIds: string[] } | { ok: false; error: "CONFLICT" | "FINALIZATION_FAILED" };

  let commitOutcome: CommitOutcome;
  try {
    commitOutcome = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          organizationId: actor.organizationId,
          project: { organizationId: actor.organizationId },
          client: { organizationId: actor.organizationId },
          status: "DRAFT",
          updatedAt: expectedDate,
        },
        data: {
          status: "SENT",
          finalizedAt: now,
          pdfGeneratedAt: now,
          pdfStoragePath: path,
          issuerSnapshot: issuerSnapshot as unknown as Prisma.InputJsonValue,
          recipientSnapshot: recipientSnapshot as unknown as Prisma.InputJsonValue,
          subtotal: calculation.subtotal,
          discountAmount: calculation.discountAmount,
          taxAmount: calculation.taxAmount,
          amount: calculation.total,
          updatedAt: nextUpdatedAt,
        },
      });
      if (updateResult.count === 0) throw new IssueConflictError();

      const ledgerUpdate = await tx.invoicePdfArchiveObject.updateMany({
        where: { id: archiveId, status: "PENDING_UPLOAD" },
        data: { status: "REFERENCED", referencedAt: now },
      });
      if (ledgerUpdate.count === 0) throw new IssueConflictError();

      const activity = await createActivity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        entityType: "INVOICE",
        entityId: invoice.id,
        action: "STATUS_CHANGED",
        metadata: buildInvoiceStatusChangedMetadata(
          { invoiceNumber: invoice.invoiceNumber },
          invoice.project.name,
          "DRAFT",
          "SENT",
          actor.userName,
        ),
      });

      return { ok: true, finalizedAt: now, notificationIds: activity.notificationIds };
    });
  } catch (err) {
    commitOutcome = err instanceof IssueConflictError ? { ok: false, error: "CONFLICT" } : { ok: false, error: "FINALIZATION_FAILED" };
  }

  if (!commitOutcome.ok) {
    // No Storage operation runs inside the transaction above — compensation
    // always happens out here, after it has already failed/rolled back.
    await compensateUpload(deps, archiveId, path, deps.now());
    return fail(commitOutcome.error);
  }

  // --- G. Post-commit delivery ----------------------------------------------
  // The real deliverNotificationEmails() is documented to never throw (see
  // its own header comment) — but an injected `deps.deliverEmails` must
  // never be trusted to uphold that either (the exact same reasoning
  // retry-notification-deliveries.ts's own sendEmail try/catch already
  // applies). The Invoice is already finalized at this point; a delivery
  // failure must never surface as an Issue failure.
  try {
    await deps.deliverEmails(commitOutcome.notificationIds);
  } catch {
    // Best-effort — swallowed. The finalized Invoice is already committed.
  }

  return { ok: true, invoiceId: invoice.id, finalizedAt: commitOutcome.finalizedAt };
}
