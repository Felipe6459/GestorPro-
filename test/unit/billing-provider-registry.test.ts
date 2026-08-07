import { describe, expect, it, vi, afterEach } from "vitest";

// src/lib/billing/provider/provider.ts imports "server-only" — see
// test/unit/cron-auth.test.ts's own header comment.
vi.mock("server-only", () => ({}));

async function importFresh() {
  vi.resetModules();
  return import("@/lib/billing/provider/provider");
}

describe("getBillingProviderAdapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves to the mock provider under TEST_MODE", async () => {
    vi.stubEnv("TEST_MODE", "1");
    const { getBillingProviderAdapter } = await importFresh();
    expect(getBillingProviderAdapter().kind).toBe("mock");
  });

  it("resolves to the unconfigured provider outside TEST_MODE", async () => {
    vi.stubEnv("TEST_MODE", "");
    const { getBillingProviderAdapter } = await importFresh();
    expect(getBillingProviderAdapter().kind).toBe("unconfigured");
  });
});
