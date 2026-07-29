import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = "DemoPassword123!";

const DEMO_USERS = [
  { email: "demo@clientportal.dev", name: "Jordan Ashby" },
  { email: "demo2@clientportal.dev", name: "Priya Nair" },
] as const;

/**
 * Creates (or finds) a real Supabase auth user via the Admin API, so the
 * seeded login actually works end-to-end — not just Prisma-side rows.
 * Requires SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS; never expose this
 * key client-side.
 */
async function getOrCreateAuthUser(
  email: string,
  name: string,
): Promise<{ id: string; email: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to seed a working demo login.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });

  if (created?.user?.email) {
    return { id: created.user.id, email: created.user.email };
  }

  const alreadyExists = /already been registered|already exists/i.test(
    createError?.message ?? "",
  );
  if (!alreadyExists) {
    throw createError ?? new Error(`Failed to create auth user for ${email}.`);
  }

  // Idempotent re-run: look the existing account up instead of failing.
  let page = 1;
  for (;;) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email === email);
    if (existing?.email) return { id: existing.id, email: existing.email };
    if (list.users.length === 0) break;
    page += 1;
  }

  throw new Error(`Could not find or create auth user for ${email}.`);
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function seedPrimaryUserData(userId: string) {
  const existing = await prisma.client.count({ where: { userId } });
  if (existing > 0) {
    console.log("  Primary user already has data — skipping CRM seed.");
    return;
  }

  const [northwind, bluepeak, rivermark, solaris, anchor, vantage] =
    await Promise.all([
      prisma.client.create({
        data: {
          name: "Alex Chen",
          company: "Northwind Design Studio",
          email: "alex@northwinddesign.example",
          phone: "+1 (555) 010-2231",
          status: "ACTIVE",
          notes: "Long-term retainer client. Prefers async updates via email.",
          userId,
        },
      }),
      prisma.client.create({
        data: {
          name: "Morgan Diallo",
          company: "Bluepeak Consulting",
          email: "morgan@bluepeakconsulting.example",
          phone: "+1 (555) 018-4432",
          status: "ACTIVE",
          userId,
        },
      }),
      prisma.client.create({
        data: {
          name: "Sofia Reyes",
          company: "Rivermark Retail",
          email: "sofia@rivermarkretail.example",
          status: "LEAD",
          notes: "Referred by Bluepeak. Scoping call scheduled.",
          userId,
        },
      }),
      prisma.client.create({
        data: {
          name: "Ethan Brooks",
          company: "Solaris Fitness",
          email: "ethan@solarisfitness.example",
          phone: "+1 (555) 022-7789",
          status: "ACTIVE",
          userId,
        },
      }),
      prisma.client.create({
        data: {
          name: "Dana Whitfield",
          company: "Anchor & Co. Legal",
          email: "dana@anchorlegal.example",
          status: "INACTIVE",
          notes: "Project wrapped up last quarter. Open to future work.",
          userId,
        },
      }),
      prisma.client.create({
        data: {
          name: "Kai Osei",
          company: "Vantage Point Media",
          status: "ARCHIVED",
          userId,
        },
      }),
    ]);

  const [
    websiteRedesign,
    brandGuidelines,
    crmIntegration,
    ecommerceLaunch,
    mobileAppMvp,
    marketingRefresh,
    clientPortal,
    q1Campaign,
  ] = await Promise.all([
    prisma.project.create({
      data: {
        name: "Website Redesign",
        description: "Full redesign of the marketing site and blog.",
        status: "IN_PROGRESS",
        startDate: daysFromNow(-30),
        endDate: daysFromNow(20),
        budget: "18000.00",
        clientId: northwind.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Brand Guidelines",
        status: "COMPLETED",
        startDate: daysFromNow(-90),
        endDate: daysFromNow(-45),
        budget: "6500.00",
        clientId: northwind.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "CRM Integration",
        description: "Connect internal CRM with the support desk.",
        status: "IN_PROGRESS",
        startDate: daysFromNow(-14),
        budget: "24000.00",
        clientId: bluepeak.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "E-commerce Launch",
        description: "New storefront build for the spring product line.",
        status: "PLANNING",
        startDate: daysFromNow(10),
        clientId: rivermark.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Mobile App MVP",
        status: "IN_PROGRESS",
        startDate: daysFromNow(-60),
        endDate: daysFromNow(15),
        budget: "42000.00",
        clientId: solaris.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Marketing Site Refresh",
        status: "ON_HOLD",
        startDate: daysFromNow(-20),
        clientId: solaris.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Client Portal",
        status: "COMPLETED",
        startDate: daysFromNow(-150),
        endDate: daysFromNow(-100),
        budget: "15000.00",
        clientId: anchor.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Q1 Campaign",
        status: "CANCELLED",
        startDate: daysFromNow(-70),
        clientId: vantage.id,
        ownerId: userId,
      },
    }),
  ]);

  await prisma.task.createMany({
    data: [
      { title: "Wireframe homepage", status: "DONE", priority: "HIGH", dueDate: daysFromNow(-25), completedAt: daysFromNow(-24), projectId: websiteRedesign.id },
      { title: "Design system components", status: "DONE", priority: "MEDIUM", dueDate: daysFromNow(-15), completedAt: daysFromNow(-16), projectId: websiteRedesign.id },
      { title: "Build blog template", status: "IN_PROGRESS", priority: "HIGH", dueDate: daysFromNow(3), projectId: websiteRedesign.id },
      { title: "SEO audit", status: "TODO", priority: "LOW", dueDate: daysFromNow(12), projectId: websiteRedesign.id },
      { title: "Client review call", status: "TODO", priority: "MEDIUM", dueDate: daysFromNow(-2), projectId: websiteRedesign.id },
      { title: "Finalize logo variations", status: "DONE", priority: "MEDIUM", completedAt: daysFromNow(-50), projectId: brandGuidelines.id },
      { title: "API authentication setup", status: "DONE", priority: "URGENT", completedAt: daysFromNow(-10), projectId: crmIntegration.id },
      { title: "Webhook error handling", status: "IN_PROGRESS", priority: "HIGH", dueDate: daysFromNow(5), projectId: crmIntegration.id },
      { title: "Write integration tests", status: "TODO", priority: "MEDIUM", dueDate: daysFromNow(9), projectId: crmIntegration.id },
      { title: "Fix sync race condition", status: "IN_REVIEW", priority: "URGENT", dueDate: daysFromNow(-1), projectId: crmIntegration.id },
      { title: "Vendor comparison doc", status: "TODO", priority: "LOW", dueDate: daysFromNow(20), projectId: ecommerceLaunch.id },
      { title: "Define product catalog schema", status: "TODO", priority: "MEDIUM", dueDate: daysFromNow(14), projectId: ecommerceLaunch.id },
      { title: "Onboarding flow prototype", status: "IN_PROGRESS", priority: "HIGH", dueDate: daysFromNow(4), projectId: mobileAppMvp.id },
      { title: "Push notification service", status: "TODO", priority: "MEDIUM", dueDate: daysFromNow(18), projectId: mobileAppMvp.id },
      { title: "App store submission checklist", status: "TODO", priority: "LOW", dueDate: daysFromNow(25), projectId: mobileAppMvp.id },
      { title: "Fix crash on iOS 18", status: "IN_REVIEW", priority: "URGENT", dueDate: daysFromNow(-3), projectId: mobileAppMvp.id },
      { title: "Refresh hero section copy", status: "TODO", priority: "LOW", dueDate: daysFromNow(30), projectId: marketingRefresh.id },
      { title: "Handoff documentation", status: "DONE", priority: "MEDIUM", completedAt: daysFromNow(-101), projectId: clientPortal.id },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      { invoiceNumber: "INV-1001", amount: "6500.00", status: "PAID", issueDate: daysFromNow(-95), dueDate: daysFromNow(-80), paidAt: daysFromNow(-82), projectId: brandGuidelines.id, clientId: northwind.id },
      { invoiceNumber: "INV-1002", amount: "9000.00", status: "SENT", issueDate: daysFromNow(-5), dueDate: daysFromNow(25), projectId: websiteRedesign.id, clientId: northwind.id },
      { invoiceNumber: "INV-1003", amount: "9000.00", status: "DRAFT", issueDate: daysFromNow(0), notes: "Second milestone — pending scope sign-off.", projectId: websiteRedesign.id, clientId: northwind.id },
      { invoiceNumber: "INV-1004", amount: "12000.00", status: "OVERDUE", issueDate: daysFromNow(-40), dueDate: daysFromNow(-10), projectId: crmIntegration.id, clientId: bluepeak.id },
      { invoiceNumber: "INV-1005", amount: "12000.00", status: "SENT", issueDate: daysFromNow(-3), dueDate: daysFromNow(27), projectId: crmIntegration.id, clientId: bluepeak.id },
      { invoiceNumber: "INV-1006", amount: "14000.00", status: "PAID", issueDate: daysFromNow(-58), dueDate: daysFromNow(-44), paidAt: daysFromNow(-46), projectId: mobileAppMvp.id, clientId: solaris.id },
      { invoiceNumber: "INV-1007", amount: "14000.00", status: "SENT", issueDate: daysFromNow(-2), dueDate: daysFromNow(28), projectId: mobileAppMvp.id, clientId: solaris.id },
      { invoiceNumber: "INV-1008", amount: "15000.00", status: "PAID", issueDate: daysFromNow(-105), dueDate: daysFromNow(-90), paidAt: daysFromNow(-92), projectId: clientPortal.id, clientId: anchor.id },
      { invoiceNumber: "INV-1009", amount: "3200.00", status: "CANCELLED", issueDate: daysFromNow(-65), dueDate: daysFromNow(-35), notes: "Campaign cancelled by client before launch.", projectId: q1Campaign.id, clientId: vantage.id },
    ],
  });
}

