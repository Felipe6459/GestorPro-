"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-field";
import type { AuthActionState } from "@/types";

const initialState: AuthActionState = { error: null };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const signupHref = redirectTo
    ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/signup";

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
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
        <div className="flex items-baseline justify-between">
          <FormLabel htmlFor="password" required>
            Password
          </FormLabel>
          <Link
            href="/forgot-password"
            className="rounded text-sm font-medium text-black hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
          >
            Forgot password?
          </Link>
        </div>
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

      <div className="space-y-2 pt-2">
        <Link
          href={signupHref}
          className="flex w-full items-center justify-center rounded-md border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Criar nova conta para testar
        </Link>
        <p className="text-center text-xs text-gray-500">
          Cadastro público, sem precisar de autorização do administrador.
        </p>
      </div>
    </form>
  );
}
