import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationSwitcherItems } from "@/lib/current-user";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A Client Portal-only identity (a PortalUser with no staff Membership)
  // must never fall through to getOrganizationSwitcherItems() below — that
  // chain (via getCurrentUserOrganization) auto-provisions a brand-new
  // personal Organization for anyone with no existing Membership, which
  // would silently hand a portal user their own empty CRM instead of
  // routing them to their actual portal. This check is deliberately a
  // lightweight existence query, not a reimplementation of that
  // resolution logic — everything below is unchanged.
  const hasMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!hasMembership) {
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (portalUser) {
      redirect("/portal");
    }
    // Neither a Membership nor a PortalUser exists — this is the existing
    // "brand new staff signup" case, which must keep auto-provisioning a
    // User and personal Organization exactly as it already does below.
  }

  const organizations = await getOrganizationSwitcherItems();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header email={user.email ?? ""} organizations={organizations} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
