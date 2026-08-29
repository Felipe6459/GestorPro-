import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ToastProvider } from "@/components/toast/toast-provider";
import { ToastListener } from "@/components/toast/toast-listener";
import { Footer } from "@/components/layout/footer";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { getThemePrePaintScript } from "@/lib/theme/pre-paint-script";
import { siteConfig } from "@/config/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

/**
 * Theme Resolver Phase B — server-side first render.
 *
 * The root layout is the one layout above every Aqenra surface (public
 * site, auth, /privacy, /terms, the staff app, Portal, Platform Admin —
 * confirmed by audit: none of them has its own competing layout), so
 * this is the single correct place to emit the pre-paint script.
 *
 * `data-theme="light"` here is a generic, hardcoded SSR default — NOT
 * read from the `aqenra_theme` cookie. This is a deliberate correction
 * from an earlier draft that called `cookies()` here: this app's own
 * installed Next.js docs (node_modules/next/dist/docs/01-app/02-guides/
 * preventing-flash-before-hydration.md, "Storing the theme in a
 * cookie") explicitly warn that reading a cookie in the root layout
 * "opts the entire app out of static prerendering" — confirmed
 * empirically too (a build before this fix showed every route,
 * including previously-static /privacy and /terms, become dynamic).
 * The same doc's recommended fix is exactly this: keep the layout
 * static with a generic default, and let the inline pre-paint script
 * (below) do 100% of the cookie reading/correcting, for all four
 * ThemeMode values — not just System/Automatic. See
 * pre-paint-script.ts's own doc comment for why that script already
 * handles explicit Light/Dark too (it always has — nothing to change
 * there).
 *
 * `suppressHydrationWarning` is required on `<html>` for the same
 * documented reason: the pre-paint script may have already changed
 * `data-theme` before React hydrates, and without this prop React's
 * hydration would silently revert the DOM back to this literal "light"
 * default the moment it reconciles the `<html>` element — exactly the
 * bug this fixes (confirmed via a real failing E2E run before this was
 * added: Playwright showed the cookie and React's own state correctly
 * resolving to "dark" while the actual `data-theme` attribute stayed
 * "light", reverted by hydration).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Pre-paint theme resolution — reads the aqenra_theme cookie and
          corrects data-theme for ALL FOUR modes (Light/Dark resolve
          trivially; System/Automatic need the browser's own
          matchMedia/Date). See pre-paint-script.ts's own doc comment
          for the full behavior and the security note on why
          interpolating this module's own fixed constants into inline
          script text is safe. beforeInteractive is hoisted into <head>
          and runs during HTML parsing, before first paint — see
          node_modules/next/dist/docs/01-app/03-api-reference/
          02-components/script.md — so this always runs before the
          browser paints anything, regardless of where it's placed in
          this tree.
        */}
        <Script id="aqenra-theme-preload" strategy="beforeInteractive">
          {getThemePrePaintScript()}
        </Script>
        <ThemeProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <ToastListener />
            </Suspense>
            {children}
          </ToastProvider>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