async function seedSecondaryUserData(userId: string) {
  const existing = await prisma.client.count({ where: { userId } });
  if (existing > 0) {
    console.log("  Secondary user already has data — skipping CRM seed.");
    return;
  }

  const [harborCafe, greenleaf] = await Promise.all([
    prisma.client.create({
      data: {
        name: "Nina Ferreira",
        company: "Harbor Cafe Co.",
        email: "nina@harborcafe.example",
        status: "ACTIVE",
        userId,
      },
    }),
    prisma.client.create({
      data: {
        name: "Tom Halvorsen",
        company: "Greenleaf Landscaping",
        status: "LEAD",
        userId,
      },
    }),
  ]);

  const [posSystem, siteRefresh] = await Promise.all([
    prisma.project.create({
      data: {
        name: "POS System Rollout",
        status: "IN_PROGRESS",
        startDate: daysFromNow(-10),
        clientId: harborCafe.id,
        ownerId: userId,
      },
    }),
    prisma.project.create({
      data: {
        name: "Website Refresh",
        status: "PLANNING",
        clientId: greenleaf.id,
        ownerId: userId,
      },
    }),
  ]);

  await prisma.task.createMany({
    data: [
      { title: "Configure receipt printer", status: "DONE", priority: "MEDIUM", completedAt: daysFromNow(-4), projectId: posSystem.id },
      { title: "Staff training session", status: "TODO", priority: "HIGH", dueDate: daysFromNow(6), projectId: posSystem.id },
      { title: "Draft sitemap", status: "TODO", priority: "LOW", dueDate: daysFromNow(15), projectId: siteRefresh.id },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      { invoiceNumber: "INV-2001", amount: "1800.00", status: "SENT", issueDate: daysFromNow(-4), dueDate: daysFromNow(26), projectId: posSystem.id, clientId: harborCafe.id },
      { invoiceNumber: "INV-2002", amount: "900.00", status: "DRAFT", issueDate: daysFromNow(0), projectId: siteRefresh.id, clientId: greenleaf.id },
    ],
  });
}

async function main() {
  console.log(`Seeding with demo password: ${DEMO_PASSWORD}\n`);

  const [primaryAuth, secondaryAuth] = await Promise.all([
    getOrCreateAuthUser(DEMO_USERS[0].email, DEMO_USERS[0].name),
    getOrCreateAuthUser(DEMO_USERS[1].email, DEMO_USERS[1].name),
  ]);

  const [primaryUser, secondaryUser] = await Promise.all([
    prisma.user.upsert({
      where: { id: primaryAuth.id },
      update: {},
      create: { id: primaryAuth.id, email: primaryAuth.email, name: DEMO_USERS[0].name },
    }),
    prisma.user.upsert({
      where: { id: secondaryAuth.id },
      update: {},
      create: { id: secondaryAuth.id, email: secondaryAuth.email, name: DEMO_USERS[1].name },
    }),
  ]);

  console.log(`Primary demo user:   ${primaryUser.email}`);
  console.log(`Secondary demo user: ${secondaryUser.email}\n`);

  await seedPrimaryUserData(primaryUser.id);
  await seedSecondaryUserData(secondaryUser.id);

  console.log("\nSeed complete. Log in with either demo account above and the password shown at the top.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
