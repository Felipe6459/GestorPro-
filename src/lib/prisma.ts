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

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
