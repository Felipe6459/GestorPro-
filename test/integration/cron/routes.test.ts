import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeTestModeIdentity, TEST_USER_COOKIE } from "@/lib/test-mode";

// Same reasoning as test/unit/cron-auth.test.ts — src/lib/cron/auth.ts
// imports the real "server-only" marker package, which throws outside
// Next's own "react-server" resolve condition. Neutralizing the marker
// package itself doesn't touch requireCronAuth's real logic at all.
vi.mock("server-only", () => ({}));

const { GET: deliveryGet } = await import("@/app/api/cron/notification-delivery/route");
const { GET: cleanupGet } = await import("@/app/api/cron/notification-cleanup/route");

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const TEST_CRON_SECRET = "integration-test-cron-secret";

function cronRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers: new Headers(headers) });
}

afterAll(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});

describe("cron routes — authorization (integration, real requireCronAuth + real Route Handlers)", () => {
  // Reset before EVERY test, not just once — the "CRON_SECRET unset" test
  // below deletes it mid-suite, and without re-establishing it here, that
  // would leak into every later test in this file.
  beforeEach(() => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
  });

  it("notification-delivery: rejects a request with no Authorization header (401)", async () => {
    const response = await deliveryGet(cronRequest("/api/cron/notification-delivery"));
    expect(response.status).toBe(401);
  });

  it("notification-delivery: rejects the wrong secret (401)", async () => {
    const response = await deliveryGet(
      cronRequest("/api/cron/notification-delivery", { authorization: "Bearer wrong-secret" }),
    );
    expect(response.status).toBe(401);
  });

  it("notification-delivery: accepts the correct bearer secret (200) and returns only an aggregate summary", async () => {
    const response = await deliveryGet(
      cronRequest("/api/cron/notification-delivery", { authorization: `Bearer ${TEST_CRON_SECRET}` }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["claimed", "deleted", "failed", "scanned", "sent", "skipped"]);
    for (const value of Object.values(body)) {
      expect(typeof value).toBe("number");
    }
  });

  it("notification-cleanup: rejects a request with no Authorization header (401)", async () => {
    const response = await cleanupGet(cronRequest("/api/cron/notification-cleanup"));
    expect(response.status).toBe(401);
  });

  it("notification-cleanup: rejects the wrong secret (401)", async () => {
    const response = await cleanupGet(
      cronRequest("/api/cron/notification-cleanup", { authorization: "Bearer wrong-secret" }),
    );
    expect(response.status).toBe(401);
  });

  it("notification-cleanup: accepts the correct bearer secret (200) and returns only an aggregate summary", async () => {
    const response = await cleanupGet(
      cronRequest("/api/cron/notification-cleanup", { authorization: `Bearer ${TEST_CRON_SECRET}` }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["claimed", "deleted", "failed", "scanned", "sent", "skipped"]);
  });

  it("with CRON_SECRET unset (simulating a misconfigured deployment), both routes safely reject even a plausible-looking bearer value", async () => {
    delete process.env.CRON_SECRET;
    const deliveryResponse = await deliveryGet(
      cronRequest("/api/cron/notification-delivery", { authorization: "Bearer anything" }),
    );
    const cleanupResponse = await cleanupGet(
      cronRequest("/api/cron/notification-cleanup", { authorization: "Bearer anything" }),
    );
    expect(deliveryResponse.status).toBe(401);
    expect(cleanupResponse.status).toBe(401);
  });

  it("a staff session cookie is never a substitute for the bearer secret — the route never reads cookies at all", async () => {
    const cookieValue = encodeTestModeIdentity({ id: "some-user-id", email: "owner@example.com" });
    const response = await deliveryGet(
      cronRequest("/api/cron/notification-delivery", { cookie: `${TEST_USER_COOKIE}=${cookieValue}` }),
    );
    expect(response.status).toBe(401);
  });
});
