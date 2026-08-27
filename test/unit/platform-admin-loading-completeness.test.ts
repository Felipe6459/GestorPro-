import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin loading-state completeness, primary tier (design
 * investigation: remaining Platform Admin loading-state gaps). A
 * deliberately separate, new contract file rather than an expansion of
 * route-loading-adoption-contract.test.ts — that file is a historical
 * snapshot of one specific past PR's own scope ("Product UI/UX PR 4,
 * finding F5") and stays byte-identical here; this file instead proves
 * the completeness of this later, independent initiative.
 *
 * Scope: Dashboard and Observability gain a real loading.tsx for the
 * first time; Organizations/Organization Detail/Configuration gain a
 * RouteLoadingAnnouncement inside their own already-existing skeleton.
 * Users is deliberately excluded — its own loading-state/contract
 * decision is a separate, deferred task; this file also proves that
 * exclusion held.
 */

const PLATFORM_ADMIN_LOADING_FILES = [
  "src/app/(platform-admin)/platform-admin/loading.tsx",
  "src/app/(platform-admin)/platform-admin/observability/loading.tsx",
  "src/app/(platform-admin)/platform-admin/organizations/loading.tsx",
  "src/app/(platform-admin)/platform-admin/organizations/[id]/loading.tsx",
  "src/app/(platform-admin)/platform-admin/configuration/loading.tsx",
];

const ALLOWED_IMPORT_SPECIFIERS = new Set([
  "@/components/ui/skeleton",
  "@/components/ui/list-page-skeleton",
  "@/components/ui/page-loading",
]);

describe("Platform Admin loading-state completeness — exactly the intended files exist", () => {
  it.each(PLATFORM_ADMIN_LOADING_FILES)("%s exists", (path) => {
    expect(existsSync(path), `expected ${path} to exist`).toBe(true);
  });

  it("Users' own loading.tsx does NOT exist — deliberately deferred to a separate task", () => {
    expect(existsSync("src/app/(platform-admin)/platform-admin/users/loading.tsx")).toBe(false);
  });

  it("no route-group-root loading.tsx was added (would blanket every sibling route, including Users)", () => {
    expect(existsSync("src/app/(platform-admin)/loading.tsx")).toBe(false);
  });
});

describe("every Platform Admin loading file is a pure, server-renderable presentation file", () => {
  it.each(PLATFORM_ADMIN_LOADING_FILES)("%s has a default export and no client/server directive", (path) => {
    const source = readFileSync(path, "utf-8");
    expect(source).toMatch(/export default function \w+/);
    expect(source).not.toMatch(/"use client"/);
    expect(source).not.toMatch(/"use server"/);
  });

  it.each(PLATFORM_ADMIN_LOADING_FILES)(
    "%s has no hooks, effects, fetch, Prisma, auth/tenant/query, or Server Action import",
    (path) => {
      const source = readFileSync(path, "utf-8");
      expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
      expect(source).not.toMatch(/useEffect|useState/);
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).not.toMatch(/from ["']@\/lib\/prisma["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/current-user["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/current-portal-user["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/platform-admin\/authorization["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/platform-admin\/queries\//);
      expect(source).not.toMatch(/actions["']/);
    },
  );

  it.each(PLATFORM_ADMIN_LOADING_FILES)("%s renders exactly one RouteLoadingAnnouncement", (path) => {
    const source = readFileSync(path, "utf-8");
    const occurrences = (source.match(/<RouteLoadingAnnouncement\b/g) ?? []).length;
    expect(occurrences, `${path}: expected exactly one RouteLoadingAnnouncement`).toBe(1);
  });

  it.each(PLATFORM_ADMIN_LOADING_FILES)("%s imports its shared skeleton pieces only from an established, safe surface", (path) => {
    const source = readFileSync(path, "utf-8");
    const importLines = source.match(/^import .+$/gm) ?? [];
    for (const line of importLines) {
      const fromMatch = line.match(/from\s+["']([^"']+)["']/);
      expect(fromMatch, `${path}: could not parse import line "${line}"`).not.toBeNull();
      const specifier = fromMatch![1];
      expect(ALLOWED_IMPORT_SPECIFIERS.has(specifier), `${path}: unexpected import "${specifier}"`).toBe(true);
    }
  });
});

describe("the historical route-loading-adoption-contract.test.ts remains untouched by this PR", () => {
  const contractSource = readFileSync("test/unit/route-loading-adoption-contract.test.ts", "utf-8");

  it("Users' loading.tsx is still explicitly named in FORBIDDEN_NEW_LOADING_FILES", () => {
    expect(contractSource).toContain('"src/app/(platform-admin)/platform-admin/users/loading.tsx"');
  });

  it("the route-group-root loading.tsx is still explicitly named in FORBIDDEN_NEW_LOADING_FILES", () => {
    expect(contractSource).toContain('"src/app/(platform-admin)/loading.tsx"');
  });
});
