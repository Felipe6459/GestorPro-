import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";

const execFileAsync = promisify(execFile);

// A real Postgres engine (PGlite compiles actual Postgres to WASM),
// reachable over a normal TCP wire-protocol connection — not a mock, not
// pg-mem's reimplementation. This exists because this sandbox has neither
// Docker nor a writable Homebrew, so a real `supabase start`/system
// Postgres isn't available (see Stage 4's report for the full story).
// `prisma migrate deploy` and the app's own `@prisma/adapter-pg` both
// connect to this exactly as they would to any real Postgres server.
const TEST_DB_HOST = "127.0.0.1";
const TEST_DB_PORT = 55432;

export const TEST_DATABASE_URL = `postgresql://postgres@${TEST_DB_HOST}:${TEST_DB_PORT}/postgres`;

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

/**
 * Starts the in-process Postgres engine, creates stand-ins for the two
 * Supabase-managed roles the lockdown migration (20260802120937) revokes
 * privileges from, and applies every migration via a real `prisma migrate
 * deploy` subprocess. Idempotent-ish for one process lifetime — call once
 * per test run (see test/integration/global-setup.ts).
 */
async function waitForSocketReady(): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client({
      host: TEST_DB_HOST,
      port: TEST_DB_PORT,
      database: "postgres",
      user: "postgres",
    });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`PGlite socket server never became reachable: ${String(lastError)}`);
}

export async function startTestDatabase(): Promise<void> {
  pglite = new PGlite();
  socketServer = new PGLiteSocketServer({ db: pglite, host: TEST_DB_HOST, port: TEST_DB_PORT });
  await socketServer.start();
  // PGLiteSocketServer's start() can resolve slightly before the
  // underlying net.Server is actually accepting connections — wait for a
  // real TCP handshake to succeed rather than racing the subprocess below
  // against that gap.
  await waitForSocketReady();

  // `anon`/`authenticated` are real roles on a Supabase project (owned by
  // the platform, not this app's migrations) — they don't exist on a bare
  // Postgres, so the lockdown migration's REVOKE statements would
  // otherwise fail with "role does not exist". Creating them as inert
  // stand-ins lets every migration apply exactly as it does against a
  // real Supabase project; verifying the REVOKE actually took effect is
  // what test/integration/security/grants.test.ts checks.
  await pglite.query("CREATE ROLE anon NOLOGIN");
  await pglite.query("CREATE ROLE authenticated NOLOGIN");

  // Must be the async execFile, never execFileSync: PGlite runs in this
  // same process (a WASM instance driven by the Node event loop), so a
  // *synchronous* child-process wait would freeze the very engine the
  // migrate subprocess is trying to talk to over the socket — it would
  // accept the TCP connection (that much happens at the OS level) but
  // never actually process a query, and the subprocess would eventually
  // report "can't reach database server". Keeping this async lets the
  // event loop keep driving PGlite while the subprocess runs.
  await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
    },
  });
}

export async function stopTestDatabase(): Promise<void> {
  await socketServer?.stop();
  await pglite?.close();
  pglite = undefined;
  socketServer = undefined;
}
