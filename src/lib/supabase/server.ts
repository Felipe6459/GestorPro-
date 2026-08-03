import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseCookieOptions } from "./cookie-options";
import { TEST_MODE, TEST_USER_COOKIE, decodeTestModeIdentity } from "@/lib/test-mode";

/**
 * TEST_MODE-only stand-in for a real Supabase client, exposing just the
 * two methods this app's server code actually calls on the result of
 * createClient() in every path E2E tests exercise: auth.getUser() and
 * auth.signOut(). See src/lib/test-mode.ts for the full justification and
 * the exact gating guarantee — this branch is unreachable whenever
 * TEST_MODE is false, which is always true outside Playwright's own E2E
 * webServer process. Cast to SupabaseClient so every call site keeps its
 * real type — signInWithPassword/signUp/etc. are intentionally NOT
 * implemented here, since E2E tests inject a session directly rather than
 * exercising the login/signup forms (there is no real Supabase Auth to
 * sign in against locally); calling one in TEST_MODE would throw
 * "is not a function", loudly, rather than silently doing nothing.
 */
function createTestModeClient(): SupabaseClient {
  return {
    auth: {
      async getUser() {
        const cookieStore = await cookies();
        const identity = decodeTestModeIdentity(cookieStore.get(TEST_USER_COOKIE)?.value);
        const user: User | null = identity
          ? {
              id: identity.id,
              email: identity.email,
              user_metadata: {},
              app_metadata: {},
              aud: "authenticated",
              created_at: new Date(0).toISOString(),
            }
          : null;
        return { data: { user }, error: null };
      },
      async signOut() {
        const cookieStore = await cookies();
        try {
          cookieStore.delete(TEST_USER_COOKIE);
        } catch {
          // Called from a Server Component context; safe to ignore, same
          // as the real client's setAll() below.
        }
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
}

export async function createClient() {
  if (TEST_MODE) {
    return createTestModeClient();
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component; safe to ignore
            // when middleware handles session refresh instead.
          }
        },
      },
    },
  );
}
