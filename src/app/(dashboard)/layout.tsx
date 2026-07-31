import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
