import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateCompanyProfileAction } from "@/app/(dashboard)/settings/company/actions";
import { getCompanyProfile } from "@/lib/organization-setup/company-profile";
import { seedTestData, cleanupTestData, type TestFixtures } from "../../fixtures/seed";
import { actAs, resetAuthMock } from "../../support/auth-mock";

function companyForm(fields: Partial<{ legalName: string; displayName: string; country: string; currency: string; timezone: string }> = {}): FormData {
  const fd = new FormData();
  fd.set("legalName", fields.legalName ?? "Acme Legal Name LLC");
  fd.set("displayName", fields.displayName ?? "Acme");
  fd.set("country", fields.country ?? "United States");
  fd.set("currency", fields.currency ?? "USD");
  fd.set("timezone", fields.timezone ?? "America/New_York");
  return fd;
}

describe("Company Profile — Customer Setup Wizard (Stage 6.2)", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await seedTestData();
  });

  afterEach(async () => {
    resetAuthMock();
    await prisma.organizationProfile.deleteMany({ where: { organizationId: { in: [fixtures.orgA.id, fixtures.orgB.id] } } });
    // Restore Organization.name in case a test changed it (Organization
    // itself is fixture-owned, not test-owned — never deleted here).
    await prisma.organization.update({ where: { id: fixtures.orgA.id }, data: { name: "Test Org A" } });
  });

  afterAll(async () => {
    await cleanupTestData(fixtures);
  });

  it("OWNER can create the company profile, updating Organization.name and OrganizationProfile atomically", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const result = await updateCompanyProfileAction({ error: null }, companyForm({ displayName: "Acme Renamed" }));
    expect(result.error).toBeNull();
    expect(result.message).toBeTruthy();

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixtures.orgA.id } });
    expect(organization.name).toBe("Acme Renamed");

    const profile = await prisma.organizationProfile.findUniqueOrThrow({ where: { organizationId: fixtures.orgA.id } });
    expect(profile.legalName).toBe("Acme Legal Name LLC");
    expect(profile.country).toBe("United States");
    expect(profile.currency).toBe("USD");
    expect(profile.timezone).toBe("America/New_York");
  });

  it("OWNER can update an existing company profile (upsert, not a duplicate row)", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    await updateCompanyProfileAction({ error: null }, companyForm({ legalName: "First Legal Name" }));
    await updateCompanyProfileAction({ error: null }, companyForm({ legalName: "Updated Legal Name" }));

    const rows = await prisma.organizationProfile.findMany({ where: { organizationId: fixtures.orgA.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].legalName).toBe("Updated Legal Name");
  });

  it("ADMIN cannot update company settings", async () => {
    actAs(fixtures.admin, fixtures.orgA.id);
    const result = await updateCompanyProfileAction({ error: null }, companyForm());
    expect(result.error).toBe("Only the organization owner can update company details.");
    const profile = await prisma.organizationProfile.findUnique({ where: { organizationId: fixtures.orgA.id } });
    expect(profile).toBeNull();
  });

  it("MEMBER cannot update company settings", async () => {
    actAs(fixtures.member, fixtures.orgA.id);
    const result = await updateCompanyProfileAction({ error: null }, companyForm());
    expect(result.error).toBe("Only the organization owner can update company details.");
    const profile = await prisma.organizationProfile.findUnique({ where: { organizationId: fixtures.orgA.id } });
    expect(profile).toBeNull();
  });

  it("rejects an invalid submission with field errors, and writes nothing", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    const result = await updateCompanyProfileAction({ error: null }, companyForm({ currency: "NOTREAL" }));
    expect(result.fieldErrors?.currency).toBeTruthy();
    const profile = await prisma.organizationProfile.findUnique({ where: { organizationId: fixtures.orgA.id } });
    expect(profile).toBeNull();
  });

  it("Organization A cannot access Organization B's company profile", async () => {
    actAs(fixtures.owner, fixtures.orgA.id);
    await updateCompanyProfileAction({ error: null }, companyForm({ legalName: "Org A Legal Name" }));

    // orgBOwner reads/writes only their own org — resolving via
    // getCompanyProfile(organizationId) exactly like the real page does.
    const orgBProfile = await getCompanyProfile(fixtures.orgB.id);
    expect(orgBProfile.legalName).toBeNull();

    const orgAProfile = await getCompanyProfile(fixtures.orgA.id);
    expect(orgAProfile.legalName).toBe("Org A Legal Name");
  });

  it("a Client Portal identity has no reachable action here at all — getCurrentMembership() throws for a portal-only identity's org resolution", async () => {
    // Mirrors the structural guarantee every other staff-only Server
    // Action in this app relies on (docs/onboarding-architecture.md §13):
    // a PortalUser is never resolvable via getCurrentMembership() at all
    // (see current-user.ts's own getOrCreateUser() redirect-to-/portal
    // guard) — there is no code path for a portal identity to reach this
    // action's role check in the first place.
    actAs({ id: fixtures.portalUser.id, email: fixtures.portalUser.email }, fixtures.orgA.id);
    await expect(updateCompanyProfileAction({ error: null }, companyForm())).rejects.toThrow("REDIRECT:/portal");
  });
});
