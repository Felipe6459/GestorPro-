# Production Observability — Durable Failure Monitoring Runbook

## 1. Purpose

This app already writes durable failure records for two subsystems —
`WebhookEvent` (billing webhook processing) and `InvoiceEmailAttempt`
(invoice email delivery). §9's Platform Admin Observability page
(`/platform-admin/observability`) is now the preferred way to check
them — a read-only, on-demand, always-current view, with no retention
window to beat. This runbook's own manual SQL (§6) remains documented
and valid as a fallback: it needs no code, works from a bare database
connection, and is the only option left if the Platform Admin page
itself is ever unreachable for any reason.

A small set of bounded, read-only, aggregate-only SQL queries an
operator runs by hand against the production database — see §2 for why
this started as the only option, and §9 for the page that now covers
the same ground automatically.

## 2. Status and remaining blockers

This runbook's manual SQL was, for a time, the whole mechanism — every
automated alternative was blocked or not yet justified. That is now
only true of two of the three:

- **Short Vercel retention, no Log Drain.** Runtime Log retention on the
  current plan is far too short (about an hour) for a daily cron's log
  line to be reliably read before it expires, and no demonstrated
  retrieval workflow exists to check within that window. Vercel Pro /
  Log Drain configuration was explicitly evaluated and deferred by the
  owner — see the Vercel Log Drain preflight/decision-closure reports.
  No external alerting exists. **Still blocked** — no push alerting of
  any kind exists; both this runbook and §9's page are pull-based.
- **Email automation is blocked.** A scheduled summary email would need
  an explicit operator-recipient decision (never assume the app's OWNER
  role is the same person as the platform operator) and confirmed Resend
  sender/domain readiness. `RESEND_API_KEY`/`INVITATION_FROM_EMAIL` being
  set in Production is necessary but not sufficient — custom-domain
  verification remains an unresolved operational limitation. **Still
  blocked**, unchanged.
- ~~The natural automated home — a Platform Admin aggregate page — is
  blocked by a known, separately tracked issue.~~ **Resolved on both
  fronts**: Platform Admin production access itself was restored
  (`PLATFORM_ADMIN_ACCESS_CONFIGURATION_GATE: PASS`), and the aggregate
  page this section originally deferred to is now built — see §9.

This runbook's manual SQL remains valid and unchanged; it is simply no
longer the *only* way to check.

## 3. Suggested cadence

- **Weekly**, during early-stage operation (current data volume is small
  enough that a weekly check is proportionate, not excessive).
- **Immediately** after any suspected billing or invoice-email incident
  (a support report, a manual observation during another task, a
  provider-status-page notice), independent of the weekly cadence.

## 4. Credential safety

This reuses the exact credential policy already documented in
[`docs/operator-setup.md`](operator-setup.md)'s "Security note — handling
production database credentials" section — no new credential mechanism
exists or is introduced here:

- Never print, paste, or store a production connection string — not even
  partially, not into a chat/AI session, not into shell history. If one
  is exposed this way regardless, treat it as compromised and rotate it
  immediately.
- A local file holding real production credentials stays gitignored and
  is deleted once the check is done.
- Never use a customer's or organization's own credentials — this always
  runs with the operator's own production database access, the same
  access already used for migration-status checks and the subscription
  backfill script.

## 5. Default aggregate-only policy

Every query in §6 is `SELECT`/`WITH` only — never `INSERT`, `UPDATE`,
`DELETE`, or any other mutation. Every query returns **counts grouped by
a closed status/failure-code enum only** — never a specific row. None of
the four queries ever selects, and no future variant of them should ever
select: `recipientEmail`, `invoiceId`, `providerEventId`,
`organizationId`, a user id, a raw payload, a raw provider response, a
token, a URL, a Storage path, an invoice number, or a raw error message.
If a count is non-zero and row-level identification genuinely becomes
necessary, that is a separate, deliberately authorized, tenant-bounded
investigation — never an extension of these queries (see §7).

## 6. Queries

Run against the production database using the same connection method
already covered by §4/`docs/operator-setup.md`. Table and column names
below are copied verbatim from `prisma/schema.prisma`'s current
`WebhookEvent`/`InvoiceEmailAttempt` models and their status enums.

### Query A — recent FAILED WebhookEvent rows, by failureCode

```sql
SELECT "failureCode", count(*) AS "count"
FROM "WebhookEvent"
WHERE "processingStatus" = 'FAILED'
  AND "createdAt" >= now() - interval '7 days'
GROUP BY "failureCode"
ORDER BY "failureCode";
```

### Query B — recent stale PENDING WebhookEvent rows

A `WebhookEvent` row can be left `PENDING` forever if its processing
transaction throws after the row itself already committed — a later
redelivery of the same provider event is then silently swallowed as a
duplicate, never revisiting the stuck row. Both bounds are required: the
lower bound keeps this query itself bounded; the upper bound (1 hour)
excludes rows still genuinely in flight.

