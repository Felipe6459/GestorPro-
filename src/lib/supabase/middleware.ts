import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseCookieOptions } from "./cookie-options";
import { TEST_MODE } from "@/lib/test-mode";

// These are safe client-side Supabase values. The environment variables remain
// the preferred source; the fallbacks prevent the Vercel middleware from
// crashing before the first page can even render when an environment variable
// was renamed by the hosting dashboard.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://jbdjfmvdrwdfnuhqrprc.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (TEST_MODE) {
    return response;
  }

  return updateRealSupabaseSession(request, response);
}

async function updateRealSupabaseSession(
  request: NextRequest,
  initialResponse: NextResponse,
) {
  let response = initialResponse;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
