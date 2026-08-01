"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withToast } from "@/lib/toast-url";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";
import type { AuthActionState } from "@/types";

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizeRedirectPath(String(formData.get("redirectTo") ?? ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(withToast(redirectTo, "Signed in successfully"));
}
