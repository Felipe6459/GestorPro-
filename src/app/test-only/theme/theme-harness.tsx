"use client";

import { useTheme } from "@/components/theme/theme-provider";
import type { ThemeMode } from "@/lib/theme/types";

const MODES: ThemeMode[] = ["light", "dark", "system", "automatic"];

/**
 * The interactive half of the TEST_MODE-only theme harness — see
 * page.tsx (server component) for the actual TEST_MODE gate. Exposes
 * `useTheme()`'s state/setMode directly, with no styling and no
 * Production-shaped UI, purely so Playwright can drive and assert every
 * ThemeMode deterministically without a real Settings → Appearance page
 * (which doesn't exist yet — see the theme-architecture spec's own
 * phasing). This is not a preview of any future picker design.
 */
export function ThemeHarness() {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <div>
      <p data-testid="theme-harness-mode">{mode}</p>
      <p data-testid="theme-harness-resolved">{resolvedTheme}</p>
      {MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          data-testid={`theme-harness-set-${candidate}`}
          onClick={() => setMode(candidate)}
        >
          {candidate}
        </button>
      ))}
    </div>
  );
}
