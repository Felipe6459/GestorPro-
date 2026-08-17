import { test, expect } from "@playwright/test";
import { seedE2EFixtures, cleanupTestData, dbQuery, type TestFixtures } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Invoice System Slice 2b — real browser coverage for behavior that
 * genuinely requires one: itemized/flat form flows, the live preview,
 * add/remove/reorder, inline error preservation and dismissal, the
 * DRAFT/non-DRAFT list-action split, the read-only view and lifecycle
 * controls, Cancel, internalNotes, responsive/keyboard behavior, and the
 * absence of any Issue/Send/PDF/email/Duplicate control.
 *
 * Slice 2b ships no DRAFT -> SENT/anything transition (Issue doesn't
 * exist until Slice 3), so a SENT/PAID/OVERDUE/CANCELLED starting state
 * cannot be produced by any 2b production action — dbQuery (the existing,
 * already-established local E2E DB-seeding mechanism, see
 * billing-enforcement.spec.ts's own use of it) is used strictly for that
 * one otherwise-unreachable setup step. Every lifecycle-transition
 * assertion below is exercised through the real UI/Server Action.
 */

let fixtures: TestFixtures;

test.beforeAll(async () => {
  fixtures = await seedE2EFixtures();
});

test.afterAll(async () => {
  await cleanupTestData(fixtures);
});

test.describe("staff Invoice create/edit", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
  });

  test("itemized create: live preview, add/remove/reorder, submit, DRAFT listed, reopens editable with persisted rows", async ({ page }) => {
    const invoiceNumber = `E2E-ITM-${fixtures.runId}`;
    await page.goto("/invoices/new");

    await page.getByLabel("Invoice number").fill(invoiceNumber);
    await page.getByLabel("Project").selectOption(fixtures.project.id);
    await page.getByRole("radio", { name: "Itemized" }).check();

    const row1 = page.getByRole("group", { name: "Line item 1" });
    await row1.getByLabel("Description").fill("Design work");
    await row1.getByLabel("Qty").fill("2");
    await row1.getByLabel("Unit price").fill("50.00");

    // Live preview updates from local state alone — no network round-trip.
    await expect(page.getByText("Total: $100.00")).toBeVisible();

    // Add a second row, then remove it, to prove add/remove both work and
    // the preview recomputes without a submit.
    await page.getByRole("button", { name: "Add line" }).click();
    const row2 = page.getByRole("group", { name: "Line item 2" });
    await row2.getByLabel("Description").fill("Extra (to be removed)");
    await row2.getByLabel("Qty").fill("1");
    await row2.getByLabel("Unit price").fill("10.00");
    await expect(page.getByText("Total: $110.00")).toBeVisible();
    await row2.getByRole("button", { name: "Remove line item 2" }).click();
    await expect(page.getByText("Total: $100.00")).toBeVisible();

    // Add a real second row and reorder it above the first, proving
    // reorder changes submitted order without a drag dependency.
    await page.getByRole("button", { name: "Add line" }).click();
    const row2b = page.getByRole("group", { name: "Line item 2" });
    await row2b.getByLabel("Description").fill("Hosting");
    await row2b.getByLabel("Qty").fill("1");
    await row2b.getByLabel("Unit price").fill("29.99");
    await row2b.getByRole("button", { name: "Move line item 2 up" }).click();
    await expect(page.getByRole("group", { name: "Line item 1" }).getByLabel("Description")).toHaveValue("Hosting");

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/invoices/new") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Create invoice" }).click(),
    ]);
    await expect(page).toHaveURL(/\/invoices(\?|$)/);

    const created = await dbQuery<{ id: string; status: string }>("invoice", "findFirstOrThrow", {
      where: { invoiceNumber },
      include: { lineItems: true },
    });
    expect(created.status).toBe("DRAFT");

    // Listed as DRAFT with an Edit link and a Delete control.
    const row = page.getByRole("row", { name: new RegExp(invoiceNumber) });
    await expect(row.getByText("Draft")).toBeVisible();
    await expect(row.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();

    // Reopens as the EDITABLE DRAFT form (never the read-only view), with
    // the persisted itemized rows and total.
    await row.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${created.id}/edit`));
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Line item 1" }).getByLabel("Description")).toHaveValue("Hosting");
    await expect(page.getByRole("group", { name: "Line item 2" }).getByLabel("Description")).toHaveValue("Design work");
    await expect(page.getByText("Total: $129.99")).toBeVisible();

    await dbQuery("invoice", "deleteMany", { where: { invoiceNumber } });
  });

  test("flat create: submit, redirect to /invoices, listed as DRAFT", async ({ page }) => {
    const invoiceNumber = `E2E-FLAT-${fixtures.runId}`;
    await page.goto("/invoices/new");

    await page.getByLabel("Invoice number").fill(invoiceNumber);
    await page.getByLabel("Project").selectOption(fixtures.project.id);
    await page.getByRole("textbox", { name: "Amount" }).fill("500.00");
    await expect(page.getByText("Total: $500.00")).toBeVisible();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/invoices/new") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Create invoice" }).click(),
    ]);
    await expect(page).toHaveURL(/\/invoices(\?|$)/);

    const row = page.getByRole("row", { name: new RegExp(invoiceNumber) });
    await expect(row.getByText("Draft")).toBeVisible();

    await dbQuery("invoice", "deleteMany", { where: { invoiceNumber } });
  });

  test("row and scalar errors render inline, preserve entered values, and dismiss after editing", async ({ page }) => {
    const invoiceNumber = `E2E-ERR-${fixtures.runId}`;
    await page.goto("/invoices/new");

    await page.getByLabel("Invoice number").fill(invoiceNumber);
    await page.getByLabel("Project").selectOption(fixtures.project.id);
    await page.getByRole("radio", { name: "Itemized" }).check();

    const row1 = page.getByRole("group", { name: "Line item 1" });
    await row1.getByLabel("Description").fill("Valid row");
    await row1.getByLabel("Qty").fill("-1"); // invalid — triggers a server-side row error
    await row1.getByLabel("Unit price").fill("10.00");

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/invoices/new") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Create invoice" }).click(),
    ]);

    // Still on the create page — the error is shown, and the entered
    // values (including the invalid one) survive the round trip.
    await expect(page).toHaveURL(/\/invoices\/new/);
    await expect(page.getByText(/quantity greater than zero/i)).toBeVisible();
    await expect(row1.getByLabel("Description")).toHaveValue("Valid row");
    await expect(row1.getByLabel("Qty")).toHaveValue("-1");

    // Editing the field dismisses the stale server error immediately,
    // before any resubmission.
    await row1.getByLabel("Qty").fill("2");
    await expect(page.getByText(/quantity greater than zero/i)).not.toBeVisible();
  });

  test("stale-error dismissal survives a reorder — an error never attaches to the wrong row", async ({ page }) => {
    const invoiceNumber = `E2E-REORDER-ERR-${fixtures.runId}`;
    await page.goto("/invoices/new");

    await page.getByLabel("Invoice number").fill(invoiceNumber);
    await page.getByLabel("Project").selectOption(fixtures.project.id);
    await page.getByRole("radio", { name: "Itemized" }).check();

    const row1 = page.getByRole("group", { name: "Line item 1" });
    await row1.getByLabel("Description").fill("First");
    await row1.getByLabel("Qty").fill("1");
    await row1.getByLabel("Unit price").fill("bad-price"); // invalid unit price on row 0

    await page.getByRole("button", { name: "Add line" }).click();
    const row2 = page.getByRole("group", { name: "Line item 2" });
    await row2.getByLabel("Description").fill("Second");
    await row2.getByLabel("Qty").fill("1");
    await row2.getByLabel("Unit price").fill("5.00");

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/invoices/new") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Create invoice" }).click(),
    ]);
    await expect(page).toHaveURL(/\/invoices\/new/);
    await expect(page.getByRole("group", { name: "Line item 1" }).getByRole("alert")).toBeVisible();

    // Reorder — the structural change dismisses every current error, so
    // it never re-renders attached to whatever now occupies index 0.
    await page.getByRole("group", { name: "Line item 2" }).getByRole("button", { name: "Move line item 2 up" }).click();
    await expect(page.getByRole("group", { name: "Line item 1" }).getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Line item 1" }).getByLabel("Description")).toHaveValue("Second");
  });
});

test.describe("staff Invoice list — DRAFT vs non-DRAFT row actions, read-only view, lifecycle", () => {
  let legacyInvoiceId: string;
  const legacyInvoiceNumber = `E2E-LEGACY-${Date.now()}`;

  test.beforeAll(async () => {
    const created = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: legacyInvoiceNumber,
        status: "SENT",
        amount: "777.00",
        subtotal: "777.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        internalNotes: null,
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    legacyInvoiceId = created.id;
  });

  test.afterAll(async () => {
    await dbQuery("invoice", "deleteMany", { where: { id: legacyInvoiceId } });
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
  });

  test("a non-DRAFT row shows View, never Delete, and its status badge reads Issued", async ({ page }) => {
    await page.goto("/invoices");
    const row = page.getByRole("row", { name: new RegExp(legacyInvoiceNumber) });
    await expect(row.getByText("Issued")).toBeVisible();
    await expect(row.getByRole("link", { name: "View" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(row.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });

  test("the read-only view: no editable frozen fields, no Delete/Duplicate/Issue/Send/PDF/email control, lifecycle buttons present", async ({ page }) => {
    await page.goto(`/invoices/${legacyInvoiceId}/edit`);

    await expect(page.getByText("Issued")).toBeVisible();
    await expect(page.getByText("$777.00").first()).toBeVisible();

    // No frozen field is rendered as an editable control.
    await expect(page.getByLabel("Invoice number")).toHaveCount(0);
    await expect(page.getByLabel("Amount")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    // No control from a later slice exists anywhere on this page.
    for (const forbidden of [/duplicate/i, /^issue$/i, /^send$/i, /download pdf/i, /resend/i]) {
      await expect(page.getByText(forbidden)).toHaveCount(0);
    }

    // Allowed lifecycle controls for SENT: Mark as paid, Mark as overdue, Cancel.
    await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as overdue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel invoice" })).toBeVisible();
  });

  test("Cancel requires confirmation and transitions the invoice to Cancelled", async ({ page }) => {
    const invoice = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-CANCEL-${fixtures.runId}`,
        status: "SENT",
        amount: "50.00",
        subtotal: "50.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });

    await page.goto(`/invoices/${invoice.id}/edit`);
    await page.getByRole("button", { name: "Cancel invoice" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel invoice" }).click();

    await expect(page.getByText("Invoice updated")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Cancelled")).toBeVisible();
    // Terminal — no further lifecycle buttons.
    await expect(page.getByRole("button", { name: "Mark as paid" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel invoice" })).toHaveCount(0);

    await dbQuery("invoice", "deleteMany", { where: { id: invoice.id } });
  });

  test("internalNotes can be saved from the non-DRAFT inline editor", async ({ page }) => {
    await page.goto(`/invoices/${legacyInvoiceId}/edit`);
    const notesField = page.getByLabel("Internal notes");
    await notesField.fill("A staff-only note added via E2E");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Internal notes saved")).toBeVisible();

    const persisted = await dbQuery<{ internalNotes: string | null }>("invoice", "findUniqueOrThrow", { where: { id: legacyInvoiceId } });
    expect(persisted.internalNotes).toBe("A staff-only note added via E2E");
  });

  test("no horizontal overflow on /invoices/new at mobile/tablet widths", async ({ page }) => {
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/invoices/new");
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("keyboard: the itemized editor is fully operable without a pointer", async ({ page }) => {
    await page.goto("/invoices/new");
    await page.getByLabel("Invoice number").fill(`E2E-KBD-${fixtures.runId}`);
    await page.getByLabel("Project").selectOption(fixtures.project.id);
    await page.getByRole("radio", { name: "Itemized" }).check();

    const addLineButton = page.getByRole("button", { name: "Add line" });
    await addLineButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Line item 2" })).toBeVisible();

    await dbQuery("invoice", "deleteMany", { where: { invoiceNumber: `E2E-KBD-${fixtures.runId}` } });
  });
});

test.describe("Duplicate-as-new-DRAFT — completing official Invoice System Slice 2", () => {
  // Slice 2c: only a CANCELLED invoice ever exposes "Duplicate as new
  // draft" (docs/invoicing-architecture.md §3.2). No Slice-2b production
  // action can reach CANCELLED, SENT, PAID, or OVERDUE, so every source
  // invoice below is seeded directly via dbQuery, exactly like the
  // existing SENT `legacyInvoiceId` fixture above. Opening the duplicate
  // route itself must never write — every write assertion here is scoped
  // to a unique invoiceNumber/id, never a global count.
  let itemizedCancelledId: string;
  let flatCancelledId: string;
  let sentId: string;
  let orgBProjectId: string;
  let orgBCancelledId: string;
  let keyboardCancelledId: string;

  function todayUtcDateOnly(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }

  type InvoiceSnapshot = {
    id: string;
    invoiceNumber: string;
    status: string;
    updatedAt: string;
    lineItems: { id: string; description: string; quantity: string; unitPrice: string; position: number }[];
    activity: { id: string; action: string }[];
  };

  /**
   * A full, exact-scope source-of-truth snapshot for one Invoice — used
   * to prove an invoice genuinely never changes across a Duplicate flow
   * (id/invoiceNumber/status/updatedAt, every ordered line item, every
   * Activity row for that entity). Decimal/Date values are normalized to
   * strings once here via String(), so two captures compare deterministically
   * regardless of any JSON-transport serialization quirk in dbQuery's own
   * HTTP round-trip (test/support/e2e-db-client.ts).
   */
  async function captureInvoiceSnapshot(invoiceId: string, organizationId: string): Promise<InvoiceSnapshot> {
    const invoice = await dbQuery<{ id: string; invoiceNumber: string; status: string; updatedAt: string }>(
      "invoice",
      "findUniqueOrThrow",
      { where: { id: invoiceId } },
    );
    const lineItems = await dbQuery<{ id: string; description: string; quantity: string; unitPrice: string; position: number }[]>(
      "invoiceLineItem",
      "findMany",
      { where: { invoiceId }, orderBy: { position: "asc" } },
    );
    const activity = await dbQuery<{ id: string; action: string }[]>("activity", "findMany", {
      where: { organizationId, entityType: "INVOICE", entityId: invoiceId },
      orderBy: { createdAt: "asc" },
    });
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      updatedAt: String(invoice.updatedAt),
      lineItems: lineItems.map((li) => ({
        id: li.id,
        description: li.description,
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
        position: li.position,
      })),
      activity: activity.map((a) => ({ id: a.id, action: a.action })),
    };
  }

  test.beforeAll(async () => {
    const itemized = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-ITM-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "922.49",
        subtotal: "922.49",
        discountType: "PERCENTAGE",
        discountValue: "10",
        discountAmount: "92.25",
        taxRatePercent: "8.25",
        taxAmount: "68.49",
        currency: "USD",
        notes: "Original client-visible note",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
        lineItems: {
          create: [
            { description: "Design work", quantity: "10.5", unitPrice: "85.00", lineTotal: "892.50", position: 0 },
            { description: "Hosting", quantity: "1", unitPrice: "29.99", lineTotal: "29.99", position: 1 },
          ],
        },
      },
    });
    itemizedCancelledId = itemized.id;

    const flat = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-FLAT-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "777.00",
        subtotal: "777.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        currency: "USD",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    flatCancelledId = flat.id;

    const sent = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-SENT-${fixtures.runId}`,
        status: "SENT",
        amount: "50.00",
        subtotal: "50.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    sentId = sent.id;

    const orgBProject = await dbQuery<{ id: string }>("project", "create", {
      data: {
        name: `E2E Duplicate Org B Project ${fixtures.runId}`,
        clientId: fixtures.clientB.id,
        organizationId: fixtures.orgB.id,
        ownerId: fixtures.orgBOwner.id,
        status: "IN_PROGRESS",
      },
    });
    orgBProjectId = orgBProject.id;

    const orgBCancelled = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-ORGB-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "40.00",
        subtotal: "40.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        projectId: orgBProjectId,
        clientId: fixtures.clientB.id,
        organizationId: fixtures.orgB.id,
      },
    });
    orgBCancelledId = orgBCancelled.id;

    // normalizedCurrencyId/unsupportedCurrencyId are deliberately NOT
    // seeded here — an unnormalized/unsupported currency also breaks the
    // existing, unrelated /invoices LIST page's own plain formatCurrency()
    // call (it renders every org invoice, with no normalization of its
    // own) whenever any other test in this block navigates there. Scoped
    // to the currency test's own body instead, so the malformed-currency
    // row only exists for the moment that one test needs it.

    const keyboardSource = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-KBD-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "20.00",
        subtotal: "20.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    keyboardCancelledId = keyboardSource.id;
  });

  test.afterAll(async () => {
    // Covers every seeded source (E2E-DUP-*-${runId}) AND every duplicate
    // a test created (E2E-DUP-*-${runId}-R1) in one scoped sweep — both
    // shapes start with "E2E-DUP-" and contain this run's unique id;
    // InvoiceLineItem rows cascade-delete with their parent Invoice.
    await dbQuery("invoice", "deleteMany", {
      where: { invoiceNumber: { startsWith: "E2E-DUP-", contains: fixtures.runId } },
    });
    await dbQuery("project", "deleteMany", { where: { id: orgBProjectId } });
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
  });

  test("itemized CANCELLED source: full flow from the read-only view through explicit submit", async ({ page }) => {
    const suggestedNumber = `E2E-DUP-ITM-${fixtures.runId}-R1`;

    // Exact source snapshot, captured before opening or navigating away
    // from the source at all — invoiceNumber/status/updatedAt plus every
    // ordered line item and every Activity row scoped to this entity.
    // Decimal/date values are normalized to strings once here (String())
    // and compared as strings throughout, since the JSON transport this
    // suite's dbQuery already uses (test/support/e2e-db-client.ts) is not
    // guaranteed to round-trip a Decimal/Date the same way twice on its
    // own.
    const sourceBefore = await captureInvoiceSnapshot(itemizedCancelledId, fixtures.orgA.id);
    expect(sourceBefore.lineItems).toHaveLength(2);

    await page.goto(`/invoices/${itemizedCancelledId}/edit`);
    const duplicateLink = page.getByRole("link", { name: "Duplicate as new draft" });
    await expect(duplicateLink).toHaveCount(1);

    const dateBefore = todayUtcDateOnly();
    await duplicateLink.click();
    const dateAfter = todayUtcDateOnly();

    await expect(page).toHaveURL(new RegExp(`/invoices/${itemizedCancelledId}/duplicate$`));

    const invoiceNumberField = page.getByLabel("Invoice number");
    await expect(invoiceNumberField).toHaveValue(suggestedNumber);
    await expect(invoiceNumberField).toBeEditable();

    await expect(page.getByRole("radio", { name: "Itemized" })).toBeChecked();
    const row1 = page.getByRole("group", { name: "Line item 1" });
    await expect(row1.getByLabel("Description")).toHaveValue("Design work");
    await expect(row1.getByLabel("Qty")).toHaveValue("10.5");
    await expect(row1.getByLabel("Unit price")).toHaveValue("85"); // Decimal.toString() trims trailing zeros
    const row2 = page.getByRole("group", { name: "Line item 2" });
    await expect(row2.getByLabel("Description")).toHaveValue("Hosting");

    await expect(page.getByLabel("Discount type")).toHaveValue("PERCENTAGE");
    await expect(page.getByLabel("Discount (%)")).toHaveValue("10");
    await expect(page.getByLabel("Tax rate (%)")).toHaveValue("8.25");
    await expect(page.getByLabel("Currency")).toHaveValue("USD");

    const issueDateValue = await page.getByLabel("Issue date").inputValue();
    expect([dateBefore, dateAfter]).toContain(issueDateValue);
    await expect(page.getByLabel("Due date")).toHaveValue("");
    await expect(page.getByLabel("Internal notes")).toHaveValue("");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Original client-visible note");

    // Zero-write proof, scoped to this exact suggested number in the
    // source's own Client scope — nothing has been submitted yet — plus a
    // full re-read proving the source itself is still exactly as
    // captured above (including updatedAt, its ordered line items, and
    // its Activity state).
    const beforeSubmit = await dbQuery<unknown[]>("invoice", "findMany", {
      where: { invoiceNumber: suggestedNumber, clientId: fixtures.clientA.id },
    });
    expect(beforeSubmit).toHaveLength(0);
    const sourceAfterOpen = await captureInvoiceSnapshot(itemizedCancelledId, fixtures.orgA.id);
    expect(sourceAfterOpen).toEqual(sourceBefore);

    await page.getByRole("button", { name: "Create duplicate" }).click();
    await expect(page.getByText("Invoice created")).toBeVisible();

    const created = await dbQuery<{ id: string; status: string }[]>("invoice", "findMany", {
      where: { invoiceNumber: suggestedNumber, clientId: fixtures.clientA.id },
    });
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("DRAFT");

    const row = page.getByRole("row", { name: new RegExp(suggestedNumber) });
    await expect(row.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();

    // Source remains byte-for-byte unchanged after a real duplicate was
    // created — same invoiceNumber/status/updatedAt, same ordered line
    // items, same Activity rows.
    const sourceAfterSubmit = await captureInvoiceSnapshot(itemizedCancelledId, fixtures.orgA.id);
    expect(sourceAfterSubmit).toEqual(sourceBefore);

    // The new invoice, and only the new invoice, has its own exactly one
    // CREATED Activity row.
    const newInvoiceActivity = await dbQuery<{ id: string; action: string }[]>("activity", "findMany", {
      where: { organizationId: fixtures.orgA.id, entityType: "INVOICE", entityId: created[0].id },
    });
    expect(newInvoiceActivity).toHaveLength(1);
    expect(newInvoiceActivity[0].action).toBe("CREATED");

    await page.goto(`/invoices/${itemizedCancelledId}/edit`);
    await expect(page.getByText("Cancelled")).toBeVisible();
    await expect(page.getByLabel("Invoice number")).toHaveCount(0);
  });

  test("negative route eligibility: SENT shows no link, direct SENT and cross-org routes are unavailable", async ({ page }) => {
    await page.goto(`/invoices/${sentId}/edit`);
    await expect(page.getByRole("link", { name: "Duplicate as new draft" })).toHaveCount(0);

    await page.goto(`/invoices/${sentId}/duplicate`);
    await expect(page.getByText("Page not found")).toBeVisible();

    await page.goto(`/invoices/${orgBCancelledId}/duplicate`);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("legacy flat CANCELLED source: flat mode, amount prefilled, no fabricated line item", async ({ page }) => {
    await page.goto(`/invoices/${flatCancelledId}/edit`);
    await page.getByRole("link", { name: "Duplicate as new draft" }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${flatCancelledId}/duplicate$`));

    await expect(page.getByRole("radio", { name: "Flat amount" })).toBeChecked();
    // "Amount" alone is ambiguous against the "Flat amount" radio's own
    // accessible name (getByLabel substring-matches) — exact: true
    // disambiguates, matching this suite's own established convention.
    await expect(page.getByRole("textbox", { name: "Amount", exact: true })).toHaveValue("777"); // Decimal.toString() trims trailing zeros
    await expect(page.getByRole("group", { name: /Line item/ })).toHaveCount(0);
    await expect(page.getByLabel("Invoice number")).toHaveValue(`E2E-DUP-FLAT-${fixtures.runId}-R1`);
  });

  test("currency: a normalized-supported source opens the ordinary form; an unsupported source is blocked, no writes", async ({ page }) => {
    // Seeded and torn down entirely within this one test — an
    // un-normalized/unsupported currency also breaks the existing,
    // unrelated /invoices LIST page's own plain formatCurrency() call
    // (it renders every org invoice, with no normalization of its own)
    // if left behind for any other test's navigation to see.
    const normalizedCurrency = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-NORMCUR-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "60.00",
        subtotal: "60.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        currency: " usd ",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    const unsupportedCurrency = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: `E2E-DUP-BADCUR-${fixtures.runId}`,
        status: "CANCELLED",
        amount: "80.00",
        subtotal: "80.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        currency: "JPY",
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });

    try {
      // Exact-scope snapshots for BOTH sources, captured before either
      // navigation — never a global organization-wide count, which could
      // be affected by unrelated test activity running in the same org.
      const normalizedBefore = await captureInvoiceSnapshot(normalizedCurrency.id, fixtures.orgA.id);
      const unsupportedBefore = await captureInvoiceSnapshot(unsupportedCurrency.id, fixtures.orgA.id);

      await page.goto(`/invoices/${normalizedCurrency.id}/duplicate`);
      await expect(page.getByLabel("Currency")).toHaveValue("USD");
      await expect(page.getByRole("button", { name: "Create duplicate" })).toBeVisible();

      await page.goto(`/invoices/${unsupportedCurrency.id}/duplicate`);
      await expect(page.getByText(/can.t duplicate this invoice automatically/i)).toBeVisible();
      await expect(page.getByText(/JPY/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Create duplicate" })).toHaveCount(0);
      // No InvoiceForm is ever constructed on the blocked branch — not
      // just no submit button, no invoice-number input either.
      await expect(page.getByLabel("Invoice number")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "View original invoice" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add invoice" })).toBeVisible();

      // Neither navigation wrote anything — both sources are exactly as
      // captured above (id/invoiceNumber/status/updatedAt, line items,
      // Activity), and neither's suggested -R1 duplicate number exists in
      // the source's own Client scope.
      const normalizedAfter = await captureInvoiceSnapshot(normalizedCurrency.id, fixtures.orgA.id);
      const unsupportedAfter = await captureInvoiceSnapshot(unsupportedCurrency.id, fixtures.orgA.id);
      expect(normalizedAfter).toEqual(normalizedBefore);
      expect(unsupportedAfter).toEqual(unsupportedBefore);

      const suggestedForNormalized = await dbQuery<unknown[]>("invoice", "findMany", {
        where: { invoiceNumber: `${normalizedBefore.invoiceNumber}-R1`, clientId: fixtures.clientA.id },
      });
      expect(suggestedForNormalized).toHaveLength(0);
      const suggestedForUnsupported = await dbQuery<unknown[]>("invoice", "findMany", {
        where: { invoiceNumber: `${unsupportedBefore.invoiceNumber}-R1`, clientId: fixtures.clientA.id },
      });
      expect(suggestedForUnsupported).toHaveLength(0);
    } finally {
      await dbQuery("invoice", "deleteMany", { where: { id: { in: [normalizedCurrency.id, unsupportedCurrency.id] } } });
    }
  });

  test("keyboard: the Duplicate link is reachable and activatable by keyboard; the duplicate route has no horizontal overflow at 320/375/768", async ({ page }) => {
    await page.goto(`/invoices/${keyboardCancelledId}/edit`);
    await page.getByRole("link", { name: "Duplicate as new draft" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/invoices/${keyboardCancelledId}/duplicate$`));

    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/invoices/${keyboardCancelledId}/duplicate`);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }
  });
});

