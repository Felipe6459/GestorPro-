const FALLBACK_PATH = "/dashboard";

/**
 * Narrows an untrusted redirect target (query param, form field) down to a
 * same-origin relative path, or the app's default landing page otherwise.
 *
 * Rejects anything that isn't a single leading "/" followed by a normal
 * path character — in particular "//evil.com" and "/\evil.com", both of
 * which some browsers normalize into a protocol-relative (cross-origin)
 * URL despite starting with a slash. This is the only thing standing
 * between a login/signup redirectTo param and an open redirect.
 */
export function sanitizeRedirectPath(
  input: string | null | undefined,
  fallback: string = FALLBACK_PATH,
): string {
  if (!input) return fallback;
  if (typeof input !== "string") return fallback;
  if (!/^\/(?!\/|\\)/.test(input)) return fallback;
  if (/[\r\n]/.test(input)) return fallback;
  return input;
}