```sql
SELECT count(*) AS "count"
FROM "WebhookEvent"
WHERE "processingStatus" = 'PENDING'
  AND "createdAt" >= now() - interval '7 days'
  AND "createdAt" < now() - interval '1 hour';
```

### Query C — actionable latest InvoiceEmailAttempt per invoice

Multiple `InvoiceEmailAttempt` rows can exist for the same invoice over
time (each its own send attempt); only the **latest** one reflects
current truth — an invoice whose latest attempt is `ACCEPTED` is resolved
regardless of an earlier `FAILED`/`UNKNOWN` row. The CTE below uses
PostgreSQL `DISTINCT ON` to pick exactly one row per invoice.

`ORDER BY "attemptedAt" DESC, "id" DESC` is deterministic: `"id"` is
`InvoiceEmailAttempt`'s primary key (a UUID), always present and unique
per row. It carries no chronological meaning on its own — its only job is
breaking a tie when two attempts for the same invoice share the exact
same `attemptedAt`, which is possible since timestamp precision is finite.
Without a secondary tie-breaker, `DISTINCT ON` on a tied `attemptedAt`
would pick a genuinely unpredictable row (and could vary between runs).
Adding `"id" DESC` was verified directly, in a disposable local
validation (§8), to resolve such a tie to the same row on every repeated
run — it does not need to mean anything on its own, only to always break
the tie the same way.

```sql
WITH latest_attempt AS (
  SELECT DISTINCT ON ("invoiceId")
    "invoiceId",
    "status",
    "failureReason",
    "attemptedAt"
  FROM "InvoiceEmailAttempt"
  WHERE "attemptedAt" >= now() - interval '7 days'
  ORDER BY
    "invoiceId",
    "attemptedAt" DESC,
    "id" DESC
)
SELECT
  "status",
  "failureReason",
  count(*) AS "count"
FROM latest_attempt
WHERE "status" IN ('FAILED', 'UNKNOWN')
GROUP BY "status", "failureReason"
ORDER BY "status", "failureReason";
```

This final aggregate never outputs `invoiceId` — the CTE selects it only
to identify the latest row per invoice; the outer query drops it entirely.

### Query D — latest stale PENDING InvoiceEmailAttempt per invoice

Same latest-attempt CTE as Query C, reused for the same reason: only the
latest attempt per invoice matters. `120 seconds` is
`STALE_PENDING_THRESHOLD_MS` exactly as defined in
`src/lib/invoices/email/send-invoice-email.ts` — the threshold the app's
own opportunistic sweep uses. That sweep only runs the next time someone
happens to retry the *same* invoice; if nobody does, the row stays
`PENDING` indefinitely with nothing else to catch it — which is exactly
what this query is for.

```sql
WITH latest_attempt AS (
  SELECT DISTINCT ON ("invoiceId")
    "invoiceId",
    "status",
    "failureReason",
    "attemptedAt"
  FROM "InvoiceEmailAttempt"
  WHERE "attemptedAt" >= now() - interval '7 days'
  ORDER BY
    "invoiceId",
    "attemptedAt" DESC,
    "id" DESC
)
SELECT count(*) AS "count"
FROM latest_attempt
WHERE "status" = 'PENDING'
  AND "attemptedAt" < now() - interval '120 seconds';
```

## 7. Interpretation and response procedure

| Signal | Meaning | Response |
|---|---|---|
| Webhook `FAILED` | Permanent, classified failure (`missing_organization`, `unknown_organization`, `provider_id_conflict`, or `malformed_event`) — the app's own webhook route documents all four as deterministic; retrying the identical payload would fail the same way. | Investigate the cause (e.g. a Paddle-side customer/org mapping issue). Do not retry automatically. |
| Webhook stale `PENDING` | Processing was interrupted mid-transaction and nothing ever revisited the row. | Investigate separately from `FAILED` rows — this is a different failure class (an incomplete run, not a classified rejection). |
| InvoiceEmail `FAILED` | Known non-delivery (e.g. `not_configured`, `provider_error`). | Investigate; do not resend without addressing the underlying cause. |
| InvoiceEmail `UNKNOWN` | Ambiguous — the app genuinely does not know whether the email was sent (a network error or an exception during its own settlement bookkeeping). | **Never blindly resend.** The app's own UI already gates a retry from `UNKNOWN` behind explicit staff acknowledgement of the specific stale attempt — use that flow, not a bypass. |
| InvoiceEmail stale `PENDING` | Missing settlement — the provider call was made but neither succeeded nor was recorded as failed/unknown before the request ended. | Investigate without automatic mutation; do not hand-write a status change. |
| Later `ACCEPTED` attempt | Fully suppresses earlier `FAILED`/`UNKNOWN` attempts for the same invoice from the actionable counts (Query C/D only ever look at the latest attempt). | No action — this is the intended, working outcome, not a gap. |
| A `FAILED`/`UNKNOWN` row with a **null** `failureReason` | A data-integrity/diagnostic anomaly — Query C's `GROUP BY` will surface it as its own `failureReason: null` group rather than silently folding it into another group or dropping it. | Treat as worth investigating in its own right, precisely because it means a failure was recorded without its usual explanation. |

