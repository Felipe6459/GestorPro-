import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getOptionalPortalUser } from "@/lib/current-portal-user";
import { parseSearchParam, type RawSearchParams } from "@/lib/list-params";
import { sanitizePortalRedirectPath } from "@/lib/safe-redirect";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import { PortalLoginForm } from "./portal-login-form";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const redirectTo = sanitizePortalRedirectPath(parseSearchParam(resolvedSearchParams.redirectTo));

  const identity = await getOptionalPortalUser();
  if (identity) {
    redirect(redirectTo);
  }

  // Already authenticated, but as staff rather than a portal contact —
  // send them to their real home instead of showing a login form for a
  // door they've already opened differently.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (authUser) {
    const hasMembership = await prisma.membership.findFirst({
      where: { userId: authUser.id },
      select: { id: true },
    });
    if (hasMembership) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="bg-surface-recessed flex min-h-screen items-center justify-center px-4">
      <div className={`w-full max-w-sm p-8 shadow-sm ${CARD_SURFACE_CLASSES}`}>
        <h1 className="text-text-primary mb-6 text-2xl font-semibold tracking-tight">
          Client Portal
        </h1>
        <PortalLoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
