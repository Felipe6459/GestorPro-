import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/invoices/invoice-send-controls.tsx", "utf8");

describe("InvoiceSendControls source contract", () => {
  it("uses a real random UUID, never useId, for each logical attempt", () => {
    expect(source).toContain("crypto.randomUUID()");
    expect(source).not.toContain("useId(");
  });

  it("catches rejected Server Action calls without exposing the thrown value", () => {
    expect(source).toContain("await sendInvoiceEmailAction(");
    expect(source).toMatch(/}\s*catch\s*{/);
    expect(source).not.toMatch(/catch\s*\([^)]/);
  });

  it("requires explicit warning copy before resending after UNKNOWN", () => {
    expect(source).toContain("may already have been accepted");
    expect(source).toContain("Resend anyway");
    expect(source).toContain("acknowledgeUnknownId");
  });
});
