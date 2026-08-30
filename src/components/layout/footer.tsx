import Link from "next/link";
import { getPlatformLegalConfig } from "@/lib/legal/platform-config";

/**
 * Rendered once, globally, in the root layout — see src/app/layout.tsx.
 * There is no shared layout across the app's various auth pages
 * (login/signup/forgot-password, both staff and portal variants), so a
 * single root-level footer is the only way to cover every route with one
 * change, the same reasoning ToastProvider/ToastListener already use for
 * their own global, root-level placement.
 */
export function Footer() {
  const config = getPlatformLegalConfig();
  const year = new Date().getFullYear();

  return (
    <footer className="border-border-default bg-surface border-t">
      <div className="text-text-muted mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs sm:px-6">
        <p>
          © {year} {config.legalName}
        </p>
        <nav className="flex gap-4">
          <Link href="/privacy" className="focus-visible:ring-focus-ring hover:text-text-primary rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
            Privacy Policy
          </Link>
          <Link href="/terms" className="focus-visible:ring-focus-ring hover:text-text-primary rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
