import { describe, expect, it } from "vitest";
import {
  computeNextAutomaticTransitionMs,
  extractCookieValue,
  parseThemeCookie,
  parseThemeMode,
  resolveAutomaticFromDate,
  resolveTheme,
  serializeThemeCookie,
} from "@/lib/theme/resolve";

// Theme Resolver Phase B — pure resolution logic. Every case here is
// driven by an explicit, supplied value (never the real clock or a real
// matchMedia) — see resolve.ts's own header comment for why that's the
// whole point of keeping this module dependency-free.

function localDate(hour: number, minute: number): Date {
  // A fixed, arbitrary calendar date — only the hour/minute matter for
  // every assertion in this file, and using the SAME date throughout
  // keeps the day-rollover assertions below unambiguous about which
  // calendar day "tomorrow" means.
  return new Date(2026, 0, 15, hour, minute, 0, 0);
}

describe("parseThemeMode", () => {
  it("accepts each of the four valid modes", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("automatic")).toBe("automatic");
  });

  it("fails closed to the default (system) for anything else", () => {
    for (const bad of ["LIGHT", "Dark", "auto", "", undefined, null, 42, {}, "system; DROP TABLE"]) {
      expect(parseThemeMode(bad), `expected "${String(bad)}" to fall back to system`).toBe("system");
    }
  });
});

describe("parseThemeCookie", () => {
  it("parses every valid mode.resolved combination", () => {
    expect(parseThemeCookie("light.light")).toEqual({ mode: "light", resolved: "light" });
    expect(parseThemeCookie("dark.dark")).toEqual({ mode: "dark", resolved: "dark" });
    expect(parseThemeCookie("system.dark")).toEqual({ mode: "system", resolved: "dark" });
    expect(parseThemeCookie("automatic.light")).toEqual({ mode: "automatic", resolved: "light" });
  });

  it("returns null (never throws) for missing/malformed/unknown values", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "light",
      "light.light.light",
      "LIGHT.light",
      "light.LIGHT",
      "automatic.blue",
      "banana.light",
      "light.",
      ".light",
      "system.dark; document.cookie='x'",
    ]) {
      expect(parseThemeCookie(bad), `expected "${String(bad)}" to parse to null`).toBeNull();
    }
  });
});

describe("serializeThemeCookie", () => {
  it("round-trips through parseThemeCookie for every combination", () => {
    for (const mode of ["light", "dark", "system", "automatic"] as const) {
      for (const resolved of ["light", "dark"] as const) {
        const serialized = serializeThemeCookie(mode, resolved);
        expect(parseThemeCookie(serialized)).toEqual({ mode, resolved });
      }
    }
  });
});

describe("extractCookieValue", () => {
  it("finds the named cookie among several", () => {
    expect(extractCookieValue("a=1; aqenra_theme=system.dark; b=2", "aqenra_theme")).toBe("system.dark");
  });

  it("finds the named cookie at the very start of the header", () => {
    expect(extractCookieValue("aqenra_theme=light.light; other=x", "aqenra_theme")).toBe("light.light");
  });

  it("returns null when the cookie is absent", () => {
    expect(extractCookieValue("a=1; b=2", "aqenra_theme")).toBeNull();
  });

  it("returns null for an empty cookie header", () => {
    expect(extractCookieValue("", "aqenra_theme")).toBeNull();
  });

  it("decodes a URI-encoded value", () => {
    expect(extractCookieValue("aqenra_theme=system.dark%3B", "aqenra_theme")).toBe("system.dark;");
  });
});

describe("resolveTheme — explicit Light/Dark", () => {
  it("light always resolves to light, regardless of OS preference or time", () => {
    expect(resolveTheme("light", { prefersDark: true, now: localDate(2, 0) })).toBe("light");
    expect(resolveTheme("light", { prefersDark: false, now: localDate(23, 0) })).toBe("light");
  });

  it("dark always resolves to dark, regardless of OS preference or time", () => {
    expect(resolveTheme("dark", { prefersDark: false, now: localDate(12, 0) })).toBe("dark");
    expect(resolveTheme("dark", { prefersDark: true, now: localDate(8, 0) })).toBe("dark");
  });
});

