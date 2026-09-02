"use server";

import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/types";

export async function changePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Preencha todos os campos." };
  }

  if (newPassword.length < 8) {
    return { error: "A nova senha deve ter pelo menos 8 caracteres." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "A confirmação da nova senha não confere." };
  }

  if (currentPassword === newPassword) {
    return { error: "A nova senha deve ser diferente da senha atual." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sua sessão expirou. Faça login novamente." };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });

  if (error) {
    return { error: "Não foi possível alterar a senha. Verifique sua senha atual e tente novamente." };
  }

  return { error: null, message: "Senha alterada com sucesso." };
}
