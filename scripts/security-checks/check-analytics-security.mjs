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

// 3. The Analytics page hard-blocks unauthorized roles with notFound(),
// not a redirect or a disabled-but-visible state.
const pageSource = existsSync(PAGE_FILE) ? readFileSync(PAGE_FILE, "utf8") : "";
ok = report(
  "the Analytics page calls notFound() when canViewAnalytics is false",
  /canViewAnalytics\(/.test(pageSource) && /notFound\(\)/.test(pageSource),
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

process.exit(ok ? 0 : 1);
