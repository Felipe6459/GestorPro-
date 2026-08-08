import { readFileSync, existsSync } from "node:fs";
import { grep, report } from "./lib.mjs";

// Analytics — Stage 1 (docs/analytics-architecture.md §7). Structural
// guards for this subsystem's own explicit security requirement
// (OWNER/ADMIN only, MEMBER hard-blocked, Client Portal never reaches it
// at all) and its "no external event pipeline" constraint.

let ok = true;

const ANALYTICS_LIB_DIR = "src/lib/analytics";
const QUERIES_DIR = "src/lib/analytics/queries";
const CALCULATIONS_DIR = "src/lib/analytics/calculations";
const PAGE_FILE = "src/app/(dashboard)/analytics/page.tsx";
const SERVICE_FILE = "src/lib/analytics/services/analytics-service.ts";
const AUTH_FILE = "src/lib/analytics/authorization.ts";

// 1. The one public service entry point calls assertCanViewAnalytics
// before running any query — never after, never optionally.
const serviceSource = existsSync(SERVICE_FILE) ? readFileSync(SERVICE_FILE, "utf8") : "";
ok = report(
  "getOrganizationAnalytics calls assertCanViewAnalytics",
  /assertCanViewAnalytics\(/.test(serviceSource),
  serviceSource ? "" : "service file not found",
) && ok;

// 2. The authorization module hard-blocks MEMBER (not a reduced/read-only
// view like Billing's own page — an explicit exclusion).
const authSource = existsSync(AUTH_FILE) ? readFileSync(AUTH_FILE, "utf8") : "";
ok = report(
  "canViewAnalytics excludes MEMBER (only OWNER/ADMIN return true)",
  /role === "OWNER" \|\| role === "ADMIN"/.test(authSource) && !/role === "MEMBER"/.test(authSource.split("canViewAnalytics")[1] ?? ""),
  authSource ? "" : "authorization file not found",
) && ok;

// 3. The Analytics page never re-implements the authorization decision
// itself — it only catches the service's own AnalyticsAccessError
// (server-side instanceof check, never a redirect or a disabled-but-
// visible state) and renders a dedicated denied state.
const pageSource = existsSync(PAGE_FILE) ? readFileSync(PAGE_FILE, "utf8") : "";
ok = report(
  "the Analytics page catches AnalyticsAccessError and renders a denied state, rather than re-checking the role itself",
  /instanceof AnalyticsAccessError/.test(pageSource) && !/canViewAnalytics\(/.test(pageSource),
  pageSource ? "" : "page file not found",
) && ok;

// 4. No query/service/calculation file accepts organizationId from client
// input — every one takes it as an explicit function parameter, resolved
// server-side by the page via getCurrentMembership(). This greps for the
// one leak shape that would matter: reading it out of searchParams/
// FormData/request body anywhere in the domain.
const clientSuppliedOrgId = grep("searchParams.*organizationId|formData.*organizationId|request\\.(json|formData)\\(\\).*organizationId", ANALYTICS_LIB_DIR, "-i");
ok = report(
  "no analytics file reads organizationId from client-supplied input",
  clientSuppliedOrgId === "",
  clientSuppliedOrgId,
) && ok;

// 5. No third-party analytics/tracking SDK anywhere in the codebase —
// this stage's own explicit "no Google Analytics, Segment, Mixpanel,
// PostHog or similar" constraint.
const FORBIDDEN_PROVIDERS = "posthog|segment\\.(io|com)|mixpanel|google-analytics|gtag\\(|amplitude";
const providerRefs = grep(FORBIDDEN_PROVIDERS, "src", "-i");
ok = report(
  "no third-party analytics/tracking provider is referenced anywhere in src/",
  providerRefs === "",
  providerRefs,
) && ok;

// 6. calculations/ stays pure — no Prisma import, no "use server"/
// "use client" directive, no I/O — matching portal-welcome-eligibility.ts's
// own precedent (check-portal-welcome-security.mjs) for why this matters:
// it's what makes every rate/date-range function unit-testable with no
// database, and what proves no calculation function can itself leak
// cross-organization data (it never touches the database at all).
const calculationsPrismaImport = grep('from ["\']@/lib/prisma["\']', CALCULATIONS_DIR);
const calculationsDirective = grep('"use server"|"use client"', CALCULATIONS_DIR);
ok = report(
  "src/lib/analytics/calculations/ stays pure — no Prisma import, no client/server directive",
  calculationsPrismaImport === "" && calculationsDirective === "",
  [calculationsPrismaImport, calculationsDirective].filter(Boolean).join("\n"),
) && ok;

// 7. Every query file's exported function takes organizationId as its own
// parameter (never reads a module-level/global organization context) —
// greps for at least one `organizationId: string` parameter per file, the
// same multi-tenancy discipline src/lib/billing/usage.ts already
// establishes for this codebase.
const queriesMissingOrgIdParam = grep("^export async function", QUERIES_DIR)
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.includes("getOnboardingMetrics")); // wraps onboarding's own organizationId-scoped function directly
const queriesWithoutParam = queriesMissingOrgIdParam.filter((line) => {
  const file = line.split(":")[0];
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  return !/organizationId: string/.test(source);
});
ok = report(
  "every analytics query function takes organizationId as an explicit parameter",
  queriesWithoutParam.length === 0,
  queriesWithoutParam.join("\n"),
) && ok;

// 8. No console logging anywhere in the analytics domain.
const consoleLogging = grep("console\\.(log|warn|error|info|debug)\\(", ANALYTICS_LIB_DIR);
ok = report(
  "no console logging anywhere in the analytics domain",
  consoleLogging === "",
  consoleLogging,
) && ok;

// 9. Analytics Stage 3 — the raw-SQL time-series queries use only the
// parameterized $queryRaw tagged template, never $queryRawUnsafe/
// $executeRawUnsafe (already globally banned in src/, but checked again
// here specifically since this is the one place in the whole domain that
// touches raw SQL at all).
const TIME_SERIES_FILE = "src/lib/analytics/queries/time-series.ts";
const timeSeriesSource = existsSync(TIME_SERIES_FILE) ? readFileSync(TIME_SERIES_FILE, "utf8") : "";
ok = report(
  "time-series.ts uses only the parameterized $queryRaw, never $queryRawUnsafe/$executeRawUnsafe",
  existsSync(TIME_SERIES_FILE) && /\$queryRaw</.test(timeSeriesSource) && !/\$queryRawUnsafe|\$executeRawUnsafe/.test(timeSeriesSource),
  timeSeriesSource ? "" : "time-series.ts not found",
) && ok;

// 10. Analytics Stage 3 — "subscription status transitions, aggregate
// only": the WebhookEvent query is a plain count, and no analytics file
// ever actually reads an individual event's own columns (eventType,
// providerEventId, or anything payload-shaped) — matches real property
// access / select clauses only, not this check's own doc comments (which
// legitimately name these columns to explain what's deliberately absent).
const webhookEventDetailRead = grep("\\.eventType\\b|\\.providerEventId\\b|\\.payloadSummary\\b|select:\\s*\\{[^}]*(eventType|providerEventId)", ANALYTICS_LIB_DIR);
ok = report(
  "no analytics file reads WebhookEvent's own per-event columns — aggregate count only",
  webhookEventDetailRead === "",
  webhookEventDetailRead,
) && ok;

// 11. Analytics Stage 4 (Portal analytics) — no PortalUser PII (email,
// name) is ever read anywhere in the analytics domain, in a query, a
// component, or the page. `id`/`clientId` are the only PortalUser fields
// this domain ever touches (bare counts and existence checks), and even
// those never reach a component prop or the rendered page.
const PORTAL_PII_PATTERN = '\\.email\\b|\\.name\\b|select:\\s*\\{[^}]*(email|name)';
const portalPiiRead = [
  grep(PORTAL_PII_PATTERN, "src/lib/analytics/queries/portal-metrics.ts"),
  grep(PORTAL_PII_PATTERN, "src/lib/analytics/queries/portal-time-series.ts"),
  grep(PORTAL_PII_PATTERN, "src/components/analytics/charts/portal-analytics-section.tsx"),
].filter(Boolean).join("\n");
ok = report(
  "no analytics file reads a PortalUser's email or name — every portal metric is a bare count/rate",
  portalPiiRead === "",
  portalPiiRead,
) && ok;

// 12. Analytics Stage 4 — every portal query scopes PortalUser through
// Client.organizationId (PortalUser itself has no organizationId column
// — see portal-time-series.ts's own doc comment), never trusting a
// clientId alone without that join back to the organization.
const PORTAL_METRICS_FILE = "src/lib/analytics/queries/portal-metrics.ts";
const PORTAL_TIME_SERIES_FILE = "src/lib/analytics/queries/portal-time-series.ts";
const portalMetricsSource = existsSync(PORTAL_METRICS_FILE) ? readFileSync(PORTAL_METRICS_FILE, "utf8") : "";
const portalTimeSeriesSource = existsSync(PORTAL_TIME_SERIES_FILE) ? readFileSync(PORTAL_TIME_SERIES_FILE, "utf8") : "";
ok = report(
  "every portal query scopes PortalUser through Client.organizationId, never clientId alone",
  /client:\s*\{\s*organizationId\s*\}/.test(portalMetricsSource) && /WHERE\s+"organizationId"\s*=\s*\$\{organizationId\}/.test(portalTimeSeriesSource),
  portalMetricsSource && portalTimeSeriesSource ? "" : "portal query file(s) not found",
) && ok;

// 13. Analytics Stage 4 — the two requested metrics that would require
// new persistence (recent logins, document download count) are
// deliberately absent from the codebase, not silently faked with a
// placeholder value. No lastLoginAt/loginAt column, no download-count/
// download-log table anywhere in the schema.
const schemaSource = existsSync("prisma/schema.prisma") ? readFileSync("prisma/schema.prisma", "utf8") : "";
const newTrackingColumns = /lastLoginAt|loginAt|downloadCount|downloadLog|AttachmentAccessLog|AttachmentDownload/.test(schemaSource);
ok = report(
  "no new login-timestamp or download-tracking column/table was added to the schema (Stage 4's 'stop and document' requirement)",
  !newTrackingColumns,
  newTrackingColumns ? "prisma/schema.prisma contains a tracking-shaped column/table that Stage 4 should not have added" : "",
) && ok;

process.exit(ok ? 0 : 1);
