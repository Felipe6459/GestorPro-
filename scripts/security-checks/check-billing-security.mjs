import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { grep, report } from "./lib.mjs";

// Billing & Subscriptions Stage 2 (docs/billing-architecture.md, and this
// stage's own explicit "provider-neutral" contract). No provider is
// connected at runtime in this stage — every check here targets a way
// that boundary could quietly weaken, or a way this stage's own
// enforcement wiring could silently regress, the same discipline as
// check-search-security.mjs/check-cron-security.mjs for their own
// features.

let ok = true;

const BILLING_LIB_DIR = "src/lib/billing";
const PORTAL_APP_DIR = "src/app/portal";
const SCHEMA_FILE = "prisma/schema.prisma";

// 1. No Paddle/Stripe SDK dependency yet — Stage 2 is provider-neutral by
// requirement; a real provider client is Stage 3+'s job.
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const providerSdkDeps = Object.keys(allDeps).filter((name) => /paddle|stripe/i.test(name));
ok = report("no Paddle/Stripe SDK dependency in package.json", providerSdkDeps.length === 0, providerSdkDeps.join(", ")) && ok;

// 2. No import of a paddle/stripe package anywhere in src/ — belt and
// suspenders alongside check 1 (a transitive/undeclared import would slip
// past a package.json-only check).
const providerImports = grep('from "(@paddle|@stripe|paddle-|stripe)', "src");
ok = report("no Paddle/Stripe package import anywhere in src/", providerImports === "", providerImports) && ok;

// 3. No NEXT_PUBLIC_*-prefixed billing/provider env var referenced
// anywhere — a provider price id, publishable key, or customer-portal
// token must never be client-exposed, and Stage 2 doesn't read any real
// provider env var at all (price IDs are explicitly deferred to Stage 3+,
// docs/billing-architecture.md §6).
const publicBillingEnvVar = grep("NEXT_PUBLIC_[A-Z_]*(PADDLE|STRIPE|BILLING|PRICE)", "src");
ok = report("no NEXT_PUBLIC billing/provider env var referenced anywhere", publicBillingEnvVar === "", publicBillingEnvVar) && ok;

// 4. Billing helpers are never imported from the Client Portal's own app
// tree — billing is a staff-only concept end to end (docs/billing-
// architecture.md §8's own "Portal UI is not touched" rule); a Portal
// route importing anything from src/lib/billing would be the first sign
// of that boundary blurring, the same shape as check-search-security.mjs's
// own "no Client Portal import in the search backend" check, mirrored in
// the other direction.
const billingImportInPortal = grep('from "@/lib/billing', PORTAL_APP_DIR);
ok = report("billing helpers are never imported by the Client Portal UI", billingImportInPortal === "", billingImportInPortal) && ok;

// 5. Provider ids/keys never appear in a "use client" file — a
// providerCustomerId/providerSubscriptionId/API key must stay server-only.
// Scans every "use client" file in the app for the two Subscription
// column names that would only ever matter to a server-side caller.
function findClientComponentFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findClientComponentFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      const content = readFileSync(full, "utf8");
      if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
        out.push(full);
      }
    }
  }
  return out;
}
const clientComponentFiles = existsSync("src") ? findClientComponentFiles("src") : [];
const clientFilesWithProviderIds = clientComponentFiles.filter((file) => {
  const content = readFileSync(file, "utf8");
  return /providerCustomerId|providerSubscriptionId|providerEventId/.test(content);
});
ok = report(
  "no provider id field referenced in any client (\"use client\") module",
  clientFilesWithProviderIds.length === 0,
  clientFilesWithProviderIds.join(", "),
) && ok;

// 6. Entitlement checks are present in exactly the approved Stage 2
// mutation paths — a regression here (someone removing the import while
// refactoring one of these files) would silently re-open the limit this
// stage exists to close. Checks for the actual assert* import, not just
// any mention of "billing", so a stray comment can't produce a false pass.
const ENFORCEMENT_CALL_SITES = [
  { file: "src/app/(dashboard)/team/actions.ts", assertion: "assertCanInviteMember" },
  { file: "src/app/(dashboard)/clients/new/actions.ts", assertion: "assertCanCreateClient" },
  { file: "src/app/(dashboard)/projects/new/actions.ts", assertion: "assertCanCreateProject" },
  { file: "src/lib/attachments/attachment-mutations.ts", assertion: "assertCanUploadAttachment" },
];
const missingEnforcement = ENFORCEMENT_CALL_SITES.filter(({ file, assertion }) => {
  if (!existsSync(file)) return true;
  const content = readFileSync(file, "utf8");
  return !content.includes(`@/lib/billing/enforcement`) || !content.includes(assertion);
});
ok = report(
  "entitlement checks are present in every approved Stage 2 mutation path",
  missingEnforcement.length === 0,
  missingEnforcement.map((m) => m.file).join(", "),
) && ok;

