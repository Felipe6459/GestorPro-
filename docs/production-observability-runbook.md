# Production Observability — Durable Failure Monitoring Runbook

## 1. Purpose

This app already writes durable failure records for two subsystems —
`WebhookEvent` (billing webhook processing) and `InvoiceEmailAttempt`
(invoice email delivery) — but nothing currently reads them back out for
an operator. This runbook is the smallest safe, useful, low-cost way to
check for those failures: a small set of bounded, read-only, aggregate-
only SQL queries an operator runs by hand against the production
database. It replaces no automated system, because none currently exists;
see §2 for exactly why, and §9 for the automated surface this defers to
once its blocker clears.

## 2. Current manual-only status and blockers

Monitoring is manual today because every automated alternative is
currently blocked or not yet justified:

- **Short Vercel retention, no Log Drain.** Runtime Log retention on the
  current plan is far too short (about an hour) for a daily cron's log
  line to be reliably read before it expires, and no demonstrated
  retrieval workflow exists to check within that window. Vercel Pro /
  Log Drain configuration was explicitly evaluated and deferred by the
  owner — see the Vercel Log Drain preflight/decision-closure reports.
  No external alerting exists.
- **Email automation is blocked.** A scheduled summary email would need
  an explicit operator-recipient decision (never assume the app's OWNER
  role is the same person as the platform operator) and confirmed Resend
  sender/domain readiness. `RESEND_API_KEY`/`INVITATION_FROM_EMAIL` being
  set in Production is necessary but not sufficient — custom-domain
  verification remains an unresolved operational limitation.
- **The natural automated home — a Platform Admin aggregate page — is
  blocked by a known, separately tracked issue.** Platform Admin access
  currently redirects the owner to the ordinary Dashboard. This runbook
  does not fix that; §9 describes the page this should become once it's
  fixed.

Until one of those blockers clears, this runbook is the whole mechanism.

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

## 9. Future preferred surface: a Platform Admin aggregate page

The architecturally correct home for this check is a new, read-only page
under `(platform-admin)` — Platform Admin already exists specifically as
a cross-organization, read-only operator console
(`docs/operator-setup.md`'s own description), gated by
`requirePlatformAdmin()`/`PLATFORM_ADMIN_EMAILS`, with an established
query-module convention (`src/lib/platform-admin/queries/*.ts`) this
would extend with the same four queries above. It would remove the
"someone has to remember to run this" limitation entirely (pull, on
demand, always current) with no retention problem and no new external
service.

**Current blocker:** Platform Admin access currently redirects the owner
to the ordinary Dashboard — a known, separately tracked issue, not fixed
by this document. This section describes the intended eventual surface;
it is not implemented and this runbook does not depend on it.

## 10. Limitations and reconsideration conditions

- Purely reactive and manual — there is no push signal; a failure is only
  discovered the next time someone runs this runbook.
- `InvoiceEmailAttempt`'s existing indexes (`[invoiceId, attemptedAt]`,
  `[invoiceId, status, attemptedAt]`) are both `invoiceId`-first; a
  cross-invoice query with no `invoiceId` predicate (Queries C/D) has no
  supporting index and requires a scan. Acceptable at this product's
  current early-stage volume; revisit if invoice-email volume grows
  enough to make that scan slow.
- Reconsider this runbook (in favor of §9, or of the previously-deferred
  Log Drain/email options) if any of the following changes: the Platform
  Admin access issue is fixed; Resend sender/domain readiness and an
  explicit operator-recipient decision are both established; the Vercel
  plan changes in a way that makes log retention or an external drain
  practical; or failure volume grows enough that a weekly manual check is
  no longer a proportionate cadence.
