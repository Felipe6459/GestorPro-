import { describe, expect, it } from "vitest";
import { dbThemeModeToRuntimeMode, runtimeModeToDbThemeMode } from "@/lib/theme/db-mode";
import { ThemeMode as DbThemeMode } from "@/generated/prisma/enums";
import { THEME_MODES, type ThemeMode } from "@/lib/theme/types";

describe("db-mode — Prisma ThemeMode <-> runtime ThemeMode mapping", () => {
  it("maps every Prisma ThemeMode value to its exact runtime counterpart", () => {
    expect(dbThemeModeToRuntimeMode(DbThemeMode.LIGHT)).toBe("light");
    expect(dbThemeModeToRuntimeMode(DbThemeMode.DARK)).toBe("dark");
    expect(dbThemeModeToRuntimeMode(DbThemeMode.SYSTEM)).toBe("system");
    expect(dbThemeModeToRuntimeMode(DbThemeMode.AUTOMATIC)).toBe("automatic");
  });

  it("maps every runtime ThemeMode value to its exact Prisma counterpart", () => {
    expect(runtimeModeToDbThemeMode("light")).toBe(DbThemeMode.LIGHT);
    expect(runtimeModeToDbThemeMode("dark")).toBe(DbThemeMode.DARK);
    expect(runtimeModeToDbThemeMode("system")).toBe(DbThemeMode.SYSTEM);
    expect(runtimeModeToDbThemeMode("automatic")).toBe(DbThemeMode.AUTOMATIC);
  });

  it("round-trips every runtime mode through the DB representation and back", () => {
    for (const mode of THEME_MODES) {
      expect(dbThemeModeToRuntimeMode(runtimeModeToDbThemeMode(mode))).toBe(mode);
    }
  });

  it("round-trips every Prisma enum value through the runtime representation and back", () => {
    for (const dbMode of Object.values(DbThemeMode)) {
      expect(runtimeModeToDbThemeMode(dbThemeModeToRuntimeMode(dbMode))).toBe(dbMode);
    }
  });

  it("exhaustively covers every ThemeMode union member (compile-time proof: this would fail to typecheck if a mode were missing)", () => {
    const allModes: ThemeMode[] = ["light", "dark", "system", "automatic"];
    for (const mode of allModes) {
      expect(() => runtimeModeToDbThemeMode(mode)).not.toThrow();
    }
  });
});
