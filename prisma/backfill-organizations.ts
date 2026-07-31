import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, Role } from "../src/generated/prisma/client";

/**
 * Stage 3 multi-tenant backfill.
 *
 * For every existing User this script:
 *   1. Ensures a personal Organization + OWNER Membership exist.
 *   2. Fills organizationId on Client/Project (by direct ownership) and
 *      Task (via its Project's owner).
 *   3. Fills organizationId on Invoice, cross-checking that the invoice's
 *      Project owner and Client owner agree before assigning a tenant —
 *      mismatches are reported and left NULL for manual review.
 *
 * Idempotent: an existing OWNER Membership is reused (no duplicate
 * Organizations/Memberships), and every backfill query only ever touches
 * rows where organizationId IS NULL, so already-tagged rows are untouched.
 *
 * Usage:
 *   npx tsx prisma/backfill-organizations.ts            # dry run (default, no writes)
 *   npx tsx prisma/backfill-organizations.ts --apply     # perform the writes
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface Counts {
  users: number;
  organizations: number;
  memberships: number;
  clientsNull: number;
  projectsNull: number;
  tasksNull: number;
  invoicesNull: number;
}

function printCounts(counts: Counts) {
  console.log(`    Users:                ${counts.users}`);
  console.log(`    Organizations:        ${counts.organizations}`);
  console.log(`    Memberships:          ${counts.memberships}`);
  console.log(`    Client.organizationId    NULL: ${counts.clientsNull}`);
  console.log(`    Project.organizationId   NULL: ${counts.projectsNull}`);
  console.log(`    Task.organizationId      NULL: ${counts.tasksNull}`);
  console.log(`    Invoice.organizationId   NULL: ${counts.invoicesNull}`);
}

async function snapshotCounts(): Promise<Counts> {
  const [users, organizations, memberships, clientsNull, projectsNull, tasksNull, invoicesNull] =
    await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.membership.count(),
      prisma.client.count({ where: { organizationId: null } }),
      prisma.project.count({ where: { organizationId: null } }),
      prisma.task.count({ where: { organizationId: null } }),
      prisma.invoice.count({ where: { organizationId: null } }),
    ]);
  return { users, organizations, memberships, clientsNull, projectsNull, tasksNull, invoicesNull };
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "org"
  );
}

function personalOrgSlugBase(user: { id: string; name: string; email: string }): string {
  const base = slugify(user.name) || slugify(user.email.split("@")[0]);
  // Suffix with a stable slice of the (immutable) user id so the base slug
  // doesn't need to be globally unique on its own — collisions still fall
  // back to uniqueSlug() below.
  return `${base}-${user.id.slice(0, 8)}`;
}

async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  let candidate = base;
  let attempt = 1;
  // Extremely unlikely to loop given the id suffix, but stay correct if it does.
  while (await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

async function ensureOrganizationForUser(
  user: { id: string; name: string; email: string },
  dryRun: boolean,
): Promise<{ organizationId: string; created: boolean }> {
  const existingOwnerMembership = await prisma.membership.findFirst({
    where: { userId: user.id, role: Role.OWNER },
    select: { organizationId: true },
  });

  if (existingOwnerMembership) {
    return { organizationId: existingOwnerMembership.organizationId, created: false };
  }

  if (dryRun) {
    // Nothing persisted; the id is only a placeholder for downstream dry-run counting.
    return { organizationId: `dry-run:${user.id}`, created: true };
  }

  return prisma.$transaction(async (tx) => {
    const slug = await uniqueSlug(tx, personalOrgSlugBase(user));
    const organization = await tx.organization.create({
      data: { name: `${user.name}'s Workspace`, slug },
    });
    await tx.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
    });
    return { organizationId: organization.id, created: true };
  });
}

async function backfillOwnedEntities(
  userId: string,
  organizationId: string,
  dryRun: boolean,
): Promise<{ clients: number; projects: number; tasks: number }> {
  const clientWhere = { userId, organizationId: null } as const;
  const projectWhere = { ownerId: userId, organizationId: null } as const;
  const taskWhere = { organizationId: null, project: { ownerId: userId } } as const;

  if (dryRun) {
    const [clients, projects, tasks] = await Promise.all([
      prisma.client.count({ where: clientWhere }),
      prisma.project.count({ where: projectWhere }),
      prisma.task.count({ where: taskWhere }),
    ]);
    return { clients, projects, tasks };
  }

  const [clients, projects, tasks] = await prisma.$transaction([
    prisma.client.updateMany({ where: clientWhere, data: { organizationId } }),
    prisma.project.updateMany({ where: projectWhere, data: { organizationId } }),
    prisma.task.updateMany({ where: taskWhere, data: { organizationId } }),
  ]);
  return { clients: clients.count, projects: projects.count, tasks: tasks.count };
}

async function backfillInvoices(
  orgByUserId: Map<string, string>,
  dryRun: boolean,
): Promise<{
  updated: number;
  inconsistent: { id: string; projectOwnerId: string; clientOwnerId: string }[];
}> {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: null },
    select: {
      id: true,
      project: { select: { ownerId: true } },
      client: { select: { userId: true } },
    },
  });

  const byOwner = new Map<string, string[]>();
  const inconsistent: { id: string; projectOwnerId: string; clientOwnerId: string }[] = [];

  for (const invoice of invoices) {
    const projectOwnerId = invoice.project.ownerId;
    const clientOwnerId = invoice.client.userId;
    if (projectOwnerId !== clientOwnerId) {
      inconsistent.push({ id: invoice.id, projectOwnerId, clientOwnerId });
      continue;
    }
    const ids = byOwner.get(projectOwnerId) ?? [];
    ids.push(invoice.id);
    byOwner.set(projectOwnerId, ids);
  }

  if (dryRun) {
    const updated = [...byOwner.values()].reduce((sum, ids) => sum + ids.length, 0);
    return { updated, inconsistent };
  }

  let updated = 0;
  for (const [ownerId, ids] of byOwner) {
    const organizationId = orgByUserId.get(ownerId);
    if (!organizationId) {
      // Shouldn't happen — every user was given an org in the prior pass —
      // but skip rather than write a bad value if it ever does.
      continue;
    }
    const result = await prisma.invoice.updateMany({
      where: { id: { in: ids } },
      data: { organizationId },
    });
    updated += result.count;
  }
  return { updated, inconsistent };
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes will be made)" : "APPLY (writing changes)"}\n`);

  console.log("Before:");
  const before = await snapshotCounts();
  printCounts(before);

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });

  let organizationsCreated = 0;
  let membershipsCreated = 0;
  let clientsUpdated = 0;
  let projectsUpdated = 0;
  let tasksUpdated = 0;

  const orgByUserId = new Map<string, string>();

  for (const user of users) {
    const { organizationId, created } = await ensureOrganizationForUser(user, dryRun);
    orgByUserId.set(user.id, organizationId);
    if (created) {
      organizationsCreated += 1;
      membershipsCreated += 1;
    }

    const owned = await backfillOwnedEntities(user.id, organizationId, dryRun);
    clientsUpdated += owned.clients;
    projectsUpdated += owned.projects;
    tasksUpdated += owned.tasks;
  }

  const invoiceResult = await backfillInvoices(orgByUserId, dryRun);

  console.log("\nRun summary:");
  console.log(`  Users processed:        ${users.length}`);
  console.log(`  Organizations created:  ${organizationsCreated}`);
  console.log(`  Memberships created:    ${membershipsCreated}`);
  console.log(`  Clients updated:        ${clientsUpdated}`);
  console.log(`  Projects updated:       ${projectsUpdated}`);
  console.log(`  Tasks updated:          ${tasksUpdated}`);
  console.log(`  Invoices updated:       ${invoiceResult.updated}`);

  if (invoiceResult.inconsistent.length > 0) {
    console.log(
      `\n  Inconsistent invoices left NULL (Project owner != Client owner): ${invoiceResult.inconsistent.length}`,
    );
    for (const item of invoiceResult.inconsistent) {
      console.log(
        `    Invoice ${item.id}: project owner ${item.projectOwnerId} != client owner ${item.clientOwnerId}`,
      );
    }
  } else {
    console.log("\n  No inconsistent Project/Client ownership detected.");
  }

  const after: Counts = dryRun
    ? {
        users: before.users,
        organizations: before.organizations + organizationsCreated,
        memberships: before.memberships + membershipsCreated,
        clientsNull: before.clientsNull - clientsUpdated,
        projectsNull: before.projectsNull - projectsUpdated,
        tasksNull: before.tasksNull - tasksUpdated,
        invoicesNull: before.invoicesNull - invoiceResult.updated,
      }
    : await snapshotCounts();

  console.log(`\n${dryRun ? "After (projected)" : "After"}:`);
  printCounts(after);

  if (dryRun) {
    console.log("\nDry run only — no changes were written. Re-run with --apply to persist changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
