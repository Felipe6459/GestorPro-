import { getCurrentMembership } from "@/lib/current-user";
import { getCompanyProfile } from "@/lib/organization-setup/company-profile";
import { canManageCompanyProfile } from "@/lib/organization-setup/authorization";
import { getSupportedCurrencies, getSupportedTimezones } from "@/lib/validation/company-profile";
import { DefinitionList, DefinitionItem } from "@/components/ui/definition-list";
import { CompanyProfileForm } from "./company-profile-form";
import { LogoUploadForm } from "./logo-upload-form";

/**
 * Customer Setup Wizard (Stage 6.2). Every member may view (mirrors
 * settings/billing/page.tsx's own "everyone can view, role gates the
 * controls" shape) — src/lib/organization-setup/authorization.ts's own
 * doc comment explains why this is a lighter boundary than Payment
 * Details. Staff-only by construction: this route lives under
 * (dashboard), whose layout already redirects any Client Portal-only
 * identity to /portal before this page ever renders.
 *
 * Sale-Ready Phase A.1 (Business Identity), PR3 — the same page/route as
 * before this stage, now presented as "configure your business" rather
 * than just legal/locale details, to match the wider set of fields the
 * form (and, for a non-OWNER, this read-only summary) now covers. No new
 * page, no new route.
 *
 * PR5 adds the logo, rendered via its own LogoUploadForm — a separate
 * <form>/Server Action pair from CompanyProfileForm's own (see that
 * component's own doc comment for why), so this page still renders both
 * as siblings rather than one merged form.
 */
export default async function CompanyProfilePage() {
  const { organizationId, membership } = await getCurrentMembership();
  const profile = await getCompanyProfile(organizationId);
  const canManage = canManageCompanyProfile(membership.role);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Business identity</h1>
      <p className="mt-1 text-sm text-gray-500">Configure your business — legal details, contact info, address, tax ID, and branding.</p>

      {canManage ? (
        <>
          <CompanyProfileForm profile={profile} currencies={getSupportedCurrencies()} timezones={getSupportedTimezones()} />
          <LogoUploadForm currentLogoUrl={profile.logoUrl} />
        </>
      ) : (
        <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Only the organization owner can update company details.</p>
          {profile.logoUrl && (
            <div>
              <p className="text-xs font-medium text-gray-500">Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- see LogoUploadForm's own doc comment */}
              <img
                src={profile.logoUrl}
                alt="Organization logo"
                className="mt-1 h-20 w-20 rounded-md border border-gray-200 object-contain"
              />
            </div>
          )}
          <DefinitionList>
            <DefinitionItem label="Display name" value={profile.displayName} />
            <DefinitionItem label="Legal name" value={profile.legalName ?? "Not set"} />
            <DefinitionItem label="Currency" value={profile.currency ?? "Not set"} />
            <DefinitionItem label="Time zone" value={profile.timezone ?? "Not set"} />
            <DefinitionItem label="Support email" value={profile.supportEmail ?? "Not set"} />
            <DefinitionItem label="Website" value={profile.website ?? "Not set"} />
            <DefinitionItem label="Phone" value={profile.phone ?? "Not set"} />
            <DefinitionItem label="Country" value={profile.country ?? "Not set"} />
            <DefinitionItem label="Street address" value={profile.streetAddress ?? "Not set"} />
            <DefinitionItem label="City" value={profile.city ?? "Not set"} />
            <DefinitionItem label="State / Province" value={profile.state ?? "Not set"} />
            <DefinitionItem label="Postal code" value={profile.postalCode ?? "Not set"} />
            <DefinitionItem label="Tax ID / VAT" value={profile.taxId ?? "Not set"} />
            <DefinitionItem label="Brand color" value={profile.brandColor ?? "Not set"} />
          </DefinitionList>
        </div>
      )}
    </div>
  );
}
