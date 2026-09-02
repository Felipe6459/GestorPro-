"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { changePassword } from "./actions";
import type { AuthActionState } from "@/types";

const initialState: AuthActionState = { error: null, message: null };

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state.message]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormField>
        <FormLabel htmlFor="currentPassword">Senha atual</FormLabel>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </FormField>

      <FormField>
        <FormLabel htmlFor="newPassword">Nova senha</FormLabel>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        <p className="text-sm text-muted-foreground">Use pelo menos 8 caracteres.</p>
      </FormField>

      <FormField>
        <FormLabel htmlFor="confirmPassword">Confirmar nova senha</FormLabel>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </FormField>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      ) : null}

      {state.message ? (
        <p role="status" className="text-sm text-green-600">{state.message}</p>
      ) : null}

      <Button type="submit" loading={pending}>
        {pending ? "Alterando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
