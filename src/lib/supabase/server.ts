import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseCookieOptions } from "./cookie-options";
import { TEST_MODE, TEST_USER_COOKIE, decodeTestModeIdentity } from "@/lib/test-mode";

// Safe public Supabase configuration. Environment variables remain preferred,
// but the public URL/key fallback keeps the production app from crashing when
// Vercel has a renamed/missing public Supabase variable.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://jbdjfmvdrwdfnuhqrprc.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80";

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
      async updateUser() {
        return { data: { user: null }, error: null };
      },
      async signOut() {
        const cookieStore = await cookies();
        try {
          cookieStore.delete(TEST_USER_COOKIE);
        } catch {
          // Server Component context may not allow cookie mutation.
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

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
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
          // Middleware handles session refresh for Server Components.
        }
      },
    },
  });
}

export const getVerifiedAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
