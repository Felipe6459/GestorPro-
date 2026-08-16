import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInvoiceAction } from "@/app/(dashboard)/invoices/new/actions";
import { updateInvoiceAction } from "@/app/(dashboard)/invoices/[id]/edit/actions";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";
import { RedirectSignal } from "../../support/navigation-mock";

/**
 * Invoice System Slice 1 — flat invoice dual-write compatibility
 * (docs/invoicing-architecture.md §12 step 3). Proves the real
 * createInvoiceAction/updateInvoiceAction Server Actions (never a fixture
 * that manufactures the new columns directly) write the exact transitional
 * totals contract for every flat invoice: subtotal mirrors amount,
 * discount/tax are zeroed, and no archive/snapshot/line-item field is ever
 * touched — while every pre-existing behavior (paidAt four-case rule,
 * tenant scoping, amount as the canonical total) is unchanged.
 */

const INVOICE_NUMBER_PREFIX = "INV-SLICE1";

function uniqueInvoiceNumber(runId: string): string {
  return `${INVOICE_NUMBER_PREFIX}-${runId}-${randomUUID().slice(0, 8)}`;
}

function buildInvoiceFormData(fields: {
  invoiceNumber: string;
  projectId: string;
  amount?: string;
  status?: string;
  dueDate?: string;
  notes?: string;
}): FormData {
  const formData = new FormData();
  formData.set("invoiceNumber", fields.invoiceNumber);
  formData.set("projectId", fields.projectId);
  formData.set("amount", fields.amount ?? "100.00");
  formData.set("status", fields.status ?? "DRAFT");
  formData.set("dueDate", fields.dueDate ?? "");
  formData.set("notes", fields.notes ?? "");
  return formData;
}

async function expectRedirect(promise: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RedirectSignal);
}

