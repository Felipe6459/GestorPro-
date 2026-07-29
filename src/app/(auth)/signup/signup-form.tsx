"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import type { AuthActionState } from "@/types";

const initialState: AuthActionState = { error: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <FormLabel htmlFor="email" required>
          Email
        </FormLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
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
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      {state.message && (
        <p role="status" className="text-sm text-green-600">
          {state.message}
        </p>
      )}

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Creating account…" : "Sign up"}
      </Button>

      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href="/login"
          className="rounded font-medium text-black hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
