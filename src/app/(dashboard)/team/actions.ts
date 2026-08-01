"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  getCurrentMembership,
  getOrCreateOrganizationId,
  setActiveOrganization,
} from "@/lib/current-user";
import { parseInviteForm } from "@/lib/validation/invitation";
import { withToast } from "@/lib/toast-url";
import { sendInvitationEmail } from "@/lib/email/invitations";
import type { InvitationFormState, MembershipActionState } from "@/types";

const CHANGEABLE_ROLES = [Role.MEMBER, Role.ADMIN, Role.OWNER];

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

  // The Invitation row is already committed at this point — an email
  // provider failure below only affects delivery, never rolls this back.
  // The org's name is looked up fresh (not trusted from client input).
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });

  const emailResult = await sendInvitationEmail({
    to: values.email,
    organizationName: organization.name,
    role: values.role,
    invitedByName: user.name,
    invitationToken: token,
    expiresAt,
  });

  if (!emailResult.delivered) {
    return {
      error: null,
      message:
        "Invitation created, but the email could not be sent. Copy the invitation link manually.",
      token,
      emailFailed: true,
    };
  }

  return {
    error: null,
    message: "Invitation sent.",
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
    select: { id: true, status: true, email: true, role: true },
  });

  if (!invitation) {
    return { error: "Invitation not found." };
  }

  if (invitation.status === "ACCEPTED") {
    return { error: "This invitation has already been accepted." };
  }

  // PENDING, EXPIRED, or REVOKED all get a fresh token/expiry and land back
  // in PENDING — role and email are never touched by a resend. The old
  // token is invalidated by this same update, so only the new one below is
  // ever emailed out.
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

  // Invitation is already updated and PENDING regardless of what happens
  // next — a delivery failure here never reverts it or regenerates the
  // token a second time (this call is made exactly once).
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });

  const emailResult = await sendInvitationEmail({
    to: invitation.email,
    organizationName: organization.name,
    // Invitation.role is typed as the full Role enum, but inviteMemberAction
    // (the only writer) only ever stores ADMIN/MEMBER — OWNER is excluded by
    // INVITABLE_ROLES — same cast RoleSelect's caller already relies on.
    role: invitation.role as "ADMIN" | "MEMBER",
    invitedByName: user.name,
    invitationToken: token,
    expiresAt,
  });

  if (!emailResult.delivered) {
    return {
      error: null,
      message: "Invitation updated, but the email could not be sent.",
      token,
      emailFailed: true,
    };
  }

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

/**
 * Changes a member's role, or transfers ownership when newRole is OWNER.
 * Only the organization's OWNER may call this. membershipId is always
 * scoped by id + organizationId together — a foreign org's membership id
 * simply doesn't match, indistinguishable from a nonexistent one.
 */
