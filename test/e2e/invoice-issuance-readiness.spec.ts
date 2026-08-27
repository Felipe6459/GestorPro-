import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { dbQuery } from "./fixtures";
import { injectTestSession } from "../support/e2e-session";

/**
 * Advisory pre-issuance readiness notice (Company Profile / Payment
 * Receiving Details) on the DRAFT invoice Issue surface
 * (/invoices/[id]/edit). Every organization here is created directly
 * (never a shared fixture) so each readiness combination is fully under
 * this file's own control — matching the established precedent in
 * test/e2e/platform-admin-organization-onboarding.spec.ts.
 *
 * Cleanup order matters: Invoice must be deleted before Project/Client
 * (both Restrict-referenced elsewhere), Project/Client before their
 * owning User (Restrict), and Organization last of all — deleting it
 * cascades Membership/OrganizationProfile/OrganizationPaymentDetails
 * automatically (all onDelete: Cascade), so none of those three need an
 * explicit delete of their own.
 */

async function actAsRole(
  context: BrowserContext,
  baseURL: string,
  user: { id: string; email: string },
  organizationId: string,
): Promise<void> {
  await context.clearCookies();
  await injectTestSession(context, user, baseURL);
  await context.addCookies([
    {
      name: "active_organization_id",
      value: organizationId,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      secure: new URL(baseURL).protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

type Org = { orgId: string; ownerId: string; ownerEmail: string; clientId: string; projectId: string };

async function createOrgWithDraftInvoiceCapability(label: string): Promise<Org> {
  const org = await dbQuery<{ id: string }>("organization", "create", {
    data: { name: `Readiness E2E ${label}`, slug: `e2e-readiness-${randomUUID()}` },
  });
  const owner = await dbQuery<{ id: string; email: string }>("user", "create", {
    data: { id: randomUUID(), name: `Readiness E2E Owner (${label})`, email: `${randomUUID()}@example.com` },
  });
  await dbQuery("membership", "create", { data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
  const client = await dbQuery<{ id: string }>("client", "create", {
    data: { name: `Readiness E2E Client (${label})`, organizationId: org.id, userId: owner.id },
  });
  const project = await dbQuery<{ id: string }>("project", "create", {
    data: { name: `Readiness E2E Project (${label})`, organizationId: org.id, clientId: client.id, ownerId: owner.id },
  });
  return { orgId: org.id, ownerId: owner.id, ownerEmail: owner.email, clientId: client.id, projectId: project.id };
}

async function createDraftInvoice(org: Org): Promise<{ id: string }> {
  return dbQuery<{ id: string }>("invoice", "create", {
    data: {
      invoiceNumber: `E2E-READINESS-${randomUUID()}`,
      amount: "100.00",
      organizationId: org.orgId,
      projectId: org.projectId,
      clientId: org.clientId,
    },
  });
}

async function cleanupOrg(org: Org, extraUserIds: string[] = []): Promise<void> {
  await dbQuery("invoice", "deleteMany", { where: { organizationId: org.orgId } });
  await dbQuery("project", "deleteMany", { where: { organizationId: org.orgId } });
  await dbQuery("client", "deleteMany", { where: { organizationId: org.orgId } });
  await dbQuery("organization", "deleteMany", { where: { id: org.orgId } });
  await dbQuery("user", "deleteMany", { where: { id: { in: [org.ownerId, ...extraUserIds] } } });
}

test("no warning renders, and Issue remains enabled, when both Company Profile and Payment Details are configured", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("both-ready");
  try {
    await dbQuery("organizationProfile", "create", {
      data: { organizationId: org.orgId, legalName: "Both Ready LLC", country: "United States", currency: "USD", timezone: "America/New_York" },
    });
    await dbQuery("organizationPaymentDetails", "create", {
      data: { organizationId: org.orgId, bankName: "Test Bank", accountHolder: "Test Holder", accountNumber: "ACCT-1", swiftBic: "TESTUS33" },
    });
    const invoice = await createDraftInvoice(org);

    await actAsRole(context, baseURL!, { id: org.ownerId, email: org.ownerEmail }, org.orgId);
    const page = await context.newPage();
    await page.goto(`/invoices/${invoice.id}/edit`);

    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByText("Company profile isn't set up yet", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Payment receiving details aren't set up yet", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Issue invoice" })).toBeEnabled();
  } finally {
    await cleanupOrg(org);
  }
});

test("shows only the company-profile warning, with a working Settings link, when only Company Profile is incomplete", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("profile-only-missing");
  try {
    await dbQuery("organizationPaymentDetails", "create", {
      data: { organizationId: org.orgId, bankName: "Test Bank", accountHolder: "Test Holder", accountNumber: "ACCT-2", swiftBic: "TESTUS33" },
    });
    const invoice = await createDraftInvoice(org);

    await actAsRole(context, baseURL!, { id: org.ownerId, email: org.ownerEmail }, org.orgId);
    const page = await context.newPage();
    await page.goto(`/invoices/${invoice.id}/edit`);

    const notice = page.getByRole("status");
    await expect(notice).toBeVisible();
    await expect(notice.getByText("Company profile isn't set up yet", { exact: false })).toBeVisible();
    await expect(notice.getByText("Payment receiving details", { exact: false })).toHaveCount(0);

    const link = notice.getByRole("link", { name: "Set up company profile" });
    await expect(link).toHaveAttribute("href", "/settings/company");
    await expect(page.getByRole("button", { name: "Issue invoice" })).toBeEnabled();
  } finally {
    await cleanupOrg(org);
  }
});

test("shows only the payment-details warning, with a working Settings link, when only Payment Details are missing", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("payment-only-missing");
  try {
    await dbQuery("organizationProfile", "create", {
      data: { organizationId: org.orgId, legalName: "Payment Missing LLC", country: "United States", currency: "USD", timezone: "America/New_York" },
    });
    const invoice = await createDraftInvoice(org);

    await actAsRole(context, baseURL!, { id: org.ownerId, email: org.ownerEmail }, org.orgId);
    const page = await context.newPage();
    await page.goto(`/invoices/${invoice.id}/edit`);

    const notice = page.getByRole("status");
    await expect(notice).toBeVisible();
    await expect(notice.getByText("Payment receiving details aren't set up yet", { exact: false })).toBeVisible();
    await expect(notice.getByText("Company profile", { exact: false })).toHaveCount(0);

    const link = notice.getByRole("link", { name: "Set up payment details" });
    await expect(link).toHaveAttribute("href", "/settings/payment");
    await expect(page.getByRole("button", { name: "Issue invoice" })).toBeEnabled();
  } finally {
    await cleanupOrg(org);
  }
});

test("shows both warnings together (never a single merged message) when neither is configured, Issue remains enabled, and no horizontal overflow at 375px", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("both-missing");
  try {
    const invoice = await createDraftInvoice(org);

    await actAsRole(context, baseURL!, { id: org.ownerId, email: org.ownerEmail }, org.orgId);
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/invoices/${invoice.id}/edit`);

    const notice = page.getByRole("status");
    await expect(notice).toBeVisible();
    await expect(notice.getByText("Company profile isn't set up yet", { exact: false })).toBeVisible();
    await expect(notice.getByText("Payment receiving details aren't set up yet", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Issue invoice" })).toBeEnabled();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  } finally {
    await cleanupOrg(org);
  }
});

test("the notice never renders real bank/tax/legal-name values, even though this organization's own profile and payment details are fully configured", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("markers");
  const MARKER_LEGAL_NAME = "MARKER-LEGAL-NAME-must-never-leak";
  const MARKER_BANK_NAME = "MARKER-BANK-NAME-must-never-leak";
  const MARKER_ACCOUNT_NUMBER = "MARKER-ACCOUNT-NUMBER-must-never-leak";
  try {
    await dbQuery("organizationProfile", "create", {
      data: {
        organizationId: org.orgId,
        legalName: MARKER_LEGAL_NAME,
        country: "United States",
        currency: "USD",
        timezone: "America/New_York",
        taxId: "MARKER-TAX-ID-must-never-leak",
      },
    });
    await dbQuery("organizationPaymentDetails", "create", {
      data: { organizationId: org.orgId, bankName: MARKER_BANK_NAME, accountHolder: "Marker Holder", accountNumber: MARKER_ACCOUNT_NUMBER, swiftBic: "MARKERBIC" },
    });
    const invoice = await createDraftInvoice(org);

    await actAsRole(context, baseURL!, { id: org.ownerId, email: org.ownerEmail }, org.orgId);
    const page = await context.newPage();
    await page.goto(`/invoices/${invoice.id}/edit`);

    // Both ready — the notice renders nothing at all, but assert against
    // the whole page body too, in case a future regression renders the
    // values somewhere else on this same surface.
    const bodyHtml = await page.locator("body").innerHTML();
    expect(bodyHtml).not.toContain(MARKER_LEGAL_NAME);
    expect(bodyHtml).not.toContain(MARKER_BANK_NAME);
    expect(bodyHtml).not.toContain(MARKER_ACCOUNT_NUMBER);
    expect(bodyHtml).not.toContain("MARKER-TAX-ID-must-never-leak");
  } finally {
    await cleanupOrg(org);
  }
});

test("ADMIN and MEMBER never see the readiness notice or the Issue control at all", async ({ context, baseURL }) => {
  const org = await createOrgWithDraftInvoiceCapability("role-gating");
  const admin = await dbQuery<{ id: string; email: string }>("user", "create", {
    data: { id: randomUUID(), name: "Readiness E2E Admin", email: `${randomUUID()}@example.com` },
  });
  const member = await dbQuery<{ id: string; email: string }>("user", "create", {
    data: { id: randomUUID(), name: "Readiness E2E Member", email: `${randomUUID()}@example.com` },
  });
  await dbQuery("membership", "create", { data: { userId: admin.id, organizationId: org.orgId, role: "ADMIN" } });
  await dbQuery("membership", "create", { data: { userId: member.id, organizationId: org.orgId, role: "MEMBER" } });
  try {
    // Left both incomplete deliberately — if the notice ever rendered for
    // a non-OWNER, this is the state most likely to reveal it.
    const invoice = await createDraftInvoice(org);

    for (const identity of [{ id: admin.id, email: admin.email }, { id: member.id, email: member.email }]) {
      await actAsRole(context, baseURL!, identity, org.orgId);
      const page = await context.newPage();
      await page.goto(`/invoices/${invoice.id}/edit`);

      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(page.getByText("Company profile isn't set up yet", { exact: false })).toHaveCount(0);
      await expect(page.getByText("Payment receiving details aren't set up yet", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Issue invoice" })).toHaveCount(0);
      await page.close();
    }
  } finally {
    await cleanupOrg(org, [admin.id, member.id]);
  }
});
