import { prisma } from "@/lib/prisma";
import type { ParsedCompanyProfileInput } from "@/lib/validation/company-profile";

export type CompanyProfileData = {
  /** Always present — Organization.name, the app's existing display name. */
  displayName: string;
  /** null until the OWNER has submitted this step's form at least once. */
  legalName: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
};

/** Read-only — never role-gated (any member may view), matching authorization.ts's own documented boundary. */
export async function getCompanyProfile(organizationId: string): Promise<CompanyProfileData> {
  const [organization, profile] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.organizationProfile.findUnique({ where: { organizationId } }),
  ]);

  return {
    displayName: organization.name,
    legalName: profile?.legalName ?? null,
    country: profile?.country ?? null,
    currency: profile?.currency ?? null,
    timezone: profile?.timezone ?? null,
  };
}

/**
 * OWNER-only — callers must call assertCanManageCompanyProfile() first
 * (this function itself does no role check, mirroring
 * getOrCreateOrganizationId's own "authorization happens at the call
 * site, this is pure data access" shape). Two tables, one transaction:
 * Organization.name (the existing display name field) and
 * OrganizationProfile's own new columns either both update, or neither
 * does.
 */
export async function upsertCompanyProfile(organizationId: string, input: ParsedCompanyProfileInput): Promise<void> {
  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { name: input.displayName } }),
    prisma.organizationProfile.upsert({
      where: { organizationId },
      update: { legalName: input.legalName, country: input.country, currency: input.currency, timezone: input.timezone },
      create: {
        organizationId,
        legalName: input.legalName,
        country: input.country,
        currency: input.currency,
        timezone: input.timezone,
      },
    }),
  ]);
}
