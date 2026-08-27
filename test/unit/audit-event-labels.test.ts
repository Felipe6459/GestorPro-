import { describe, expect, it } from "vitest";
import { formatAuditActionLabel, formatAuditReasonLabel } from "@/lib/platform-admin/audit-event-labels";

/**
 * Recent Admin Actions (Organization Detail). Proves the small,
 * server-safe label map audit-event-labels.ts backs: known values get
 * friendly labels, `null` reason stays `null` (never a placeholder like
 * "None."), and — the one behavior that matters most for a formatter
 * sitting between a real database column and a rendered page — an
 * unrecognized/future value never throws, degrading to its own raw
 * value instead of crashing the page or silently hiding the row.
 */
describe("formatAuditActionLabel", () => {
  it("maps ORGANIZATION_SUSPENDED to Suspended", () => {
    expect(formatAuditActionLabel("ORGANIZATION_SUSPENDED")).toBe("Suspended");
  });

  it("maps ORGANIZATION_REACTIVATED to Reactivated", () => {
    expect(formatAuditActionLabel("ORGANIZATION_REACTIVATED")).toBe("Reactivated");
  });

  it("degrades an unrecognized/future action to its own raw value, never throwing", () => {
    expect(() => formatAuditActionLabel("SOME_FUTURE_ACTION")).not.toThrow();
    expect(formatAuditActionLabel("SOME_FUTURE_ACTION")).toBe("SOME_FUTURE_ACTION");
  });
});

describe("formatAuditReasonLabel", () => {
  it("maps every known SuspensionReasonCode to its friendly label", () => {
    expect(formatAuditReasonLabel("BILLING_DISPUTE")).toBe("Billing dispute");
    expect(formatAuditReasonLabel("POLICY_VIOLATION")).toBe("Policy violation");
    expect(formatAuditReasonLabel("SECURITY_RISK")).toBe("Security risk");
    expect(formatAuditReasonLabel("CUSTOMER_REQUEST")).toBe("Customer request");
    expect(formatAuditReasonLabel("OTHER")).toBe("Other");
  });

  it("returns null for a null reason code (Reactivate never sets one) — never a placeholder string", () => {
    expect(formatAuditReasonLabel(null)).toBeNull();
  });

  it("degrades an unrecognized/future reason code to its own raw value, never throwing", () => {
    expect(() => formatAuditReasonLabel("SOME_FUTURE_REASON")).not.toThrow();
    expect(formatAuditReasonLabel("SOME_FUTURE_REASON")).toBe("SOME_FUTURE_REASON");
  });
});