For any non-zero count, in order:

1. Record only the check's timestamp, the query/category, the
   status/reason value, and the aggregate count — nothing row-level.
2. Query the bounded, fixed Vercel diagnostic event keys (§8) before
   their short retention window expires.
3. Do not paste raw logs or database rows anywhere, including into a
   ticket, chat, or AI session.
4. Do not retry, mutate, delete, or otherwise "repair" anything using
   this runbook — it is read-only by design.
5. If row-level identification genuinely becomes necessary, stop here
   and open a separately authorized, tenant-bounded investigation rather
   than extending these queries or improvising a narrower one ad hoc.

## 8. Fixed Vercel diagnostic event keys

These are the existing, already-shipped bounded diagnostics this runbook
complements — cross-reference a non-zero count above against these exact
log message keys within Vercel's own short retention window:

- `[invoice-issue] Issue pipeline failure.`
- `[invoice-pdf] Canonical path/ledger mismatch.`
- `[organization-provisioning] Membership FK race recovered.`
- `[billing] Provider session creation failed.`
- `[portal-analytics] Failed to record portal login.`
- `[portal-analytics] Failed to record portal download-link request.`

## 9. Implemented: the Platform Admin Observability page

**Built.** `/platform-admin/observability` (`src/app/(platform-admin)/
platform-admin/observability/page.tsx`, backed by
`src/lib/platform-admin/queries/failure-monitoring.ts`) reproduces the
exact same four aggregate checks as §6's manual SQL, rendered as a
read-only page instead of a query an operator types by hand — same
7-day window, same `failureCode`/`status`/`failureReason` grouping, same
1-hour and (source-derived) 120-second stale thresholds, same
latest-attempt-per-invoice supersession semantics, same forbidden-output
list (no `recipientEmail`/`invoiceId`/`providerEventId`/
`organizationId`/row id ever rendered). Authorization is the same single
choke point every other Platform Admin page already uses —
`requirePlatformAdmin()` in `(platform-admin)/layout.tsx` — not a second,
independent check.

One implementation difference from §6's raw SQL, disclosed here because
it affects performance at higher volume: `check-platform-admin-security.mjs`
forbids `$queryRaw`/`$executeRaw` anywhere under `src/lib/platform-admin`,
so the page cannot use a real `DISTINCT ON` query the way §6's manual SQL
does. It reproduces the identical latest-attempt-per-invoice result in
pure Prisma instead — fetching every `InvoiceEmailAttempt` row in the
7-day window (four narrow columns only, never `recipientEmail`/id/
`providerMessageId`/`idempotencyKey`/`requestedByUserId`) and reducing to
the latest row per invoice in application memory. Correct and safe at
this product's current invoice-email volume; if that volume grows enough
to make this scan slow, revisit as a deliberate, separately reviewed
schema/index change — not silently absorbed here.

This runbook's own manual SQL (§6) remains the fallback if the Platform
Admin page is ever unreachable for any reason — nothing about building
the page changed or removed the manual queries.

## 10. Limitations and reconsideration conditions

- **No push alerting still exists.** Both this runbook and §9's page are
  pull-based — a failure is only discovered the next time someone runs
  the manual check or opens the page. Short Vercel log retention and no
  Log Drain remain accepted limitations (§2).
- `InvoiceEmailAttempt`'s existing indexes (`[invoiceId, attemptedAt]`,
  `[invoiceId, status, attemptedAt]`) are both `invoiceId`-first; a
  cross-invoice query with no `invoiceId` predicate (Queries C/D, and
  §9's page's own in-memory equivalent) has no supporting index and
  requires a scan. Acceptable at this product's current early-stage
  volume; revisit as a deliberate, separately reviewed schema/index
  change if invoice-email volume ever grows enough to make that scan
  slow — never silently added as a side effect of an unrelated change.
- This runbook's manual SQL remains the fallback if §9's page is ever
  unreachable — kept intentionally, not dead documentation.
- Reconsider the remaining pull-only posture (in favor of the
  previously-deferred Log Drain/email options) if either changes: Resend
  sender/domain readiness and an explicit operator-recipient decision are
  both established; or the Vercel plan changes in a way that makes log
  retention or an external drain practical.
