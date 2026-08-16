import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildInvoiceTotalsViewModel } from "@/components/invoices/invoice-read-only-view";
import { changeInvoiceStatusAction } from "@/app/(dashboard)/invoices/[id]/status-actions";
import { updateInvoiceInternalNotesAction } from "@/app/(dashboard)/invoices/[id]/internal-notes-actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";

/**
 * Proves Slice 2b tolerates a genuine pre-Slice-1 legacy row — nullable
 * subtotal/discountAmount/taxAmount, zero line items — through every code
 * path this slice adds, without crashing and without fabricating data.
 * `amount` remains the canonical total every Dashboard/Analytics/Search/
 * Portal query already reads (docs/invoicing-architecture.md §11); this
 * slice writes nothing that would change what those queries see for an
 * untouched legacy row.
 */
const INVOICE_NUMBER_PREFIX = "INV-LEGACY";

describe("legacy invoice compatibility", () => {
  let fixtures: TestFixtures;
  let legacyDraft: { id: string; amount: unknown };
  let legacySent: { id: string; amount: unknown };

  beforeAll(async () => {
    fixtures = await seedTestData();
    // Deliberately omits subtotal/discountAmount/taxAmount — exactly the
    // pre-Slice-1 shape (nullable, unbackfilled).
    legacyDraft = await prisma.invoice.create({
      data: {
        invoiceNumber: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}-draft`,
        status: "DRAFT",
        amount: "321.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    legacySent = await prisma.invoice.create({
      data: {
        invoiceNumber: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}-sent`,
        status: "SENT",
        amount: "654.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}` } } });
    await cleanupTestData(fixtures);
  });

  it("a legacy row fetched fresh from the DB has null subtotal/discountAmount/taxAmount", async () => {
    const fetched = await prisma.invoice.findUniqueOrThrow({ where: { id: legacyDraft.id } });
    expect(fetched.subtotal).toBeNull();
    expect(fetched.discountAmount).toBeNull();
    expect(fetched.taxAmount).toBeNull();
    expect(fetched.amount.toFixed(2)).toBe("321.00");
  });

  it("buildInvoiceTotalsViewModel renders it safely — displayedSubtotal falls back to amount, no fabricated rows", async () => {
    const fetched = await prisma.invoice.findUniqueOrThrow({ where: { id: legacyDraft.id } });
    const totals = buildInvoiceTotalsViewModel({
      amount: fetched.amount,
      subtotal: fetched.subtotal,
      discountType: fetched.discountType,
      discountAmount: fetched.discountAmount,
      discountValue: fetched.discountValue,
      taxRatePercent: fetched.taxRatePercent,
      taxAmount: fetched.taxAmount,
      taxLabel: fetched.taxLabel,
      currency: fetched.currency,
    });
    expect(totals.displayedSubtotal).toBe("$321.00");
    expect(totals.discountRow).toBeNull();
    expect(totals.taxRow).toBeNull();
    expect(totals.total).toBe("$321.00");
  });

  it("zero InvoiceLineItem rows is still the correct flat classification for a legacy row", async () => {
    const fetched = await prisma.invoice.findUniqueOrThrow({ where: { id: legacyDraft.id }, include: { lineItems: true } });
    expect(fetched.lineItems).toEqual([]);
  });

  it("lifecycle transitions work correctly on a legacy SENT row with null transitional totals", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const result = await changeInvoiceStatusAction(legacySent.id, "PAID");
    resetAuthMock();

    expect(result).toEqual({ ok: true });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: legacySent.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidAt).not.toBeNull();
    // subtotal/discountAmount/taxAmount remain untouched (still null) —
    // the lifecycle action never writes them.
    expect(after.subtotal).toBeNull();
  });

  it("internalNotes can be set on a legacy row with null transitional totals", async () => {
    const legacyCancelled = await prisma.invoice.create({
      data: {
        invoiceNumber: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}-${randomUUID().slice(0, 8)}`,
        status: "CANCELLED",
        amount: "10.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    actAs(fixtures.owner, fixtures.orgA.id);
    const result = await updateInvoiceInternalNotesAction(legacyCancelled.id, "a note on a legacy row");
    resetAuthMock();

    expect(result).toEqual({ ok: true });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: legacyCancelled.id } });
    expect(after.internalNotes).toBe("a note on a legacy row");
  });

  it("amount remains the canonical total unaffected by this slice for an untouched legacy row", async () => {
    const untouched = await prisma.invoice.findUniqueOrThrow({ where: { id: legacyDraft.id } });
    expect(untouched.amount.toFixed(2)).toBe("321.00");
  });
});
