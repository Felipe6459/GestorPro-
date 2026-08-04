"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/invoices", label: "Invoices" },
  { href: "/team", label: "Team" },
  { href: "/activity", label: "Activity" },
  { href: "/settings/notifications", label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white p-3 md:w-56 md:flex-col md:gap-1.5 md:border-r md:border-b-0 md:p-4"
    >
      <span className="hidden px-2 pb-4 text-lg font-semibold tracking-tight text-gray-900 md:block">
        Client Portal CRM
      </span>
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
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
