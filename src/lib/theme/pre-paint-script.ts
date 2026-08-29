import {
  AUTOMATIC_DARK_START_MINUTES,
  AUTOMATIC_LIGHT_START_MINUTES,
  THEME_COOKIE_NAME,
} from "./types";

/**
 * Returns the exact, static JS source for the pre-paint theme-correction
 * script — rendered in the root layout via `next/script`
 * `strategy="beforeInteractive"` (see docs: "beforeInteractive scripts
 * must be placed inside the root layout... will always be injected
 * inside the head of the HTML document... execution does not block page
 * hydration", node_modules/next/dist/docs/01-app/03-api-reference/
 * 02-components/script.md).
 *
 * Its job: the server can render an explicit Light/Dark choice
 * correctly (see root layout's own comment), but it cannot know the
 * browser's real `prefers-color-scheme` or the visitor's real local
 * time, so for System/Automatic the server's rendered `data-theme` is
 * only a best-effort guess. This script recomputes the real value
 * synchronously, before the browser paints anything, and corrects the
 * `<html>` attribute (and the cached cookie value) if the guess was
 * stale — so there is no visible flash even though a correction may
 * happen.
 *
 * Security note (audited deliberately, not incidentally): every value
 * interpolated into the template below — THEME_COOKIE_NAME,
 * AUTOMATIC_LIGHT_START_MINUTES, AUTOMATIC_DARK_START_MINUTES — is a
 * fixed constant from this module's own source, decided at build time,
 * never derived from a request, cookie, header, or any other
 * user-controlled input. The script's actual cookie value is read (via
 * `document.cookie`) and PARSED entirely at runtime, inside the
 * generated script, against a hardcoded two-item allowlist for each half
 * of the value — an unrecognized mode/resolved word simply falls back
 * to a safe default (`system`/`light`), it is never concatenated into
 * anything that gets executed or re-interpreted as code. There is no
 * `eval`, no `innerHTML`/`document.write`, and no string built from the
 * cookie's own content is ever assigned back to anything but the
 * `data-theme` attribute value and a new cookie string (both plain data,
 * not markup or script). This is what makes it safe to render via
 * `next/script`'s inline-content mode (children, not a raw template
 * literal spliced with untrusted input) even though the cookie itself is
 * technically untrusted client-supplied input.
 */
export function getThemePrePaintScript(): string {
  return `(function(){try{
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE_NAME}=([^;]*)/);
var raw=m?decodeURIComponent(m[1]):"";
var p=raw.split(".");
var modes=["light","dark","system","automatic"];
var resolvedValues=["light","dark"];
var mode=modes.indexOf(p[0])!==-1?p[0]:"system";
var cached=resolvedValues.indexOf(p[1])!==-1?p[1]:"light";
var next=cached;
if(mode==="light"||mode==="dark"){
next=mode;
}else if(mode==="system"){
next=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";
}else if(mode==="automatic"){
var d=new Date();
var mins=d.getHours()*60+d.getMinutes();
next=(mins>=${AUTOMATIC_LIGHT_START_MINUTES}&&mins<${AUTOMATIC_DARK_START_MINUTES})?"light":"dark";
}
document.documentElement.setAttribute("data-theme",next);
if(next!==cached){
document.cookie="${THEME_COOKIE_NAME}="+mode+"."+next+"; path=/; max-age=31536000; samesite=lax"+(location.protocol==="https:"?"; secure":"");
}
}catch(e){}})();`;
}
