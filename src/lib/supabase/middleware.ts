import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseCookieOptions } from "./cookie-options";
import { TEST_MODE } from "@/lib/test-mode";

// Safe public Supabase configuration. Environment variables remain preferred,
// but the known project values prevent the middleware from crashing when a
// public variable is missing or was renamed in the hosting dashboard.
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

  // Middleware must never turn an otherwise renderable page into a 500.
  // Supabase session refresh is helpful, but the server-side auth checks are
  // still performed by the application. If the refresh service is unavailable
  // or the runtime rejects a middleware operation, let the request continue.
  try {
    return await updateRealSupabaseSession(request, response);
  } catch {
    return response;
  }
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
