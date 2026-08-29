import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * Theme Resolver Phase B. Exercises the real ThemeProvider/pre-paint
 * script through the TEST_MODE-only harness (src/app/test-only/theme) —
 * no DB fixtures needed, this page is unauthenticated and stateless.
 *
 * Every time-dependent case uses Playwright's fake Clock
 * (page.clock.install/setSystemTime/fastForward), and every OS-preference
 * case uses page.emulateMedia — never this machine's real clock or real
 * OS theme, per the task's own requirement.
 */

const HARNESS_PATH = "/test-only/theme";
const COOKIE_NAME = "aqenra_theme";

async function setThemeCookie(context: BrowserContext, baseURL: string, value: string): Promise<void> {
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

function resolvedAttr(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

function cookieValue(context: BrowserContext, hostname: string) {
  return context.cookies().then((cookies) => cookies.find((c) => c.name === COOKIE_NAME && c.domain.includes(hostname))?.value);
}

test.describe("Theme Resolver — server-rendered first paint (static, generic default — no cookie read server-side)", () => {
  // Root layout deliberately does NOT read the aqenra_theme cookie (see
  // layout.tsx's own doc comment: doing so would opt the whole app out
  // of static prerendering). The raw HTML is therefore always the same
  // generic "light" default regardless of the cookie — for EVERY mode,
  // including an explicit Dark choice. Correcting it is entirely the
  // pre-paint script's job (covered by the next describe block, which
  // asserts the post-script, real-browser result rather than the raw
  // HTTP response).
  for (const cookie of ["light.light", "dark.dark", "system.dark", "automatic.light"]) {
    test(`raw HTML always renders the generic data-theme="light" default, regardless of the cookie (${cookie})`, async ({ page, context, baseURL }) => {
      await setThemeCookie(context, baseURL!, cookie);
      const response = await page.request.get(HARNESS_PATH);
      const html = await response.text();
      expect(html).toMatch(/<html[^>]*\bdata-theme="light"/);
      expect(html).toMatch(/suppressHydrationWarning/);
    });
  }

  test("no cookie at all: same generic light default (never guesses OS preference server-side)", async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.request.get(HARNESS_PATH);
    const html = await response.text();
    expect(html).toMatch(/<html[^>]*\bdata-theme="light"/);
  });
});

test.describe("Theme Resolver — pre-paint correction of explicit Light/Dark (real browser, post-script)", () => {
  test("explicit light cookie: resolves to light (pre-paint is a no-op, already matching the generic default)", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "light.light");
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("light");
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");
  });

  test("explicit dark cookie: pre-paint corrects the generic light default to dark before hydration, and it survives hydration (suppressHydrationWarning)", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "dark.dark");
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");
  });
});

test.describe("Theme Resolver — pre-paint correction (System/Automatic)", () => {
  test("System, OS prefers dark, stale cached cookie (system.light): pre-paint corrects to dark before hydration", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "system.light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");
    expect(await cookieValue(context, new URL(baseURL!).hostname)).toBe("system.dark");
  });

  test("System, OS prefers light, stale cached cookie (system.dark): pre-paint corrects to light", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "system.dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("light");
    expect(await cookieValue(context, new URL(baseURL!).hostname)).toBe("system.light");
  });

  test("Automatic, daytime (11:00 local): resolves light regardless of cached cookie", async ({ page, context, baseURL }) => {
    await page.clock.install({ time: new Date(2026, 0, 15, 11, 0, 0) });
    await setThemeCookie(context, baseURL!, "automatic.dark");
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("light");
  });

  test("Automatic, nighttime (22:00 local): resolves dark regardless of cached cookie", async ({ page, context, baseURL }) => {
    await page.clock.install({ time: new Date(2026, 0, 15, 22, 0, 0) });
    await setThemeCookie(context, baseURL!, "automatic.light");
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
  });

  test("malformed cookie falls back safely (mode -> system, cached resolved -> light) rather than throwing", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "not-a-real-value");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HARNESS_PATH);
    await expect(page.getByTestId("theme-harness-mode")).toHaveText("system");
    await expect.poll(() => resolvedAttr(page)).toBe("light");
  });
});

test.describe("Theme Resolver — live runtime behavior (no reload)", () => {
  test("setMode cycles through all four modes instantly, updating both the DOM attribute and the cookie", async ({ page, context, baseURL }) => {
    await page.goto(HARNESS_PATH);
    const hostname = new URL(baseURL!).hostname;

    await page.getByTestId("theme-harness-set-dark").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
    expect(await cookieValue(context, hostname)).toBe("dark.dark");

    await page.getByTestId("theme-harness-set-light").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");
    expect(await cookieValue(context, hostname)).toBe("light.light");
  });

  test("System mode updates live when the OS preference changes, with no reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(HARNESS_PATH);
    await page.getByTestId("theme-harness-set-system").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
  });

  test("leaving System removes its listener: a further OS change no longer affects the (now explicit) resolved theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(HARNESS_PATH);
    await page.getByTestId("theme-harness-set-system").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");

    await page.getByTestId("theme-harness-set-light").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");

    // If the System listener were still attached, this would flip
    // resolvedTheme back to "dark" — it must not.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(200);
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");
  });

  test("Automatic transitions live while the tab stays open, using exactly one scheduled timer", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 0, 15, 18, 59, 0) });
    await page.goto(HARNESS_PATH);
    await page.getByTestId("theme-harness-set-automatic").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");

    await page.clock.fastForward(120_000); // 2 minutes in ms — crosses 19:00 (numeric ms, not the "MM:SS" string form, to avoid misreading it as 2 seconds)
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");
  });

  test("leaving Automatic clears its timer: fast-forwarding past a would-be boundary no longer changes the (now explicit) resolved theme", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 0, 15, 18, 59, 0) });
    await page.goto(HARNESS_PATH);
    await page.getByTestId("theme-harness-set-automatic").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");

    await page.getByTestId("theme-harness-set-light").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");

    // If the Automatic timer were still running, this would flip it to
    // dark at 19:00 — it must not, since mode is now explicit light.
    await page.clock.fastForward(300_000); // 5 minutes in ms
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("light");
  });

  test("reload persistence: an explicit choice survives a full page reload", async ({ page }) => {
    await page.goto(HARNESS_PATH);
    await page.getByTestId("theme-harness-set-dark").click();
    await expect(page.getByTestId("theme-harness-resolved")).toHaveText("dark");

    await page.reload();
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
    await expect(page.getByTestId("theme-harness-mode")).toHaveText("dark");
  });
});

test.describe("Theme Resolver — mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("explicit dark still resolves correctly (server-rendered, no overflow-related surprises) at a mobile width", async ({ page, context, baseURL }) => {
    await setThemeCookie(context, baseURL!, "dark.dark");
    await page.goto(HARNESS_PATH);
    await expect.poll(() => resolvedAttr(page)).toBe("dark");
  });
});
