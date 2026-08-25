/**
 * Platform Admin Organization Suspension, PR 2 — the fixed reason
 * catalog, deliberately its own plain (non-"use server") module.
 *
 * This must NOT live in actions.ts alongside suspendOrganizationAction/
 * reactivateOrganizationAction: a file with a top-level "use server"
 * directive may only export async functions (see node_modules/next/dist/
 * docs/01-app/03-api-reference/01-directives/use-server.md and this
 * project's own AGENTS.md instruction to check installed docs before
 * relying on prior Next.js knowledge) — every other export is a Server
 * Actions module reference, not the real value, at build time. Exporting
 * this array constant from actions.ts and importing it into
 * organization-suspension-controls.tsx (a Client Component) built and
 * type-checked without error, but broke at runtime in a real production
 * build: `SUSPENSION_REASON_CODES.map(...)` threw
 * `TypeError: k.map is not a function`, because the value the client
 * bundle actually received was not the array. Neither `npm run build`
 * nor `tsc` catches this — only a real production `next start` +
 * browser navigation surfaced it (see test/e2e/organization-suspension-
 * actions.spec.ts's own discovery of this).
 */

export const SUSPENSION_REASON_CODES = [
  "BILLING_DISPUTE",
  "POLICY_VIOLATION",
  "SECURITY_RISK",
  "CUSTOMER_REQUEST",
  "OTHER",
] as const;

export type SuspensionReasonCode = (typeof SUSPENSION_REASON_CODES)[number];

export function isSuspensionReasonCode(value: unknown): value is SuspensionReasonCode {
  return typeof value === "string" && (SUSPENSION_REASON_CODES as readonly string[]).includes(value);
}
