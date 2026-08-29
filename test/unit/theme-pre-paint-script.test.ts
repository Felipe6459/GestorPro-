import { describe, expect, it } from "vitest";
import { getThemePrePaintScript } from "@/lib/theme/pre-paint-script";
import { AUTOMATIC_DARK_START_MINUTES, AUTOMATIC_LIGHT_START_MINUTES, THEME_COOKIE_NAME } from "@/lib/theme/types";

// The pre-paint script itself runs before any bundled JS/module has
// loaded (see pre-paint-script.ts's own header comment), so its actual
// runtime behavior (matchMedia/Date/cookie interaction) can only be
// exercised in a real browser — that's covered by the E2E suite, not
// here. This file is a "meta" safety/content audit of the generated
// STRING: it must be valid, parseable JS, it must not contain any
// dangerous pattern, and it must be built only from this module's own
// fixed constants — never from anything request- or cookie-derived.
const script = getThemePrePaintScript();

describe("getThemePrePaintScript — content/safety audit", () => {
  it("is syntactically valid JavaScript (parses without throwing)", () => {
    expect(() => new Function(script)).not.toThrow();
  });

  it("references the real theme cookie name", () => {
    expect(script).toContain(`${THEME_COOKIE_NAME}=`);
  });

  it("bakes in the exact approved Automatic boundary minutes (07:00/19:00)", () => {
    expect(script).toContain(`${AUTOMATIC_LIGHT_START_MINUTES}`);
    expect(script).toContain(`${AUTOMATIC_DARK_START_MINUTES}`);
  });

  it("contains no dangerous sink (eval, Function, innerHTML, document.write, new Function inside the script itself)", () => {
    expect(script).not.toMatch(/\beval\s*\(/);
    expect(script).not.toMatch(/\bnew\s+Function\s*\(/);
    expect(script).not.toMatch(/innerHTML/);
    expect(script).not.toMatch(/document\.write/);
  });

  it("never fetches, logs, or reaches for geolocation/location-derived data", () => {
    expect(script).not.toMatch(/fetch\s*\(/);
    expect(script).not.toMatch(/XMLHttpRequest/);
    expect(script).not.toMatch(/console\./);
    expect(script).not.toMatch(/geolocation/i);
  });

  it("only ever writes the cookie back as mode.resolved — a value straight off its own two hardcoded allowlists, never the raw parsed cookie content", () => {
    // The one place the script writes `document.cookie=`, the right-hand
    // side is built from the local `mode`/`next` variables (both already
    // constrained to a 4-item and 2-item allowlist respectively earlier
    // in the same script) concatenated with fixed literal option strings
    // — never the raw regex-matched cookie substring (`m[1]`/`raw`)
    // reused directly.
    const cookieWriteLine = script.split("\n").find((line) => line.startsWith("document.cookie="));
    expect(cookieWriteLine).toBeDefined();
    expect(cookieWriteLine).not.toMatch(/\braw\b/);
    expect(cookieWriteLine).not.toMatch(/m\[1\]/);
  });

  it("is deterministic (calling it twice produces byte-identical output — no timestamps/randomness baked in)", () => {
    expect(getThemePrePaintScript()).toBe(script);
  });
});
