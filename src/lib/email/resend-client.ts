import { TEST_MODE } from "@/lib/test-mode";

// Reads process.env.RESEND_API_KEY (a server-only secret) and is only ever
// imported from "use server" action files, so this never reaches the
// client bundle — same trust boundary as src/lib/prisma.ts.
const RESEND_API_URL = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "provider_error" | "network_error" };

export type SendEmailFn = (input: SendEmailInput) => Promise<SendEmailResult>;

/**
 * Thin fetch wrapper around Resend's HTTP API — chosen over the `resend`
 * SDK because it's a single JSON POST with a bearer token; a native fetch
 * call needs no extra dependency and is trivially swappable for a mock in
 * tests (see the `sendEmail` DI param on sendInvitationEmail).
 *
 * Never logs the request body (contains the recipient/invite link) or the
 * response body (Resend may echo request fields back) or any header —
 * only a coarse, non-identifying reason is ever returned to the caller.
 */
export async function sendEmailViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  // E2E-only fake, gated on the identical TEST_MODE flag src/lib/test-
  // mode.ts's identity bypass and src/lib/storage/test-storage.ts's fake
  // Storage both use — never a second independent check. This sandbox has
  // no real Resend to reach any more than it has real Supabase, so a real
  // send is equally unreachable in an E2E run; this reports the same
  // shape a real successful send would, without ever calling fetch() or
  // needing a real RESEND_API_KEY/INVITATION_FROM_EMAIL.
  if (TEST_MODE) {
    return { ok: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (!response.ok) {
    return { ok: false, reason: "provider_error" };
  }

  return { ok: true };
}