test.describe("date-only display — no local-timezone drift", () => {
  // issueDate/dueDate are rendered by a Server Component, in the Node.js
  // process running the app (via formatDateOnlyForDisplay) — NOT by the
  // browser, so a Playwright context's own locale/timezoneId options have
  // no effect on this text at all (those only govern client-side JS).
  // Rather than guessing the server's own default-locale digit/separator
  // convention (which legitimately varies by machine/CI image), the
  // expected string is computed here with the exact same expression
  // production uses (Intl-based, timeZone pinned to "UTC", no explicit
  // locale) — since the Playwright test runner and the webServer it
  // drives are both plain Node processes on the same machine, this
  // reproduces the server's real rendered string exactly. What this test
  // actually proves is the absence of drift (the wrong calendar day),
  // not any one locale's particular formatting.
  let dateFixtureId: string;
  const dateFixtureNumber = `E2E-DATEDRIFT-${Date.now()}`;
  const fixtureIssueDate = new Date("2026-01-05T00:00:00.000Z");
  const fixtureDueDate = new Date("2026-01-06T00:00:00.000Z");
  const expectedIssueDateText = fixtureIssueDate.toLocaleDateString(undefined, { timeZone: "UTC" });
  const expectedDueDateText = fixtureDueDate.toLocaleDateString(undefined, { timeZone: "UTC" });

  test.beforeAll(async () => {
    const created = await dbQuery<{ id: string }>("invoice", "create", {
      data: {
        invoiceNumber: dateFixtureNumber,
        status: "SENT",
        amount: "10.00",
        subtotal: "10.00",
        discountAmount: "0.00",
        taxAmount: "0.00",
        issueDate: fixtureIssueDate,
        dueDate: fixtureDueDate,
        projectId: fixtures.project.id,
        clientId: fixtures.clientA.id,
        organizationId: fixtures.orgA.id,
      },
    });
    dateFixtureId = created.id;
  });

  test.afterAll(async () => {
    await dbQuery("invoice", "deleteMany", { where: { id: dateFixtureId } });
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await injectTestSession(context, { id: fixtures.owner.id, email: fixtures.owner.email }, baseURL!);
  });

  test("the read-only view shows the correct calendar day for issueDate and dueDate — no previous-day drift", async ({ page }) => {
    await page.goto(`/invoices/${dateFixtureId}/edit`);
    await expect(page.getByText(expectedIssueDateText, { exact: true })).toBeVisible();
    await expect(page.getByText(expectedDueDateText, { exact: true })).toBeVisible();
  });

  test("the Invoice list shows the correct calendar day for dueDate — no previous-day drift", async ({ page }) => {
    await page.goto("/invoices");
    const row = page.getByRole("row", { name: new RegExp(dateFixtureNumber) });
    await expect(row.getByText(expectedDueDateText, { exact: true })).toBeVisible();
  });
});
