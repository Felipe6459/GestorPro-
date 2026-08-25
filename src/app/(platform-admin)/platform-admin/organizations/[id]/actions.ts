"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin/authorization";
import { isSuspensionReasonCode } from "@/lib/platform-admin/organization-suspension-reasons";

/**
 * Platform Admin Organization Suspension, PR 2 (design investigation:
 * PLATFORM_ADMIN_ORGANIZATION_SUSPENSION_DESIGN). The one, deliberately
 * reviewed exception to check-platform-admin-security.mjs's own "no
 * actions.ts anywhere under (platform-admin)" prohibition — that script
 * now enforces this exact file's own execution-level guard the same way
 * it already enforces every src/lib/platform-admin/queries/*.ts entry
 * point and the Configuration page (see its own updated checks).
 *
 * Every exported action below calls requirePlatformAdmin() as its
 * literal first awaited operation, before any input validation or
 * database access — the same PLATFORM_ADMIN_EXECUTION_AUTHORIZATION_AUDIT
 * discipline every other Platform Admin entry point already follows.
 *
 * The reason catalog itself (SUSPENSION_REASON_CODES/SuspensionReasonCode)
 * deliberately does NOT live in this file — see organization-suspension-
 * reasons.ts's own header comment for why a "use server" file can only
 * export async functions, and what broke (in production only) when it
 * briefly lived here instead.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrganizationSuspensionActionResult = { ok: true } | { ok: false; message: string };

// Deliberately generic and provider/database-silent — never a raw Prisma
// error, never an id, email, token, or stack trace (matching this app's
// own established BillingLimitError/REASON_MESSAGES discipline in
// src/lib/billing/enforcement.ts).
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const NOT_FOUND_MESSAGE = "Organization not found.";
const INVALID_REASON_MESSAGE = "Choose a valid reason.";

function revalidateOrganizationPaths(organizationId: string): void {
  revalidatePath(`/platform-admin/organizations/${organizationId}`);
  revalidatePath("/platform-admin/organizations");
}

/**
 * Suspending an already-suspended organization, or reactivating an
 * already-active one, is an idempotent success with no write and no
 * audit row — never an error, since a double-click or a stale tab must
 * never surface a confusing failure for an operation that has, in
 * effect, already happened.
 *
 * Concurrency: `organization.updateMany` with a conditional WHERE
 * (`suspendedAt: null` / `suspendedAt: { not: null }`) is the same
 * "atomic conditional transition, never read-then-write" pattern this
 * codebase already established for exactly this class of race
 * (src/app/portal/invite/[token]/actions.ts's own ClientInvitation
 * updateMany) — two concurrent calls can never both "win": only the one
 * that actually flips the row ever writes an audit event, so at most one
 * audit row is ever created per real transition, never per call.
 *
 * The existence check and the conditional update+audit-insert all run
 * inside one prisma.$transaction — a simulated failure of the audit
 * insert rolls back the state change too, so the two can never diverge.
 */
export async function suspendOrganizationAction(
  organizationId: string,
  reasonCode: string,
): Promise<OrganizationSuspensionActionResult> {
  const { email } = await requirePlatformAdmin();

  if (!UUID_PATTERN.test(organizationId)) {
    return { ok: false, message: NOT_FOUND_MESSAGE };
  }
  if (!isSuspensionReasonCode(reasonCode)) {
    return { ok: false, message: INVALID_REASON_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new Error("NOT_FOUND");
      }

      const result = await tx.organization.updateMany({
        where: { id: organizationId, suspendedAt: null },
        data: { suspendedAt: new Date() },
      });
      if (result.count === 0) {
        // Already suspended (by this call or a concurrent one that won
        // the race) — idempotent no-op, no audit row.
        return;
      }

      await tx.platformAdminAuditEvent.create({
        data: {
          organizationId,
          action: "ORGANIZATION_SUSPENDED",
          actorEmail: email,
          reasonCode,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  revalidateOrganizationPaths(organizationId);
  return { ok: true };
}

export async function reactivateOrganizationAction(organizationId: string): Promise<OrganizationSuspensionActionResult> {
  const { email } = await requirePlatformAdmin();

  if (!UUID_PATTERN.test(organizationId)) {
    return { ok: false, message: NOT_FOUND_MESSAGE };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new Error("NOT_FOUND");
      }

      const result = await tx.organization.updateMany({
        where: { id: organizationId, suspendedAt: { not: null } },
        data: { suspendedAt: null },
      });
      if (result.count === 0) {
        // Already active — idempotent no-op, no audit row.
        return;
      }

      await tx.platformAdminAuditEvent.create({
        data: {
          organizationId,
          action: "ORGANIZATION_REACTIVATED",
          actorEmail: email,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return { ok: false, message: NOT_FOUND_MESSAGE };
    }
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  revalidateOrganizationPaths(organizationId);
  return { ok: true };
}