export async function changeRoleAction(
  membershipId: string,
  newRole: Role,
): Promise<MembershipActionState> {
  const { user, organizationId, membership: viewer } = await getCurrentMembership();

  if (viewer.role !== Role.OWNER) {
    return { error: "You don't have permission to change roles." };
  }

  if (!CHANGEABLE_ROLES.includes(newRole)) {
    return { error: "Invalid role." };
  }

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, userId: true, role: true },
  });

  if (!target) {
    return { error: "Member not found." };
  }

  if (target.userId === user.id) {
    // The invariant (exactly one OWNER) already makes this the only
    // membership that could ever be role OWNER while also being "self", so
    // this also covers "OWNER can't demote themselves via this action" —
    // that has to go through transfer-then-leave instead.
    return { error: "You can't change your own role." };
  }

  if (target.role === newRole) {
    return { error: null };
  }

  if (newRole === Role.OWNER) {
    // Ownership transfer: atomic swap, race-safe via conditional updateMany
    // (not a plain findFirst-then-update) so two concurrent transfer
    // attempts from the same OWNER can't both succeed and leave two
    // OWNERs behind — whichever commits first wins, the second one's
    // conditional demote finds zero matching rows and aborts.
    try {
      await prisma.$transaction(async (tx) => {
        const demoted = await tx.membership.updateMany({
          where: { userId: user.id, organizationId, role: Role.OWNER },
          data: { role: Role.ADMIN },
        });
        if (demoted.count !== 1) {
          throw new Error("NOT_OWNER");
        }

        const promoted = await tx.membership.updateMany({
          where: { id: membershipId, organizationId },
          data: { role: Role.OWNER },
        });
        if (promoted.count !== 1) {
          throw new Error("TARGET_NOT_FOUND");
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_OWNER") {
        return { error: "You don't have permission to change roles." };
      }
      if (err instanceof Error && err.message === "TARGET_NOT_FOUND") {
        return { error: "Member not found." };
      }
      throw err;
    }
  } else {
    // Simple ADMIN <-> MEMBER promote/demote. role: { not: OWNER } is
    // defense in depth — the invariant already means target can never be
    // OWNER here (the only OWNER is the viewer, already excluded above).
    const result = await prisma.membership.updateMany({
      where: { id: membershipId, organizationId, role: { not: Role.OWNER } },
      data: { role: newRole },
    });
    if (result.count === 0) {
      return { error: "Member not found." };
    }
  }

  revalidatePath("/team");
  return { error: null };
}

/**
 * Removes another member from the organization. Only the OWNER may call
 * this, and never on themselves — self-removal only happens through
 * leaveOrganizationAction, which additionally enforces the
 * always-one-OWNER invariant.
 */
export async function removeMemberAction(membershipId: string): Promise<void> {
  const { user, organizationId, membership: viewer } = await getCurrentMembership();

  if (viewer.role !== Role.OWNER) {
    throw new Error("You don't have permission to remove members.");
  }

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, userId: true, role: true },
  });

  if (!target) {
    throw new Error("Member not found.");
  }

  if (target.userId === user.id) {
    throw new Error('Use "Leave organization" to remove yourself.');
  }

  if (target.role === Role.OWNER) {
    // Unreachable given the invariant (the only OWNER is always the
    // viewer, excluded above) — kept as defense in depth.
    throw new Error("You can't remove the organization owner.");
  }

  await prisma.membership.deleteMany({ where: { id: membershipId, organizationId } });

  revalidatePath("/team");
}

/**
 * Lets the current user leave their active organization. An OWNER can only
 * leave once another OWNER exists — since the rest of this codebase
 * enforces "exactly one OWNER at all times", that condition can only be
 * met by first transferring ownership via changeRoleAction, which demotes
 * the caller to ADMIN; leaving then proceeds via the ADMIN/MEMBER path.
 */
export async function leaveOrganizationAction(): Promise<void> {
  const { user, organizationId, membership } = await getCurrentMembership();

  try {
    await prisma.$transaction(async (tx) => {
      if (membership.role === Role.OWNER) {
        const ownerCount = await tx.membership.count({
          where: { organizationId, role: Role.OWNER },
        });
        if (ownerCount <= 1) {
          throw new Error("SOLE_OWNER");
        }
      }
      await tx.membership.delete({ where: { id: membership.id } });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SOLE_OWNER") {
      throw new Error(
        "You're the only owner. Transfer ownership to someone else before leaving.",
      );
    }
    throw err;
  }

  // Land somewhere valid: another existing membership if they have one
  // (most recently created first), otherwise their own personal OWNER
  // organization, auto-provisioned via the same Stage 2 mechanism every
  // other first-time resolution already uses.
  const anotherMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { organizationId: true },
  });

  const nextOrganizationId = anotherMembership
    ? anotherMembership.organizationId
    : await getOrCreateOrganizationId(user);

  await setActiveOrganization(nextOrganizationId);

  revalidatePath("/dashboard");
  revalidatePath("/team");

  redirect(withToast("/dashboard", "Left organization"));
}
