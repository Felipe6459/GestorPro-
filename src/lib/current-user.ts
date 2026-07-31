import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";

/**
 * Ensures a Prisma User row exists for the currently authenticated Supabase
 * user, using the Supabase auth user id as the Prisma User id. Called
 * independently from ~20 pages/actions with no shared request-level cache,
 * so on a first-ever login it's normal for several of these (e.g. Next.js
 * prefetching sidebar links) to race to create the same row concurrently.
 * If this call loses that race, the row now exists (created by the winner),
 * so we just read it back instead of surfacing the P2002.
 */
export async function getOrCreateUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  try {
    return await prisma.user.upsert({
      where: { id: authUser.id },
      update: {},
      create: {
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.name ?? authUser.email!.split("@")[0],
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.user.findUnique({
        where: { id: authUser.id },
      });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "org"
  );
}

async function uniqueOrganizationSlug(
  tx: Prisma.TransactionClient,
  base: string,
): Promise<string> {
  let candidate = base;
  let attempt = 1;
  while (await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

/**
 * Resolves the organization the given user belongs to, using their OWNER
 * Membership as the source of truth (mirrors prisma/backfill-organizations.ts).
 * Users created before the multi-tenant backfill already have one; users
 * created afterwards need a personal org+membership created on the fly here,
 * so this stays idempotent and safe to call on every request.
 */
export async function getOrCreateOrganizationId(user: {
  id: string;
  name: string;
  email: string;
}): Promise<string> {
  const ownerMembership = await prisma.membership.findFirst({
    where: { userId: user.id, role: Role.OWNER },
    select: { organizationId: true },
  });

  if (ownerMembership) {
    return ownerMembership.organizationId;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { userId: user.id, role: Role.OWNER },
        select: { organizationId: true },
      });
      if (existing) {
        return existing.organizationId;
      }

      const base = slugify(user.name) || slugify(user.email.split("@")[0]);
      const slug = await uniqueOrganizationSlug(tx, `${base}-${user.id.slice(0, 8)}`);
      const organization = await tx.organization.create({
        data: { name: `${user.name}'s Workspace`, slug },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
      });
      return organization.id;
    });
  } catch (err) {
    // Concurrent requests (e.g. prefetched pages) can race to create the
    // same user's personal org; the loser just reads back the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.membership.findFirst({
        where: { userId: user.id, role: Role.OWNER },
        select: { organizationId: true },
      });
      if (existing) {
        return existing.organizationId;
      }
    }
    throw err;
  }
}

/**
 * Convenience wrapper for the common case: pages/actions that need both the
 * current User row and the organizationId to scope Client queries by.
 */
export async function getCurrentUserOrganization() {
  const user = await getOrCreateUser();
  const organizationId = await getOrCreateOrganizationId(user);
  return { user, organizationId };
}