// 7. WebhookEvent never gains a raw/summary payload column — Stage 2's own
// explicit "no raw webhook payload" rule (docs/billing-architecture.md §5,
// reaffirmed by this stage's own instructions). Scoped to the
// WebhookEvent model block specifically, not the whole schema file, so an
// unrelated model's own legitimately-named column never trips this.
const schemaContent = readFileSync(SCHEMA_FILE, "utf8");
const webhookEventBlockMatch = schemaContent.match(/model WebhookEvent \{[\s\S]*?\n\}/);
const webhookEventBlock = webhookEventBlockMatch ? webhookEventBlockMatch[0] : "";
const hasPayloadColumn = /payload/i.test(webhookEventBlock);
ok = report("WebhookEvent has no raw/summary payload column", !hasPayloadColumn && webhookEventBlock.length > 0, webhookEventBlock ? "" : "WebhookEvent model not found") && ok;

// 8. Nothing under src/lib/billing imports the Client Portal identity
// module — same staff-only boundary as check 4, verified from the other
// direction.
const portalImportInBilling = grep('from "@/lib/current-portal-user"', BILLING_LIB_DIR);
ok = report("no Client Portal import anywhere in src/lib/billing", portalImportInBilling === "", portalImportInBilling) && ok;

// Billing & Subscriptions Stage 3 (this stage's own §15) — 5 additional
// checks, appended rather than replacing anything above.

const BILLING_UI_DIRS = ["src/app/(dashboard)/settings/billing", "src/components/billing"];
const BILLING_ACTIONS_FILE = "src/app/(dashboard)/settings/billing/actions.ts";

// 9. The Billing page/component tree itself never imports a Paddle/Stripe
// SDK — a scoped, targeted variant of check 2 above (which already covers
// all of src/), called out separately because this stage's own instructions
// name the billing UI specifically.
const billingUiProviderImports = BILLING_UI_DIRS.filter(existsSync)
  .map((dir) => grep('from "(@paddle|@stripe|paddle-|stripe)', dir))
  .join("");
ok = report(
  "the Billing page/component tree never imports a Paddle/Stripe SDK",
  billingUiProviderImports === "",
  billingUiProviderImports,
) && ok;

// 10. "use client" billing components never import server-only billing
// internals directly — the only sanctioned client -> server boundary is the
// "use server" actions file (src/app/(dashboard)/settings/billing/actions.ts),
// never src/lib/billing/* directly from a client bundle.
function findClientFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findClientFilesUnder(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      const content = readFileSync(full, "utf8");
      if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
        out.push(full);
      }
    }
  }
  return out;
}
// Type-only imports (`import type { X } from "@/lib/billing/..."`) compile
// away entirely and carry no runtime risk — a client component importing
// just the PlanKey string-literal type is fine; only a value import would
// pull real billing logic into the client bundle.
const billingClientFiles = BILLING_UI_DIRS.flatMap(findClientFilesUnder);
const clientFilesImportingBillingLib = billingClientFiles.filter((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .some((line) => /from ["']@\/lib\/billing\//.test(line) && !/^\s*import\s+type\b/.test(line)),
);
ok = report(
  "\"use client\" billing components never import src/lib/billing/* directly (only via the Server Action boundary, or a type-only import)",
  clientFilesImportingBillingLib.length === 0,
  clientFilesImportingBillingLib.join(", "),
) && ok;

// 11. The placeholder billing actions resolve organization/role server-side
// only — they must never reference organizationId/userId as a real code
// identifier (doc comments are allowed to discuss the rule in prose; this
// strips /** */ and // comments first so only actual code is checked).
const actionsSource = existsSync(BILLING_ACTIONS_FILE) ? readFileSync(BILLING_ACTIONS_FILE, "utf8") : "";
const actionsCodeOnly = actionsSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const referencesClientSuppliedIds = /\borganizationId\b|\buserId\b/.test(actionsCodeOnly);
ok = report(
  "billing placeholder actions never reference organizationId/userId (always server-resolved via getCurrentMembership)",
  existsSync(BILLING_ACTIONS_FILE) && !referencesClientSuppliedIds,
  referencesClientSuppliedIds ? BILLING_ACTIONS_FILE : "actions file not found",
) && ok;

// 12. The placeholder actions have zero side effects — never write a
// Subscription or WebhookEvent row. A regression here would mean a
// "not configured" UI action silently started mutating billing state.
const mutatesSubscriptionOrWebhook = /\.subscription\.(update|create|upsert|delete)|\.webhookEvent\.(update|create|upsert|delete)/.test(
  actionsCodeOnly,
);
ok = report(
  "billing placeholder actions never mutate Subscription or WebhookEvent",
  existsSync(BILLING_ACTIONS_FILE) && !mutatesSubscriptionOrWebhook,
  mutatesSubscriptionOrWebhook ? BILLING_ACTIONS_FILE : "actions file not found",
) && ok;

// 13. The Client Portal never imports the Billing UI — same staff-only
// boundary as check 4 (which covers src/lib/billing), verified here for the
// UI layer this stage adds.
const billingUiImportInPortal = grep('from "@/components/billing|from "@/app/\\(dashboard\\)/settings/billing', PORTAL_APP_DIR);
ok = report("the Client Portal never imports the Billing UI", billingUiImportInPortal === "", billingUiImportInPortal) && ok;

process.exit(ok ? 0 : 1);
