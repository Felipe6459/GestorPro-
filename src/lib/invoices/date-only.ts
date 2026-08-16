const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ParseDateOnlyResult = { ok: true; date: Date } | { ok: false };

/**
 * Invoice System Slice 2b — strict YYYY-MM-DD date-only parser
 * (docs/invoicing-architecture.md, Invoice issueDate/dueDate contract).
 *
 * Rejects anything JS's own lenient Date parsing would otherwise accept —
 * an out-of-range day like "2026-02-30" (which `new Date(...)` silently
 * rolls forward to March), a non-padded "2026-2-3", a full datetime
 * string, or trailing garbage.
 *
 * Supported years: 0001-9999. Year 0000 is explicitly rejected. The Date
 * is constructed via a neutral epoch Date plus `setUTCFullYear(year,
 * month-1, day)` rather than `Date.UTC(year, ...)` directly, because
 * `Date.UTC` (and the `Date` constructor generally) special-cases a
 * two-digit-looking numeric year 0-99 by adding 1900 to it (a legacy
 * JS/Y2K-era behavior) — `Date.UTC(1, 0, 1)` does NOT produce year 1, it
 * produces year 1901. `setUTCFullYear()` has no such special case at any
 * argument count and sets the year exactly as given, for every value
 * 0001-9999 alike.
 *
 * The persisted convention is explicit: the returned Date always
 * represents 00:00:00.000 UTC on the named calendar date — never the
 * browser/server's local timezone — so `formatDateOnly()` round-trips to
 * the exact same YYYY-MM-DD string regardless of which timezone parses or
 * renders it.
 */
export function parseDateOnly(raw: string): ParseDateOnlyResult {
  const match = DATE_ONLY_PATTERN.exec(raw);
  if (!match) return { ok: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year === 0) return { ok: false };
  if (month < 1 || month > 12) return { ok: false };

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  // setUTCFullYear silently rolls an out-of-range day (e.g. Feb 30 -> Mar
  // 2), exactly like Date.UTC would — the round-trip check below is what
  // actually rejects it: if the constructed Date's own UTC year/month/day
  // don't match what was requested, the input named an impossible
  // calendar date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false };
  }

  return { ok: true, date };
}

/** Inverse of parseDateOnly — always reads the UTC components, matching the parse convention exactly. */
export function formatDateOnly(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
