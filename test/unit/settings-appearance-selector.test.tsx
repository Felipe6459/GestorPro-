import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSelector } from "@/components/settings/appearance-selector";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/toast/toast-provider";

// AppearanceSelector imports the real Server Action, whose own write
// helper (src/lib/theme/persist-theme-mode.ts) legitimately carries
// `import "server-only"` (it's a DB-writing module, correctly never
// meant for a client bundle) — that marker throws outside Next's own
// build, exactly like every other "server-only" module this repo's
// existing integration-test mocks already work around (see
// test/integration/setup-mocks.ts's own `vi.mock("server-only", ...)`.
// A plain Vitest unit test has no Next.js build step at all, so the
// Server Action itself is mocked here — never invoked in this file
// (this test only imports the module for its render), the same "mock
// only the request-context/server-only-marker-bound API, run
// everything else for real" discipline the integration suite already
// establishes.
vi.mock("@/app/(dashboard)/theme-actions", () => ({
  updateThemeModeAction: vi.fn(),
}));

/**
 * Aqenra Phase D. A genuine behavior-level render test (real render
 * pipeline, `react-dom/server`, no jsdom/testing-library — see
 * invoice-form-radio-focus.test.tsx's own established precedent) for the
 * STATIC shape only. `AppearanceSelector` reads `useTheme()`, which
 * throws outside a `<ThemeProvider>` — wrapped here exactly the way the
 * real (dashboard) layout tree already wraps it (via the root layout).
 *
 * `ThemeProvider`'s own `useSyncExternalStore` always uses its fixed
 * server snapshot (mode "system", resolvedTheme "light") under
 * `renderToStaticMarkup` (a pure server-style render, never hydrated) —
 * this test therefore proves the STATIC baseline shape (four real radio
 * options, System selected by default, the resolved hint reflecting the
 * server snapshot), not live interactive selection. Selecting an option,
 * `setMode()`/persistence wiring, and resolved-theme changes are
 * DOM/event-dependent behavior — covered by
 * test/e2e/appearance-settings.spec.ts instead, the same "interactive
 * behavior belongs in Playwright" split this repo already establishes.
 */
function renderSelector() {
  return renderToStaticMarkup(
    <ToastProvider>
      <ThemeProvider>
        <AppearanceSelector />
      </ThemeProvider>
    </ToastProvider>,
  );
}

describe("AppearanceSelector — real render, static shape", () => {
  it("renders exactly four real <input type=\"radio\"> elements, all sharing one group name", () => {
    const html = renderSelector();
    const radioMatches = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radioMatches).toHaveLength(4);
    for (const radio of radioMatches) {
      expect(radio).toMatch(/name="aqenra-theme-mode"/);
    }
  });

  it("each of the four modes has its own radio value and visible title/description text", () => {
    const html = renderSelector();
    for (const mode of ["light", "dark", "system", "automatic"]) {
      expect(html).toMatch(new RegExp(`value="${mode}"`));
    }
    expect(html).toMatch(/Always use the light theme\./);
    expect(html).toMatch(/Always use the dark theme\./);
    // React escapes the apostrophe as &#x27; in static markup.
    expect(html).toMatch(/Follow your device&#x27;s appearance setting\./);
    expect(html).toMatch(
      /Uses Light from 07:00 to 19:00 and Dark outside those hours, based on your device&#x27;s local time\./,
    );
  });

  it("is wrapped in a real <fieldset> with an accessible (screen-reader) legend, never a fake button-based group", () => {
    const html = renderSelector();
    expect(html).toMatch(/<fieldset/);
    expect(html).toMatch(/<legend[^>]*>Appearance<\/legend>/);
    const fieldsetStart = html.indexOf("<fieldset");
    const fieldsetEnd = html.lastIndexOf("</fieldset>");
    const fieldsetBlock = html.slice(fieldsetStart, fieldsetEnd);
    expect(fieldsetBlock).not.toMatch(/<button/);
  });

  it("each radio's accessible NAME is scoped to only its title (aria-labelledby), separate from its DESCRIPTION (aria-describedby) — the wrapping <label>'s full text (title + description) must never become one run-on accessible name", () => {
    const html = renderSelector();
    const radioTags = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    for (const mode of ["light", "dark", "system", "automatic"]) {
      const tag = radioTags.find((t) => t.includes(`value="${mode}"`));
      expect(tag).toBeDefined();
      expect(tag).toMatch(new RegExp(`aria-labelledby="appearance-${mode}-title"`));
      expect(html).toMatch(new RegExp(`id="appearance-${mode}-title"`));
    }
  });

  it("each radio is associated with its own description via aria-describedby", () => {
    const html = renderSelector();
    const radioTags = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    for (const mode of ["light", "dark", "system", "automatic"]) {
      const tag = radioTags.find((t) => t.includes(`value="${mode}"`));
      expect(tag).toBeDefined();
      expect(tag).toMatch(new RegExp(`aria-describedby="appearance-${mode}-description"`));
      expect(html).toMatch(new RegExp(`id="appearance-${mode}-description"`));
    }
  });

  it("under ThemeProvider's fixed server snapshot (system/light), the System option is checked and shows the resolved-theme hint", () => {
    const html = renderSelector();
    const systemIndex = html.indexOf('value="system"');
    const systemTagEnd = html.indexOf(">", systemIndex);
    const systemTag = html.slice(html.lastIndexOf("<input", systemIndex), systemTagEnd);
    expect(systemTag).toMatch(/checked=""/);
    expect(html).toMatch(/Currently using Light/);
  });

  it("no other option is checked", () => {
    const html = renderSelector();
    for (const mode of ["light", "dark", "automatic"]) {
      const index = html.indexOf(`value="${mode}"`);
      const tagEnd = html.indexOf(">", index);
      const tag = html.slice(html.lastIndexOf("<input", index), tagEnd);
      expect(tag).not.toMatch(/checked=""/);
    }
  });
});

