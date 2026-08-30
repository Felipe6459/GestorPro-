"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pre-Launch Audit F1 fix — persistent, discoverable navigation across
 * every /settings/* page. Mirrors src/components/client-portal/portal-nav.tsx's
 * shape exactly (a secondary, in-section nav distinct from the primary
 * app Sidebar): same overflow-x-auto horizontal-scroll mobile behavior,
 * same aria-current="page" + focus-visible pattern, same bg-black active
 * state (the Aqenra Indigo accent swap in PR #139 was deliberately scoped
 * to the primary Sidebar/Button only — this secondary nav intentionally
 * stays unswept, exactly like PortalNav already does, per that PR's own
 * "repository-wide sweep deferred" scope note).
 *
 * `canAccessPayment` is the only visibility gate here — server-resolved by
 * the layout via the existing canonical
 * organization-setup/authorization.ts helper, never re-derived here. This
 * is discoverability only: hiding the link is not the security boundary,
 * the Payment Details page's own independent
 * assertCanAccessPaymentDetails() check (and every other settings page's
 * own existing role check) is unchanged and still the real gate for a
 * direct URL visit.
 */
type SettingsNavLink = {
  href: string;
  label: string;
  /** Only ever hidden for Payment Details — every other link here is open to any staff role, exactly matching each page's own existing "any member may view" behavior. */
  paymentOnly?: boolean;
};

const SETTINGS_LINKS: readonly SettingsNavLink[] = [
  { href: "/settings/company", label: "Company" },
  { href: "/settings/payment", label: "Payment details", paymentOnly: true },
  { href: "/settings/domain", label: "Domain" },
  // Phase D: grouped next to Notifications — both are personal,
  // per-identity preferences (not organization-wide config like
  // Company/Payment/Domain/Billing above), and neither is role-gated.
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/billing", label: "Billing" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav({ canAccessPayment }: { canAccessPayment: boolean }) {
  const pathname = usePathname();
  const links = SETTINGS_LINKS.filter((link) => !link.paymentOnly || canAccessPayment);

  return (
    <nav
      aria-label="Settings"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 pb-3"
    >
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
              active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
