"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setActiveOrganization } from "@/lib/current-user";
import { withToast } from "@/lib/toast-url";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Switches the current user's active organization. organizationId is
 * untrusted input (it comes straight from a switcher button click) —
 * setActiveOrganization() re-verifies a Membership row exists for
 * (user, organizationId) before touching the cookie, and throws the exact
 * same message whether the id belongs to someone else's organization or
 * doesn't exist at all, so neither case can be distinguished from outside.
 */
export async function switchOrganizationAction(organizationId: string): Promise<void> {
  await setActiveOrganization(organizationId);

  // Every dashboard route scopes its data by the active organization, so a
  // switch invalidates the whole layout subtree at once (and purges the
  // client router cache) rather than enumerating each affected route.
  revalidatePath("/", "layout");

  redirect(withToast("/dashboard", "Switched organization"));
}
