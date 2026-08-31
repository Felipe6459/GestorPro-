"use client";

import { useActionState } from "react";
import Link from "next/link";
import { portalSignup } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import type { AuthActionState } from "@/types";

const initialState: AuthActionState = { error: null };

export function PortalSignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(portalSignup, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <div>
        <FormLabel htmlFor="email" required>
          Email
        </FormLabel>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div>
        <FormLabel htmlFor="password" required>
          Password
        </FormLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <FormLabel htmlFor="confirmPassword" required>
          Confirm password
        </FormLabel>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}

      {state.message && (
        <p role="status" className="text-success text-sm">
          {state.message}
        </p>
      )}

      <p className="text-text-muted text-center text-xs">
        By creating an account, you agree to our{" "}
        <Link href="/terms" className={ACTION_LINK_CLASSES}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className={ACTION_LINK_CLASSES}>
          Privacy Policy
        </Link>
        .
      </p>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Creating account…" : "Sign up"}
      </Button>

      <p className="text-text-muted text-center text-sm">
        Already have an account?{" "}
        <Link
          href={redirectTo ? `/portal/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/portal/login"}
          className={ACTION_LINK_CLASSES}
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
