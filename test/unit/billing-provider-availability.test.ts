import { describe, expect, it } from "vitest";
import { getBillingProviderAvailability } from "@/lib/billing/provider-availability";

describe("getBillingProviderAvailability", () => {
  it("always reports unconfigured in Stage 3 — no provider is connected", async () => {
    const result = await getBillingProviderAvailability();
    expect(result).toEqual({
      configured: false,
      provider: "PADDLE",
      checkoutAvailable: false,
      portalAvailable: false,
    });
  });
});
