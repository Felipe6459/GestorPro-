import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/lib/platform-admin/queries/organization-detail";
import { formatAuditActionLabel, formatAuditReasonLabel } from "@/lib/platform-admin/audit-event-labels";
import { formatFileSize } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailSection, Field } from "@/components/platform-admin/detail-section";
import { OrganizationSuspensionControls } from "@/components/platform-admin/organization-suspension-controls";

export const metadata: Metadata = {
  title: "Organization — Platform Admin",
};

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Not set";
}

/**
 * Recent Admin Actions only — every other timestamp on this page
 * (Trial start/end, Created, Client/Project rows, Recent Activity) is
 * genuinely date-only by this page's own established convention.
 * Same-day Suspend/Reactivate pairs are a realistic, expected sequence
 * for this specific feature, so the time is the useful part here.
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLimit(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

export default async function PlatformAdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();
  const detail = await getOrganizationDetail(id, now);

  if (!detail) {
    notFound();
  }

  const { organization, businessIdentity, entitlements, portalStatistics } = detail;

  const addressLines = [businessIdentity.streetAddress, businessIdentity.city, businessIdentity.state, businessIdentity.postalCode].filter(
    Boolean,
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/platform-admin/organizations"
          className="rounded text-sm text-gray-500 hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          ← Organizations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/*
            min-w-0 lets this flex item actually shrink below its content's
            intrinsic width (flex items default to `min-width: auto`,
            which otherwise blocks shrinking entirely — the same fix
            (platform-admin)/layout.tsx's own header row already applies
            for the same reason) and wrap-anywhere (overflow-wrap:
            anywhere) lets a long or unbroken organization name wrap onto
            further lines instead of overflowing/squeezing past this row
            — the stronger of Tailwind's two wrap utilities: unlike
            break-words (overflow-wrap: break-word), `anywhere` is also
            respected by the browser's own min-content-size calculation
            for a flex item, which break-word alone was not, in exactly
            this flex-row context. Discovered as a real expected-name
            discoverability defect: a long name here was unreadable, and
            the Suspend confirmation dialog rendered the exact same
            unprotected string with the same risk.
          */}
          <h1 className="min-w-0 wrap-anywhere text-2xl font-semibold tracking-tight text-gray-900">{organization.name}</h1>
          <StatusBadge status={detail.lifecycleStatus} />
        </div>
        <p className="mt-1 text-sm text-gray-500">{organization.slug}</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <OrganizationSuspensionControls
          organizationId={organization.id}
          organizationName={organization.name}
          organizationSlug={organization.slug}
          suspendedAt={organization.suspendedAt ? organization.suspendedAt.toISOString() : null}
        />
      </div>

      <DetailSection id="business-identity" title="Business Identity">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display name" value={businessIdentity.displayName} />
          <Field label="Legal name" value={businessIdentity.legalName ?? "Not set"} />
          <Field label="Country" value={businessIdentity.country ?? "Not set"} />
          <Field
            label="Website"
            value={
              businessIdentity.website ? (
                <a
                  href={businessIdentity.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded text-black hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  {businessIdentity.website}
                </a>
              ) : (
                "Not set"
              )
            }
          />
          <Field label="Support email" value={businessIdentity.supportEmail ?? "Not set"} />
          <Field label="Phone" value={businessIdentity.phone ?? "Not set"} />
          <Field label="Tax ID" value={businessIdentity.taxId ?? "Not set"} />
          <Field label="Address" value={addressLines.length > 0 ? addressLines.join(", ") : "Not set"} />
          <Field
            label="Brand color"
            value={
              businessIdentity.brandColor ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-full border border-gray-300"
                    style={{ backgroundColor: businessIdentity.brandColor }}
                  />
                  {businessIdentity.brandColor}
                </span>
              ) : (
                "Not set"
              )
            }
          />
          <Field
            label="Logo"
            value={
              businessIdentity.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- mirrors settings/company/page.tsx's own read-only logo display; a remote Supabase Storage URL, not a local asset next/image can optimize.
                <img
                  src={businessIdentity.logoUrl}
                  alt={`${organization.name} logo`}
                  className="mt-1 h-16 w-16 rounded-md border border-gray-200 object-contain"
                />
              ) : (
                "No logo uploaded"
              )
            }
          />
        </dl>
      </DetailSection>

      <DetailSection id="subscription" title="Subscription">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lifecycle" value={<StatusBadge status={detail.lifecycleStatus} />} />
          <Field label="Access mode" value={<StatusBadge status={entitlements.accessMode} />} />
          <Field label="Trial start" value={formatDate(detail.trialStartedAt)} />
          <Field label="Trial end" value={formatDate(entitlements.trialEndsAt)} />
          <Field label="Current plan" value={detail.planDisplayName} />
        </dl>

        <h3 className="mt-6 text-sm font-semibold text-gray-900">Limits &amp; usage</h3>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Staff seats" value={`${entitlements.currentMembers} / ${formatLimit(entitlements.maxMembers)}`} />
          <Field label="Clients" value={`${entitlements.currentClients} / ${formatLimit(entitlements.maxClients)}`} />
          <Field label="Projects" value={`${entitlements.currentProjects} / ${formatLimit(entitlements.maxProjects)}`} />
          <Field
            label="Storage"
            value={`${formatFileSize(entitlements.currentStorageBytes)} / ${formatFileSize(entitlements.maxStorageBytes)}`}
          />
        </dl>
      </DetailSection>

      {/*
        Onboarding (read-only). Reuses the exact same authoritative
        engine the tenant Dashboard already uses
        (getOrganizationOnboardingProgress() — src/lib/onboarding/
        progress.ts), narrowed to an operator-safe shape by
        getOrganizationDetail() itself (see that query's own comment on
        the `onboarding` field). Deliberately its own DetailSection, not
        folded into Subscription just above — onboarding progress and
        subscription/lifecycle status are two genuinely different
        categories, and this section's own copy never implies "launch
        ready." No link, button, or skip/dismiss control anywhere here:
        this view is read-only by construction, the same as every other
        Platform Admin support-context section on this page. A suspended
        organization's onboarding progress renders identically to an
        active one — suspension is orthogonal to onboarding history.
      */}
      <DetailSection id="onboarding" title="Onboarding">
        <p className="text-sm text-gray-600">
          {detail.onboarding.requiredCompleted} of {detail.onboarding.requiredTotal} required steps complete
          <span className="text-gray-400">
            {" "}
            · {detail.onboarding.completedCount} of {detail.onboarding.totalCount} steps overall ({detail.onboarding.percent}%)
          </span>
        </p>
        <ul className="mt-4 divide-y divide-gray-100">
          {detail.onboarding.steps.map((step) => (
            <li key={step.key} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="wrap-anywhere text-sm text-gray-900">
                {step.label}
                {step.required ? <span className="ml-1.5 text-xs text-gray-400">(required)</span> : null}
              </span>
              <StatusBadge status={step.status} />
            </li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection id="organization" title="Organization">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/*
            ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: the
            full Organization.name's one permanent, always-labeled home
            — no longer duplicated inside the Suspend dialog (see
            organization-suspension-controls.tsx's own header comment).
            select-all makes the value easily copyable in one click;
            Field's own <dd> already carries wrap-anywhere (PR #123), so
            a long or unusual name still wraps safely here with no
            further change needed. Deliberately not labeled "Display
            name" — Business Identity's own field above already uses
            that exact label for this same underlying value; this
            section's own convention (matching "Slug" right below) is a
            short, direct field name instead.
          */}
          <Field label="Name" value={<span className="select-all">{organization.name}</span>} />
          <Field label="Created" value={formatDate(organization.createdAt)} />
          <Field label="Slug" value={organization.slug} />
          <Field
            label="Owner"
            value={
              detail.owner ? (
                <>
                  <div>{detail.owner.name}</div>
                  <div className="text-xs text-gray-500">{detail.owner.email}</div>
                </>
              ) : (
                "No owner"
              )
            }
          />
          <Field label="Staff users" value={detail.staff.length} />
          <Field label="Portal users" value={portalStatistics.portalUsersCount} />
        </dl>
      </DetailSection>

      <DetailSection id="team" title="Team">
        {detail.staff.length === 0 ? (
          <EmptyState title="No staff members" description="Staff members for this organization will appear here once invited." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {detail.staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
                <StatusBadge status={member.role} />
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection id="usage" title="Usage">
        <dl className="grid grid-cols-3 gap-4">
          <Field label="Clients" value={detail.clients.total} />
          <Field label="Projects" value={detail.projects.total} />
          <Field label="Tasks" value={detail.tasksTotal} />
        </dl>
      </DetailSection>

      <DetailSection id="clients" title="Clients">
        {detail.clients.preview.length === 0 ? (
          <EmptyState title="No clients yet" description="Clients added to this organization will appear here." />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {detail.clients.preview.map((client) => (
                <li key={client.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-gray-900">{client.name}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={client.status} />
                    <time dateTime={client.createdAt.toISOString()} className="text-xs text-gray-500">
                      {formatDate(client.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Showing {detail.clients.preview.length} of {detail.clients.total}
            </p>
          </>
        )}
      </DetailSection>

      <DetailSection id="projects" title="Projects">
        {detail.projects.preview.length === 0 ? (
          <EmptyState title="No projects yet" description="Projects added to this organization will appear here." />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {detail.projects.preview.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-gray-900">{project.name}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={project.status} />
                    <time dateTime={project.createdAt.toISOString()} className="text-xs text-gray-500">
                      {formatDate(project.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Showing {detail.projects.preview.length} of {detail.projects.total}
            </p>
          </>
        )}
      </DetailSection>

      <DetailSection id="recent-activity" title="Recent Activity">
        {detail.recentActivity.length === 0 ? (
          <EmptyState title="No activity yet" description="Activity for this organization will appear here as it happens." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {detail.recentActivity.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{item.display.actorLabel}</span> {item.display.actionLabel}
                  </p>
                  <time dateTime={item.display.timestamp.toISOString()} className="shrink-0 text-xs text-gray-500">
                    {formatDate(item.display.timestamp)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {/*
        Recent Admin Actions. Reads PlatformAdminAuditEvent — a
        deliberately separate model from Activity above (see this
        component's own schema comment): a Platform Admin action is taken
        by an allowlisted operator identity, never a User/Membership row.
        Bounded (RECENT_ADMIN_ACTIONS_TAKE), newest-first, no pagination —
        the same "small preview, no filters yet" shape as Recent Activity
        just above. This page already establishes organization identity
        once in its own header; no id/organizationId is rendered per row
        (getOrganizationDetail() never even selects them — see that
        query's own comment). actorEmail here is the *Platform Admin
        operator's* own email (accountability context for who took the
        action), never the organization owner's — a different concern
        from the "never show owner email" rule the Suspend/Reactivate
        dialogs themselves follow.
      */}
      <DetailSection id="recent-admin-actions" title="Recent Admin Actions">
        {detail.recentAdminActions.length === 0 ? (
          <EmptyState
            title="No admin actions recorded yet."
            description="Suspend and reactivate actions taken by Platform Admin will appear here."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {detail.recentAdminActions.map((event, index) => {
              const reasonLabel = formatAuditReasonLabel(event.reasonCode);
              return (
                // index as key: these rows carry no id at all, by design (see
                // getOrganizationDetail's own comment) — a static,
                // non-reorderable, server-rendered list makes this safe.
                <li key={index} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="wrap-anywhere text-sm text-gray-900">
                      <span className="font-medium">{formatAuditActionLabel(event.action)}</span>
                      {reasonLabel ? <span className="text-gray-500"> — {reasonLabel}</span> : null}
                    </p>
                    <time dateTime={event.createdAt.toISOString()} className="shrink-0 text-xs text-gray-500">
                      {formatDateTime(event.createdAt)}
                    </time>
                  </div>
                  <p className="wrap-anywhere text-xs text-gray-500">by {event.actorEmail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </DetailSection>
    </div>
  );
}
