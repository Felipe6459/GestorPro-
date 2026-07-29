"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withToast } from "@/lib/toast-url";
import type { AuthActionState } from "@/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !password || !confirmPassword) {
    return { error: "All fields are required." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  if (data.session) {
    redirect(withToast("/dashboard", "Account created"));
  }

  return {
    error: null,
    message: "Account created. Check your email to confirm before signing in.",
  };
}
