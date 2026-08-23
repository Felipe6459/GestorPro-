import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { isMembershipUserForeignKeyViolation } from "@/lib/current-user";

/**
 * Stability Correction — F1. Real `Prisma.PrismaClientKnownRequestError`
 * instances (a genuinely constructible, exported class — not a mock of
 * any business logic), shaped exactly as empirically confirmed against a
 * real Postgres FK violation (see organization-provisioning.test.ts's own
 * header comment), used here to prove the classifier discriminates the
 * one specific, safely-recoverable constraint from every other P2003 and
 * from non-Prisma errors — none of which this function's own real
 * transaction can ever produce (Organization/Subscription are always
 * freshly created moments earlier in the same transaction), so this is
 * the only way to prove the negative cases without weakening the
 * classifier itself.
 */

function realP2003(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("mock FK violation", {
    code: "P2003",
    clientVersion: "test",
    meta,
  });
}

describe("isMembershipUserForeignKeyViolation", () => {
  it("recognizes the exact real Membership.userId FK violation shape", () => {
    const err = realP2003({
      modelName: "Membership",
      driverAdapterError: { cause: { constraint: { index: "Membership_userId_fkey" } } },
    });
    expect(isMembershipUserForeignKeyViolation(err)).toBe(true);
  });

  it("does not misclassify a different FK constraint on the same model", () => {
    const err = realP2003({
      modelName: "Membership",
      driverAdapterError: { cause: { constraint: { index: "Membership_organizationId_fkey" } } },
    });
    expect(isMembershipUserForeignKeyViolation(err)).toBe(false);
  });

  it("does not misclassify a P2003 on a different model entirely", () => {
    const err = realP2003({
      modelName: "Subscription",
      driverAdapterError: { cause: { constraint: { index: "Subscription_organizationId_fkey" } } },
    });
    expect(isMembershipUserForeignKeyViolation(err)).toBe(false);
  });

  it("does not misclassify a P2002 (duplicate), even on Membership", () => {
    const err = new Prisma.PrismaClientKnownRequestError("mock unique violation", {
      code: "P2002",
      clientVersion: "test",
      meta: { modelName: "Membership", target: ["userId", "organizationId"] },
    });
    expect(isMembershipUserForeignKeyViolation(err)).toBe(false);
  });

  it("does not misclassify a malformed/missing meta shape", () => {
    expect(isMembershipUserForeignKeyViolation(realP2003({}))).toBe(false);
    expect(
      isMembershipUserForeignKeyViolation(
        new Prisma.PrismaClientKnownRequestError("no meta", { code: "P2003", clientVersion: "test" }),
      ),
    ).toBe(false);
  });

  it("never classifies a non-Prisma error as a Membership FK violation", () => {
    expect(isMembershipUserForeignKeyViolation(new Error("some other failure"))).toBe(false);
    expect(isMembershipUserForeignKeyViolation("a string")).toBe(false);
    expect(isMembershipUserForeignKeyViolation(null)).toBe(false);
    expect(isMembershipUserForeignKeyViolation(undefined)).toBe(false);
  });
});
