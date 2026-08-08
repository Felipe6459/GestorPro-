import { getCurrentMembership } from "@/lib/current-user";
import { getCompanyProfile } from "@/lib/organization-setup/company-profile";
import { canManageCompanyProfile } from "@/lib/organization-setup/authorization";
import { getSupportedCurrencies, getSupportedTimezones } from "@/lib/validation/company-profile";
import { CompanyProfileForm } from "./company-profile-form";

/**
 * Customer Setup Wizard (Stage 6.2). Every member may view (mirrors
 * settings/billing/page.tsx's own "everyone can view, role gates the
 * controls" shape) — src/lib/organization-setup/authorization.ts's own
 * doc comment explains why this is a lighter boundary than Payment
 * Details. Staff-only by construction: this route lives under
 * (dashboard), whose layout already redirects any Client Portal-only
 * identity to /portal before this page ever renders.
 */
export default async function CompanyProfilePage() {
  const { organizationId, membership } = await getCurrentMembership();
  const profile = await getCompanyProfile(organizationId);
  const canManage = canManageCompanyProfile(membership.role);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Company profile</h1>
      <p className="mt-1 text-sm text-gray-500">Your organization&apos;s legal and business details.</p>

      {canManage ? (
        <CompanyProfileForm profile={profile} currencies={getSupportedCurrencies()} timezones={getSupportedTimezones()} />
      ) : (
        <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600">Only the organization owner can update company details.</p>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Display name</dt>
              <dd className="text-sm text-gray-900">{profile.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Legal name</dt>
              <dd className="text-sm text-gray-900">{profile.legalName ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Country</dt>
              <dd className="text-sm text-gray-900">{profile.country ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Currency</dt>
              <dd className="text-sm text-gray-900">{profile.currency ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Time zone</dt>
              <dd className="text-sm text-gray-900">{profile.timezone ?? "Not set"}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
