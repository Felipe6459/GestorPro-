"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/current-user";
import { parseInviteForm } from "@/lib/validation/invitation";
import type { InvitationFormState } from "@/types";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteMemberAction(
  _prevState: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const { values, fieldErrors } = parseInviteForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { user, organizationId, membership } = await getCurrentMembership();

  // Server-side gate — the invite form is only ever rendered for
  // OWNER/ADMIN, but a request can be crafted directly, so re-check here.
  if (membership.role !== Role.OWNER && membership.role !== Role.ADMIN) {
    return { error: "You don't have permission to invite members." };
  }

  // If the email already belongs to a platform user who is already a member
  // of this exact organization, there's nothing to invite them to.
  const existingUser = await prisma.user.findUnique({
    where: { email: values.email },
    select: {
      memberships: { where: { organizationId }, select: { id: true } },
    },
  });
  if (existingUser && existingUser.memberships.length > 0) {
    return { error: null, fieldErrors: { email: "Already a member." } };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  try {
    // @@unique([organizationId, email]) means at most one Invitation row
    // can ever exist per (org, email) — re-inviting the same address
    // (including one that was revoked or expired) updates that row rather
    // than creating a second one.
    await prisma.invitation.upsert({
      where: { organizationId_email: { organizationId, email: values.email } },
      create: {
        organizationId,
        email: values.email,
        role: values.role,
        token,
        status: "PENDING",
        expiresAt,
        invitedById: user.id,
      },
      update: {
        role: values.role,
        token,
        status: "PENDING",
        expiresAt,
        invitedById: user.id,
      },
    });
  } catch (err) {
    // Two concurrent invites for the same email can still race the upsert's
    // own read-then-write; ask the submitter to retry rather than surface
    // a raw constraint violation.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Could not create the invitation. Please try again." };
    }
    throw err;
  }

  revalidatePath("/team");

  return {
    error: null,
    message: "Invitation created.",
    token,
  };
}

function canManageInvitations(role: Role): boolean {
  return role === Role.OWNER || role === Role.ADMIN;
}

export async function resendInvitationAction(
  invitationId: string,
): Promise<InvitationFormState> {
  const { user, organizationId, membership } = await getCurrentMembership();

  if (!canManageInvitations(membership.role)) {
    return { error: "You don't have permission to manage invitations." };
  }

  // Scoped by id + organizationId together — a foreign org's invitation id
  // simply doesn't match, indistinguishable from a nonexistent one.
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId },
    select: { id: true, status: true },
  });

  if (!invitation) {
    return { error: "Invitation not found." };
  }

  if (invitation.status === "ACCEPTED") {
    return { error: "This invitation has already been accepted." };
  }

  // PENDING, EXPIRED, or REVOKED all get a fresh token/expiry and land back
  // in PENDING — role and email are never touched by a resend.
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      token,
      status: "PENDING",
      expiresAt,
      invitedById: user.id,
    },
  });

  revalidatePath("/team");

  return {
    error: null,
    message: "Invitation resent.",
    token,
  };
}

export async function cancelInvitationAction(invitationId: string): Promise<void> {
  const { organizationId, membership } = await getCurrentMembership();

  if (!canManageInvitations(membership.role)) {
    throw new Error("You don't have permission to manage invitations.");
  }

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId },
    select: { id: true, status: true },
  });

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  if (invitation.status === "PENDING") {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });
  }
  // Any other status (most commonly already REVOKED, from a repeat click)
  // is left untouched — canceling is idempotent, never an error, and the
  // token is never cleared or reused.

  revalidatePath("/team");
}
