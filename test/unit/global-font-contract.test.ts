import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Product UI/UX PR 5 (Design Investigation finding F6): `layout.tsx`
 * loads Geist/Geist Mono via `next/font/google` (Next's own built-in,
 * self-hosted, zero-dependency font optimization — no CDN `<link>`, no
 * new package) and correctly exposes `--font-geist-sans`/
 * `--font-geist-mono` as CSS variables on `<html>`, and `globals.css`'s
 * own `@theme inline` block correctly maps `--font-sans`/`--font-mono`
 * to them — but `body`'s own rule hardcoded
 * `font-family: Arial, Helvetica, sans-serif`, so the already-loaded
 * font was never actually rendered anywhere. The fix is the smallest
 * possible correction: `body` now references `var(--font-sans)` first,
 * keeping the exact same fallback stack after it.
 */

describe("globals.css — body renders the already-loaded application font", () => {
  it("body's font-family references var(--font-sans) before the existing fallback stack", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    const bodyBlock = css.slice(css.indexOf("body {"), css.indexOf("}", css.indexOf("body {")));
    expect(bodyBlock).toMatch(/font-family:\s*var\(--font-sans\),\s*Arial,\s*Helvetica,\s*sans-serif;/);
  });

  it("the @theme inline mapping from --font-sans/--font-mono to the loaded Geist variables is unchanged", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    expect(css).toMatch(/--font-sans:\s*var\(--font-geist-sans\);/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\);/);
  });

  it("no external font stylesheet or CDN <link> is referenced anywhere in the app", () => {
    const css = readFileSync("src/app/globals.css", "utf-8");
    expect(css).not.toMatch(/@import\s+url\(/);
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});

describe("layout.tsx — font loading mechanism unchanged (next/font/google, no new dependency)", () => {
  it("still uses next/font/google's Geist/Geist_Mono, with no CDN <link> and no new package", () => {
    const source = readFileSync("src/app/layout.tsx", "utf-8");
    expect(source).toMatch(/from ["']next\/font\/google["']/);
    expect(source).toMatch(/Geist\(/);
    expect(source).toMatch(/Geist_Mono\(/);
    expect(source).not.toMatch(/<link[^>]*fonts\./);
    expect(source).not.toMatch(/"use client"/);
  });

  it("the font CSS variables are applied on <html> via a static className — no hydration-dependent runtime logic", () => {
    const source = readFileSync("src/app/layout.tsx", "utf-8");
    expect(source).toMatch(/className=\{`\$\{geistSans\.variable\}[^`]*`\}/);
    expect(source).not.toMatch(/useEffect|useState/);
  });
});

describe("existing explicit font-mono/font-sans usages are not overridden by this correction", () => {
  it("settings/domain's font-mono subdomain text keeps its own explicit font-family (unaffected by body's rule)", () => {
    const source = readFileSync("src/app/(dashboard)/settings/domain/page.tsx", "utf-8");
    expect(source).toMatch(/className="font-mono[^"]*"/);
  });

  it("the global-search kbd hint keeps its own explicit font-sans override (unaffected by body's rule)", () => {
    const source = readFileSync("src/components/search/global-search.tsx", "utf-8");
    expect(source).toMatch(/\bfont-sans\b/);
  });
});
