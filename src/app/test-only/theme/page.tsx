import { notFound } from "next/navigation";
import { TEST_MODE } from "@/lib/test-mode";
import { ThemeHarness } from "./theme-harness";

/**
 * Theme Resolver Phase B — TEST_MODE-only developer/E2E verification
 * surface (see the theme-architecture spec's own §16: "no hidden
 * Production theme picker", "no undocumented query-parameter
 * backdoors"). There is no real Settings → Appearance page yet — this
 * exists purely so Playwright can exercise all four ThemeMode values
 * deterministically through the real ThemeProvider, the same way
 * src/app/api/e2e-test-storage/[...path]/route.ts stands in for real
 * Storage.
 *
 * Gated on the exact same flag as every other TEST_MODE surface (see
 * src/lib/test-mode.ts) — with TEST_MODE unset (every real build/
 * deployment, including this repo's own Vercel Production, which never
 * sets it — see scripts/security-checks/check-no-test-mode.mjs), this
 * 404s unconditionally before rendering anything, so there is nothing
 * here for a normal Production visit to ever reach.
 *
 * `force-dynamic` is required and deliberate: without it, this page is
 * otherwise eligible for static prerendering (root layout no longer
 * calls a dynamic API — see layout.tsx's own doc comment), which would
 * bake in whatever TEST_MODE value was present at BUILD time forever,
 * ignoring the RUNTIME env TEST_MODE the E2E webServer actually sets
 * (playwright.config.ts's webServer.env, applied only when `next start`
 * runs, never during `npm run build`). Confirmed by hitting exactly
 * this bug once: a manual `npm run build` (no TEST_MODE) statically
 * baked in a permanent 404 for this route, which then 404'd even when
 * the E2E webServer started with TEST_MODE=1 — force-dynamic makes
 * Next.js re-evaluate this page (and therefore the TEST_MODE check)
 * fresh on every request instead.
 */
export const dynamic = "force-dynamic";

export default function ThemeTestOnlyPage() {
  if (!TEST_MODE) {
    notFound();
  }

  return <ThemeHarness />;
}
