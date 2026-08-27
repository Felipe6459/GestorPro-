import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin Users Explorer loading state — the deferred half of
 * "remaining Platform Admin loading-state gaps" (secondary tier).
 * platform-admin-loading-completeness.test.ts (the primary-tier PR) is
 * its own historical snapshot documenting that Users was deliberately
 * excluded at that time — it stays exactly as written, never
 * retroactively expanded (same discipline route-loading-adoption-
 * contract.test.ts itself already established for its own past scope).
 * This file instead proves the completeness of this later, independent
 * addition: the new Users loading.tsx itself, and that the historical
 * contract's own Users prohibition has been narrowly, deliberately
 * lifted — and nothing else in that file changed.
 */

const USERS_LOADING_FILE = "src/app/(platform-admin)/platform-admin/users/loading.tsx";
const ROUTE_LOADING_CONTRACT_FILE = "test/unit/route-loading-adoption-contract.test.ts";

const ALLOWED_IMPORT_SPECIFIERS = new Set([
  "@/components/ui/skeleton",
  "@/components/ui/list-page-skeleton",
  "@/components/ui/page-loading",
]);

describe("Platform Admin Users loading state", () => {
  it("the Users loading.tsx file now exists", () => {
    expect(existsSync(USERS_LOADING_FILE)).toBe(true);
  });

  it("no route-group-root loading.tsx was added (would blanket every sibling route)", () => {
    expect(existsSync("src/app/(platform-admin)/loading.tsx")).toBe(false);
  });

  it("has a default export and no client/server directive", () => {
    const source = readFileSync(USERS_LOADING_FILE, "utf-8");
    expect(source).toMatch(/export default function \w+/);
    expect(source).not.toMatch(/"use client"/);
    expect(source).not.toMatch(/"use server"/);
  });

  it("has no hooks, effects, fetch, Prisma, auth/tenant/query, or Server Action import", () => {
    const source = readFileSync(USERS_LOADING_FILE, "utf-8");
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(source).not.toMatch(/useEffect|useState/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/from ["']@\/lib\/prisma["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/current-user["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/current-portal-user["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/platform-admin\/authorization["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/platform-admin\/queries\//);
    expect(source).not.toMatch(/actions["']/);
  });

  it("renders exactly one RouteLoadingAnnouncement", () => {
    const source = readFileSync(USERS_LOADING_FILE, "utf-8");
    const occurrences = (source.match(/<RouteLoadingAnnouncement\b/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("imports its shared skeleton pieces only from an established, safe surface", () => {
    const source = readFileSync(USERS_LOADING_FILE, "utf-8");
    const importLines = source.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      const fromMatch = line.match(/from\s+["']([^"']+)["']/);
      expect(fromMatch, `could not parse import line "${line}"`).not.toBeNull();
      const specifier = fromMatch![1];
      expect(ALLOWED_IMPORT_SPECIFIERS.has(specifier), `unexpected import "${specifier}"`).toBe(true);
    }
  });

  it("reuses the established ListPageSkeleton primitive, mirroring the Organizations list pattern — no new loading primitive introduced", () => {
    const source = readFileSync(USERS_LOADING_FILE, "utf-8");
    expect(source).toMatch(/<ListPageSkeleton\b/);
  });
});

describe("the historical route-loading-adoption-contract.test.ts — narrowly, deliberately updated", () => {
  const contractSource = readFileSync(ROUTE_LOADING_CONTRACT_FILE, "utf-8");

  it("no longer forbids Users' own loading.tsx", () => {
    expect(contractSource).not.toContain('"src/app/(platform-admin)/platform-admin/users/loading.tsx"');
  });

  it("still forbids the Platform Admin route-group-root loading.tsx", () => {
    expect(contractSource).toContain('"src/app/(platform-admin)/loading.tsx"');
  });

  it("still forbids every auth-flow loading.tsx, unchanged", () => {
    for (const path of [
      "src/app/(auth)/login/loading.tsx",
      "src/app/(auth)/signup/loading.tsx",
      "src/app/(auth)/forgot-password/loading.tsx",
      "src/app/(auth)/reset-password/loading.tsx",
    ]) {
      expect(contractSource).toContain(`"${path}"`);
    }
  });

  it("still forbids every creation-form and [id]-detail loading.tsx this historical task's own scope excluded, unchanged", () => {
    for (const path of [
      "src/app/(dashboard)/clients/new/loading.tsx",
      "src/app/(dashboard)/projects/new/loading.tsx",
      "src/app/(dashboard)/tasks/new/loading.tsx",
      "src/app/(dashboard)/invoices/new/loading.tsx",
      "src/app/(dashboard)/invoices/[id]/duplicate/loading.tsx",
      "src/app/(dashboard)/invoices/[id]/loading.tsx",
      "src/app/(dashboard)/clients/[id]/loading.tsx",
      "src/app/(dashboard)/projects/[id]/loading.tsx",
      "src/app/(dashboard)/tasks/[id]/loading.tsx",
      "src/app/portal/(app)/invoices/[id]/loading.tsx",
      "src/app/portal/(app)/projects/[id]/loading.tsx",
    ]) {
      expect(contractSource).toContain(`"${path}"`);
    }
  });

  it("still forbids the dashboard and portal route-group roots, unchanged", () => {
    expect(contractSource).toContain('"src/app/(dashboard)/loading.tsx"');
    expect(contractSource).toContain('"src/app/portal/(app)/loading.tsx"');
  });

  it("the historical INTENDED_NEW_LOADING_FILES list is completely untouched (still exactly 10 entries)", () => {
    const match = contractSource.match(/const INTENDED_NEW_LOADING_FILES = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const entryCount = (match![1].match(/"[^"]+"/g) ?? []).length;
    expect(entryCount).toBe(10);
  });

  it("FORBIDDEN_NEW_LOADING_FILES has exactly one fewer entry than before (19 -> 18) — only the Users removal, nothing else", () => {
    const match = contractSource.match(/const FORBIDDEN_NEW_LOADING_FILES = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const entryCount = (match![1].match(/"[^"]+"/g) ?? []).length;
    expect(entryCount).toBe(18);
  });
});
