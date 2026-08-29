import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Design System Phase 1 (foundation tokens). This suite exercises
// src/app/globals.css as plain text — there is no component under test
// yet, since nothing in src/ consumes these tokens in this PR (see the
// PR description). The assertions below are deliberately narrow: they
// check that specific variable declarations exist with the expected
// value, not a snapshot of the whole file's formatting, so future
// additive changes to this file (Phase 2+) won't spuriously fail this
// suite unless they touch one of the specific guarantees below.
const CSS = readFileSync(
  join(__dirname, "../../src/app/globals.css"),
  "utf-8",
);

// A declaration line looks like `  --name: value;` (single or
// multi-line values are normalized away for the tokens this suite
// checks, since none of them span multiple lines).
function declaredValue(varName: string): string | undefined {
  const match = CSS.match(
    new RegExp(`--${varName}\\s*:\\s*([^;]+);`),
  );
  return match?.[1]?.trim();
}

describe("design system foundation tokens — src/app/globals.css", () => {
  it("keeps the existing legacy tokens byte-identical (Phase 1 must not restyle the brand)", () => {
    expect(declaredValue("background")).toBe("#ffffff");
    expect(declaredValue("foreground")).toBe("#171717");
    expect(declaredValue("accent")).toBe("#2E2A6B");
    expect(declaredValue("accent-hover")).toBe("#221E52");
  });

  it("declares every required semantic surface/text/border/brand/focus/semantic token", () => {
    const required = [
      "surface",
      "surface-recessed",
      "surface-elevated",
      "surface-muted",
      "text-primary",
      "text-secondary",
      "text-muted",
      "text-inverse",
      "border-subtle",
      "border-default",
      "border-strong",
      "accent-active",
      "accent-subtle",
      "accent-foreground",
      "focus-ring",
      "success",
      "success-subtle",
      "warning",
      "warning-subtle",
      "danger",
      "danger-subtle",
      "info",
      "info-subtle",
      "selected",
      "hover",
      "disabled",
    ];
    for (const name of required) {
      expect(declaredValue(name), `expected --${name} to be declared`).toBeDefined();
    }
  });

  it("resolves the documented legacy aliases exactly as intended", () => {
    expect(declaredValue("surface")).toBe("var(--background)");
    expect(declaredValue("surface-elevated")).toBe("var(--background)");
    expect(declaredValue("text-primary")).toBe("var(--foreground)");
    expect(declaredValue("selected")).toBe("var(--accent-subtle)");
  });

  it("sets --focus-ring to Tailwind's `black`, so a future wire-up of focus-visible:ring-black is a zero-diff swap", () => {
    expect(declaredValue("focus-ring")).toBe("#000000");
  });

  it("mirrors the color tokens (not the INTERACTIVE tokens) into @theme inline for future Tailwind utility generation", () => {
    const themeBlockMatch = CSS.match(/@theme inline \{([\s\S]*?)\n\}/);
    expect(themeBlockMatch).toBeTruthy();
    const themeBlock = themeBlockMatch![1];

    for (const mirrored of [
      "surface",
      "surface-recessed",
      "surface-elevated",
      "surface-muted",
      "text-primary",
      "text-secondary",
      "text-muted",
      "text-inverse",
      "border-subtle",
      "border-default",
      "border-strong",
      "accent-active",
      "accent-subtle",
      "accent-foreground",
      "focus-ring",
      "success",
      "success-subtle",
      "warning",
      "warning-subtle",
      "danger",
      "danger-subtle",
      "info",
      "info-subtle",
    ]) {
      expect(
        themeBlock,
        `expected @theme inline to mirror --color-${mirrored}`,
      ).toMatch(new RegExp(`--color-${mirrored}\\s*:\\s*var\\(--${mirrored}\\)`));
    }

    // INTERACTIVE tokens are intentionally NOT mirrored (see the code
    // comment) — a bare `bg-hover`/`bg-disabled` Tailwind utility would
    // read confusingly next to the real hover:/disabled: variants.
    expect(themeBlock).not.toMatch(/--color-selected\s*:/);
    expect(themeBlock).not.toMatch(/--color-hover\s*:/);
    expect(themeBlock).not.toMatch(/--color-disabled\s*:/);
  });

  it("never redeclares Tailwind's own reserved --radius-*/--shadow-*/--spacing theme keys (would silently restyle every existing rounded-*/shadow-* utility app-wide)", () => {
    for (const reserved of [
      "radius-sm",
      "radius-md",
      "radius-lg",
      "radius-xl",
      "shadow-sm",
      "shadow-md",
      "shadow-lg",
      "shadow-xl",
      "spacing",
    ]) {
      expect(
        declaredValue(reserved),
        `--${reserved} must not be redeclared — it collides with Tailwind's own default theme`,
      ).toBeUndefined();
    }
  });

  it("introduces the new radius/shadow foundation only under the collision-safe --aqenra- prefix", () => {
    expect(declaredValue("aqenra-radius-sm")).toBe("6px");
    expect(declaredValue("aqenra-radius-md")).toBe("8px");
    expect(declaredValue("aqenra-radius-lg")).toBe("12px");
    expect(declaredValue("aqenra-radius-full")).toBe("999px");
    expect(CSS).toMatch(/--aqenra-shadow-sm\s*:/);
    expect(CSS).toMatch(/--aqenra-shadow-md\s*:/);
    expect(CSS).toMatch(/--aqenra-shadow-lg\s*:/);
  });

  it("introduces no dark-mode behavior: no prefers-color-scheme/data-theme rules, and color-scheme stays light", () => {
    // Tailwind's `dark:` variant is a JSX className prefix, not something
    // that would ever appear in this CSS file, so it isn't checked here —
    // this file's own pre-existing header comment literally contains the
    // substring "dark:" while explaining that no such variants exist,
    // which would make that check a guaranteed false positive.
    expect(CSS).not.toMatch(/prefers-color-scheme/);
    expect(CSS).not.toMatch(/data-theme/);
    expect(declaredValue("color-scheme")).toBeUndefined(); // it's a plain property, not a custom property
    expect(CSS).toMatch(/color-scheme:\s*light;/);
  });
});
