"use client";

import { useActionState } from "react";
import { portalLogin } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import type { AuthActionState } from "@/types";

const initialState: AuthActionState = { error: null };

// Deliberately no "Sign up" link — a Client Portal identity is only ever
// created by accepting a ClientInvitation, never a self-serve signup.
export function PortalLoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(portalLogin, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
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
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