describe("resolveTheme — System", () => {
  it("follows the supplied prefersDark boolean exactly", () => {
    expect(resolveTheme("system", { prefersDark: true, now: localDate(12, 0) })).toBe("dark");
    expect(resolveTheme("system", { prefersDark: false, now: localDate(12, 0) })).toBe("light");
  });
});

describe("resolveAutomaticFromDate / resolveTheme — Automatic boundaries", () => {
  it("06:59 -> dark", () => {
    expect(resolveAutomaticFromDate(localDate(6, 59))).toBe("dark");
  });
  it("07:00 -> light (inclusive)", () => {
    expect(resolveAutomaticFromDate(localDate(7, 0))).toBe("light");
  });
  it("18:59 -> light", () => {
    expect(resolveAutomaticFromDate(localDate(18, 59))).toBe("light");
  });
  it("19:00 -> dark (inclusive)", () => {
    expect(resolveAutomaticFromDate(localDate(19, 0))).toBe("dark");
  });
  it("midday and midnight sanity", () => {
    expect(resolveAutomaticFromDate(localDate(12, 0))).toBe("light");
    expect(resolveAutomaticFromDate(localDate(0, 0))).toBe("dark");
    expect(resolveAutomaticFromDate(localDate(23, 59))).toBe("dark");
  });

  it("resolveTheme(\"automatic\", ...) delegates to the same boundary logic, ignoring prefersDark entirely", () => {
    expect(resolveTheme("automatic", { prefersDark: true, now: localDate(6, 59) })).toBe("dark");
    expect(resolveTheme("automatic", { prefersDark: false, now: localDate(7, 0) })).toBe("light");
  });
});

describe("computeNextAutomaticTransitionMs", () => {
  it("before 07:00 -> today's 07:00", () => {
    const now = localDate(3, 0);
    const ms = computeNextAutomaticTransitionMs(now);
    const expected = new Date(now.getTime() + ms);
    expect(expected.getDate()).toBe(now.getDate());
    expect(expected.getHours()).toBe(7);
    expect(expected.getMinutes()).toBe(0);
  });

  it("during the day (07:00-19:00) -> today's 19:00", () => {
    const now = localDate(12, 30);
    const ms = computeNextAutomaticTransitionMs(now);
    const expected = new Date(now.getTime() + ms);
    expect(expected.getDate()).toBe(now.getDate());
    expect(expected.getHours()).toBe(19);
    expect(expected.getMinutes()).toBe(0);
  });

  it("after 19:00 -> tomorrow's 07:00 (day rollover)", () => {
    const now = localDate(20, 0);
    const ms = computeNextAutomaticTransitionMs(now);
    const expected = new Date(now.getTime() + ms);
    expect(expected.getDate()).toBe(now.getDate() + 1);
    expect(expected.getHours()).toBe(7);
    expect(expected.getMinutes()).toBe(0);
  });

  it("exactly at 07:00:00 -> schedules 19:00 the same day, not another immediate 07:00", () => {
    const now = localDate(7, 0);
    const ms = computeNextAutomaticTransitionMs(now);
    const expected = new Date(now.getTime() + ms);
    expect(expected.getHours()).toBe(19);
    expect(ms).toBeGreaterThan(0);
  });

  it("exactly at 19:00:00 -> schedules tomorrow's 07:00, not another immediate 19:00", () => {
    const now = localDate(19, 0);
    const ms = computeNextAutomaticTransitionMs(now);
    const expected = new Date(now.getTime() + ms);
    expect(expected.getDate()).toBe(now.getDate() + 1);
    expect(expected.getHours()).toBe(7);
    expect(ms).toBeGreaterThan(0);
  });

  it("returned ms is always strictly positive (never fires immediately or in the past)", () => {
    for (let hour = 0; hour < 24; hour++) {
      const ms = computeNextAutomaticTransitionMs(localDate(hour, 0));
      expect(ms, `hour ${hour}`).toBeGreaterThan(0);
    }
  });
});