describe("Invoice Slice 1 — flat dual-write compatibility", () => {
  let fixtures: TestFixtures;
  let projectB: { id: string };

  beforeAll(async () => {
    fixtures = await seedTestData();
    projectB = await prisma.project.create({
      data: {
        name: `Slice1 Org B Project ${fixtures.runId}`,
        clientId: fixtures.clientB.id,
        organizationId: fixtures.orgB.id,
        ownerId: fixtures.orgBOwner.id,
        status: "IN_PROGRESS",
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: `${INVOICE_NUMBER_PREFIX}-${fixtures.runId}` } } });
    await prisma.project.deleteMany({ where: { id: projectB.id } });
    await cleanupTestData(fixtures);
  });

  it("create: writes subtotal = amount, zeroed discount/tax, taxLabel TAX, and no archive/snapshot/line-item field", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const invoiceNumber = uniqueInvoiceNumber(fixtures.runId);

    await expectRedirect(
      createInvoiceAction(
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, amount: "123.45" }),
      ),
    );
    resetAuthMock();

    const created = await prisma.invoice.findUniqueOrThrow({
      where: { clientId_invoiceNumber: { clientId: fixtures.clientA.id, invoiceNumber } },
      include: { lineItems: true, emailAttempts: true },
    });

    expect(created.amount.toFixed(2)).toBe("123.45");
    expect(created.subtotal?.toFixed(2)).toBe("123.45");
    expect(created.discountType).toBe("NONE");
    expect(created.discountValue).toBeNull();
    expect(created.discountAmount?.toFixed(2)).toBe("0.00");
    expect(created.taxRatePercent).toBeNull();
    expect(created.taxAmount?.toFixed(2)).toBe("0.00");
    expect(created.taxLabel).toBe("TAX");

    // No archive/finalization/line-item write of any kind.
    expect(created.finalizedAt).toBeNull();
    expect(created.issuerSnapshot).toBeNull();
    expect(created.recipientSnapshot).toBeNull();
    expect(created.pdfStoragePath).toBeNull();
    expect(created.pdfGeneratedAt).toBeNull();
    expect(created.internalNotes).toBeNull();
    expect(created.lineItems).toEqual([]);
    expect(created.emailAttempts).toEqual([]);
  });

  it("edit: updates subtotal when amount changes, keeps discount/tax NONE/zero/null", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const invoiceNumber = uniqueInvoiceNumber(fixtures.runId);
    await expectRedirect(
      createInvoiceAction(
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, amount: "50.00" }),
      ),
    );
    const created = await prisma.invoice.findUniqueOrThrow({
      where: { clientId_invoiceNumber: { clientId: fixtures.clientA.id, invoiceNumber } },
    });
    expect(created.subtotal?.toFixed(2)).toBe("50.00");

    await expectRedirect(
      updateInvoiceAction(
        created.id,
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, amount: "75.50" }),
      ),
    );
    resetAuthMock();

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.amount.toFixed(2)).toBe("75.50");
    expect(updated.subtotal?.toFixed(2)).toBe("75.50");
    expect(updated.discountType).toBe("NONE");
    expect(updated.discountValue).toBeNull();
    expect(updated.discountAmount?.toFixed(2)).toBe("0.00");
    expect(updated.taxRatePercent).toBeNull();
    expect(updated.taxAmount?.toFixed(2)).toBe("0.00");
    expect(updated.taxLabel).toBe("TAX");
    expect(updated.finalizedAt).toBeNull();
    expect(updated.pdfStoragePath).toBeNull();
  });

  it("paidAt four-case rule is unchanged by the Slice 1 write path", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const invoiceNumber = uniqueInvoiceNumber(fixtures.runId);
    await expectRedirect(
      createInvoiceAction(
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, status: "DRAFT" }),
      ),
    );
    const created = await prisma.invoice.findUniqueOrThrow({
      where: { clientId_invoiceNumber: { clientId: fixtures.clientA.id, invoiceNumber } },
    });
    expect(created.paidAt).toBeNull();

    // not-PAID -> PAID stamps a fresh paidAt.
    await expectRedirect(
      updateInvoiceAction(
        created.id,
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, status: "PAID" }),
      ),
    );
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(paid.paidAt).not.toBeNull();
    const stampedPaidAt = paid.paidAt;

    // PAID -> PAID is a no-op on paidAt.
    await expectRedirect(
      updateInvoiceAction(
        created.id,
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, status: "PAID", amount: "200.00" }),
      ),
    );
    const stillPaid = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(stillPaid.paidAt?.getTime()).toBe(stampedPaidAt?.getTime());
    // The Slice 1 dual-write still applies on this same update.
    expect(stillPaid.subtotal?.toFixed(2)).toBe("200.00");

    // PAID -> not-PAID clears it.
    await expectRedirect(
      updateInvoiceAction(
        created.id,
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, status: "SENT" }),
      ),
    );
    resetAuthMock();
    const unpaid = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(unpaid.paidAt).toBeNull();
  });

  it("tenant/project/client scoping is unchanged — a cross-organization project is still rejected", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const invoiceNumber = uniqueInvoiceNumber(fixtures.runId);

    const result = await createInvoiceAction(
      { error: null },
      buildInvoiceFormData({ invoiceNumber, projectId: projectB.id }),
    );
    resetAuthMock();

    expect(result).toEqual({ error: null, fieldErrors: { projectId: "Select a valid project." } });
    const created = await prisma.invoice.findFirst({ where: { invoiceNumber } });
    expect(created).toBeNull();
  });

  it("amount remains the canonical total — unaffected by the new transitional columns", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const invoiceNumber = uniqueInvoiceNumber(fixtures.runId);
    await expectRedirect(
      createInvoiceAction(
        { error: null },
        buildInvoiceFormData({ invoiceNumber, projectId: fixtures.project.id, amount: "999.99" }),
      ),
    );
    resetAuthMock();

    const created = await prisma.invoice.findUniqueOrThrow({
      where: { clientId_invoiceNumber: { clientId: fixtures.clientA.id, invoiceNumber } },
    });
    // amount is written exactly as submitted, independent of subtotal.
    expect(created.amount.toFixed(2)).toBe("999.99");
    expect(created.subtotal?.toFixed(2)).toBe(created.amount.toFixed(2));
  });
});
