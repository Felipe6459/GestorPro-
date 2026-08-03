import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// PGLITE_TEST_DB is set only by test/integration/setup-env.ts, pointing
// this at the Stage 4 integration suite's in-process PGlite database (see
// test/support/local-postgres.ts). PGlite's socket server can't service
// more than one connection at a time — without capping the pool, any
// concurrent Promise.all(...) of Prisma calls (in app code or fixtures)
// gets its connection closed with "Server has closed the connection."
// max: 1 makes pg.Pool queue those calls onto one connection instead of
// opening several; behavior is identical, just serialized. Never applies
// against the real DATABASE_URL (local dev or production), where this env
// var is never set.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.PGLITE_TEST_DB ? { max: 1 } : {}),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

// Cached unconditionally, not just outside production — this file is one
// module among several separately-bundled server graphs (Server Actions
// compile apart from Route Handlers/page renders), and each graph that
// first imports this module gets its own fresh evaluation. Without a
// process-wide cache, that means multiple independent PrismaClient
// instances (each opening its own connection) even within a single
// `next start` process, not just across dev's hot-reloads. Harmless
// against a real multi-connection Postgres, but PGlite's socket server
// serializes all query execution through one handler-affinity-aware
// queue (see test/support/local-postgres.ts) — a second connection
// opening its own transaction while another is mid-flight can stall that
// queue outright, which is how this was actually found (an intermittent
// E2E hang during Stage 5, never a report from real usage).
globalForPrisma.prisma = prisma;
