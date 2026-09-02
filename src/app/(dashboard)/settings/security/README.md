# Segurança

A página `/settings/security` permite ao usuário autenticado alterar a própria senha.

O fluxo exige a senha atual, valida a nova senha com no mínimo 8 caracteres e confirma a nova senha antes de chamar o Supabase Auth.

O fluxo de recuperação por e-mail continua separado: o link recebido por e-mail deve levar à tela pública de redefinição de senha (`/reset-password`).
