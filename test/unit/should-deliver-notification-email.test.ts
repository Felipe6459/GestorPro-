import { describe, expect, it } from "vitest";
import { shouldDeliverNotificationEmail } from "@/lib/notifications/email/deliver-notification-email";

const BASE = {
  recipient: { email: "user@example.com" },
  providerConfigured: true,
  existingDelivery: null,
};

describe("shouldDeliverNotificationEmail — allowlist", () => {
  it("allows every type on the MVP email allowlist", () => {
    for (const type of [
      "ROLE_CHANGED",
      "OWNERSHIP_TRANSFERRED",
      "MEMBER_REMOVED",
      "PORTAL_INVITATION_ACCEPTED",
      "INVOICE_STATUS_CHANGED",
    ] as const) {
      const result = shouldDeliverNotificationEmail({ ...BASE, notification: { type } });
      expect(result).toEqual({ deliver: true });
    }
  });

  it("rejects INVITATION_ACCEPTED — a deliberate MVP exclusion, not an oversight", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "INVITATION_ACCEPTED" },
    });
    expect(result).toEqual({ deliver: false, reason: "not_allowlisted" });
  });
});

describe("shouldDeliverNotificationEmail — recipient email", () => {
  it("rejects a missing recipient email", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      recipient: { email: null },
    });
    expect(result).toEqual({ deliver: false, reason: "no_recipient_email" });
  });

  it("rejects an undefined recipient email", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      recipient: { email: undefined },
    });
    expect(result).toEqual({ deliver: false, reason: "no_recipient_email" });
  });

  it("rejects a blank/whitespace-only recipient email", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      recipient: { email: "   " },
    });
    expect(result).toEqual({ deliver: false, reason: "no_recipient_email" });
  });
});

describe("shouldDeliverNotificationEmail — provider configuration", () => {
  it("rejects when the provider isn't configured", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      providerConfigured: false,
    });
    expect(result).toEqual({ deliver: false, reason: "not_configured" });
  });
});

describe("shouldDeliverNotificationEmail — already-resolved deliveries", () => {
  it("SENT is a no-op — never re-delivers", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: { status: "SENT", attemptCount: 1 },
    });
    expect(result).toEqual({ deliver: false, reason: "already_resolved" });
  });

  it("SKIPPED is a no-op — never retried automatically", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: { status: "SKIPPED", attemptCount: 0 },
    });
    expect(result).toEqual({ deliver: false, reason: "already_resolved" });
  });

  it("FAILED with attemptCount at the MVP ceiling (1) is not retried", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: { status: "FAILED", attemptCount: 1 },
    });
    expect(result).toEqual({ deliver: false, reason: "retry_limit_reached" });
  });

  it("FAILED with attemptCount below the ceiling (0) still gets its one retry", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: { status: "FAILED", attemptCount: 0 },
    });
    expect(result).toEqual({ deliver: true });
  });

  it("PENDING (never actually persisted by this synchronous helper, but handled) still gets attempted", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: { status: "PENDING", attemptCount: 0 },
    });
    expect(result).toEqual({ deliver: true });
  });

  it("no existing delivery row at all is the common case — proceeds normally", () => {
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "ROLE_CHANGED" },
      existingDelivery: null,
    });
    expect(result).toEqual({ deliver: true });
  });
});

describe("shouldDeliverNotificationEmail — precedence", () => {
  it("an already-resolved delivery short-circuits before the allowlist is even checked", () => {
    // INVITATION_ACCEPTED isn't allowlisted at all, but if a delivery row
    // somehow already exists as SENT, that fact takes precedence — the
    // reason reported is "already_resolved", not "not_allowlisted".
    const result = shouldDeliverNotificationEmail({
      ...BASE,
      notification: { type: "INVITATION_ACCEPTED" },
      existingDelivery: { status: "SENT", attemptCount: 1 },
    });
    expect(result).toEqual({ deliver: false, reason: "already_resolved" });
  });
});
