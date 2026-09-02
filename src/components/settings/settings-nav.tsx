"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SettingsNavLink = {
  href: string;
  label: string;
  paymentOnly?: boolean;
};

const SETTINGS_LINKS: readonly SettingsNavLink[] = [
  { href: "/settings/company", label: "Company" },
  { href: "/settings/payment", label: "Payment details", paymentOnly: true },
  { href: "/settings/domain", label: "Domain" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/security", label: "Segurança" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav({ canAccessPayment }: { canAccessPayment: boolean }) {
  const pathname = usePathname();
  const links = SETTINGS_LINKS.filter((link) => !link.paymentOnly || canAccessPayment);

  return (
    <nav aria-label="Settings" className="border-border-default mb-6 flex gap-1 overflow-x-auto border-b pb-3">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`focus-visible:ring-focus-ring whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              active ? "bg-accent text-white" : "text-text-secondary hover:bg-[var(--hover)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
