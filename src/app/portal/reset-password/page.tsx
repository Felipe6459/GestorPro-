import Link from "next/link";
import { getVerifiedAuthUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import { resetPortalPassword, signOutAndGoToPortalLogin } from "./actions";

/**
 * Sale-Ready Phase B, PR1 (Password Recovery). Portal counterpart of
 * (auth)/reset-password/page.tsx — same session-presence check, same
 * "no session at all" friendly fallback. See that page's own doc comment.
 */
export default async function PortalResetPasswordPage() {
  const user = await getVerifiedAuthUser();

  return (
    <main className="bg-surface-recessed flex min-h-screen items-center justify-center px-4">
      <div className={`w-full max-w-sm p-8 shadow-sm ${CARD_SURFACE_CLASSES}`}>
        {user ? (
          <>
            <h1 className="text-text-primary mb-6 text-2xl font-semibold tracking-tight">Set a new password</h1>
            <ResetPasswordForm action={resetPortalPassword} signOutAction={signOutAndGoToPortalLogin} />
          </>
        ) : (
          <div className="space-y-4 text-center">
            <h1 className="text-text-primary text-2xl font-semibold tracking-tight">This link is invalid or has expired</h1>
            <p className="text-text-muted text-sm">Request a new password reset link to continue.</p>
            <p className="text-text-muted text-sm">
              <Link href="/portal/forgot-password" className={ACTION_LINK_CLASSES}>
                Request a new link
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