describe("appearance-selector.tsx — source contract: identity-agnostic provider, real wiring, no client-supplied identity", () => {
  const source = readFileSync("src/components/settings/appearance-selector.tsx", "utf-8");

  it("selecting an option calls both setMode() and the coordinator's request() — never a second, page-local persistence implementation", () => {
    expect(source).toMatch(/setMode\(nextMode\)/);
    expect(source).toMatch(/coordinator\.request\(nextMode\)/);
  });

  it("uses the shared latest-wins coordinator factory, never a bespoke race-handling implementation", () => {
    expect(source).toMatch(/from "@\/lib\/theme\/persist-latest-mode-coordinator"/);
    expect(source).toMatch(/createLatestModePersistenceCoordinator/);
  });

  it("calls the real staff persistence Server Action with only the mode — never a userId/organizationId argument", () => {
    expect(source).toMatch(/from "@\/app\/\(dashboard\)\/theme-actions"/);
    expect(source).toMatch(/updateThemeModeAction\(nextMode\)/);
    expect(source).not.toMatch(/userId|organizationId/);
  });

  it("the coordinator is created via a lazy useState initializer, not recreated every render", () => {
    expect(source).toMatch(/useState\(\(\) => createLatestModePersistenceCoordinator/);
  });

  it("never reads document.cookie directly — the only source of current mode is useTheme()", () => {
    expect(source).not.toMatch(/document\.cookie/);
    expect(source).toMatch(/useTheme\(\)/);
  });

  it("regression: the selected-state accent wash is layered separately, never as the label's own background-color replacing bg-surface", () => {
    // The fixed bug: `has-[:checked]:bg-accent-subtle` on the SAME
    // element as `bg-surface` fully replaces it (both target
    // `background-color`), and `--accent-subtle` is intentionally
    // semi-transparent in Dark — so the selected card ended up
    // compositing against a distant, unmigrated light ancestor instead
    // of its own opaque surface. The label must keep `bg-surface`
    // unconditionally, with no `has-[:checked]:bg-*`/`has-[:checked]:bg-accent-subtle`
    // override on it — selection is expressed by a separate `peer-checked`
    // layer instead, which always composites against this label's own
    // opaque background regardless of what ancestor happens to be behind it.
    const labelMatch = source.match(/<label[\s\S]*?className="([^"]*)"/);
    expect(labelMatch).toBeDefined();
    const labelClassName = labelMatch![1];
    expect(labelClassName).toMatch(/\bbg-surface\b/);
    expect(labelClassName).not.toMatch(/has-\[:checked\]:bg-/);

    // The wash itself lives on its own element, gated by `peer-checked`
    // (not `has-[:checked]:bg-accent-subtle` on the label), so it can
    // never stand in as the label's sole background.
    expect(source).toMatch(/peer-checked:opacity-100/);
    expect(source).toMatch(/className="peer sr-only"/);
  });
});

describe("theme-provider.tsx — remains identity-agnostic (Phase D did not couple it to Appearance/Server Actions)", () => {
  it("imports nothing from the Appearance selector, the theme Server Actions, or the persistence coordinator", () => {
    const providerSource = readFileSync("src/components/theme/theme-provider.tsx", "utf-8");
    expect(providerSource).not.toMatch(/appearance-selector|theme-actions|persist-latest-mode-coordinator|persist-theme-mode/);
  });
});
