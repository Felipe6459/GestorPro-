import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { Role } from "@/generated/prisma/enums";
import { getRunId, testEmail, testSlug } from "../support/run-id";
import { TEST_EMAIL_DOMAIN } from "../support/env";

export type TestFixtures = {
  runId: string;
  owner: { id: string; email: string; name: string };
  organization: { id: string; slug: string };
  // TODO (Stage 3+): clients, projects, tasks, invoices, portalUsers,
  // invitations, attachments — added alongside the test category that first
  // needs each one, rather than speculatively here.
};

/**
 * Creates the one thing almost every integration/E2E test needs: a real,
 * logged-in-capable staff identity (Supabase Auth user + Prisma User) that
 * owns one Organization as OWNER. Everything else (Clients, Invitations,
 * Attachments, ...) is deliberately NOT built here yet — see the TODO on
 * TestFixtures above.
 *
 * Uses `@supabase/supabase-js` directly (not this app's own
 * `src/lib/storage`/`src/lib/email` modules, which are guarded by
 * `import "server-only"` and cannot run outside Next's own build).
 */
export async function seedTestFixtures(runId: string = getRunId()): Promise<TestFixtures> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("seedTestFixtures requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = testEmail("owner-a", TEST_EMAIL_DOMAIN, runId);
  const { data: authUser, error } = await admin.auth.admin.createUser({
    email,
    password: "TestFixturePassword123!",
    email_confirm: true,
  });
  if (error || !authUser.user) {
    throw new Error(`seedTestFixtures: failed to create Supabase Auth user — ${error?.message}`);
  }

  const name = "Test Owner A";
  const user = await prisma.user.create({
    data: { id: authUser.user.id, email, name },
  });

  const organization = await prisma.organization.create({
    data: { name: "Test Org A", slug: testSlug("org-a", runId) },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
  });

  return {
    runId,
    owner: { id: user.id, email: user.email, name: user.name },
    organization: { id: organization.id, slug: organization.slug },
  };
}
