import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import { PasswordForm } from "./password-form";

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Segurança</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Altere a senha da sua própria conta com segurança.
        </p>
      </div>

      <section className={`${CARD_SURFACE_CLASSES} p-6`}>
        <h2 className="text-lg font-medium">Alterar senha</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Informe sua senha atual e defina uma nova senha. Sua senha nunca é exibida ou armazenada pelo painel.
        </p>
        <PasswordForm />
      </section>
    </main>
  );
}
