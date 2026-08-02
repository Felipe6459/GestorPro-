"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { withToast } from "@/lib/toast-url";
import { sanitizePortalRedirectPath } from "@/lib/safe-redirect";
import type { AuthActionState } from "@/types";

const NO_ACCESS_ERROR = "This account does not have Client Portal access.";

export async function portalLogin(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizePortalRedirectPath(String(formData.get("redirectTo") ?? ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  // Same Supabase sign-in as staff login, same error passthrough — Supabase
  // itself already returns a generic "Invalid login credentials" message
  // regardless of whether the email exists, so this step alone never
  // reveals account existence.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const authUser = data.user;

  const portalUser = await prisma.portalUser.findUnique({
    where: { id: authUser.id },
    include: { client: { select: { organizationId: true } } },
  });

  if (portalUser && portalUser.client.organizationId) {
    redirect(withToast(redirectTo, "Signed in successfully"));
  }

  // Authenticated, but not a usable portal identity. Check whether this is
  // actually a staff account before rejecting outright — a staff member who
  // ends up on the portal login by mistake should land on their real
  // dashboard, not a dead end.
  const hasMembership = await prisma.membership.findFirst({
    where: { userId: authUser.id },
    select: { id: true },
  });

  if (hasMembership) {
    redirect(withToast("/dashboard", "Signed in — this account uses the staff dashboard."));
  }

  // Neither a usable PortalUser nor a staff Membership — never leave an
  // authenticated-but-unauthorized session sitting around, and never say
  // anything more specific than this generic message.
  await supabase.auth.signOut();
  return { error: NO_ACCESS_ERROR };
}
