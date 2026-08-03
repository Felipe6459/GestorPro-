# Notifications Center — Architecture & Design (Stage 1)

Design-only. No code, no migration, no schema change lands in this stage —
this document exists to be reviewed and revised before anything is built.

## 0. Grounding: what already exists

Before designing anything new, this section states the facts the rest of
the document depends on. Every claim below was verified directly against
the current codebase (`prisma/schema.prisma`, every `createActivity(...)`
call site, `src/lib/current-user.ts`, the dashboard/activity queries).

### 0.1 The tenancy model

- An **Organization** has many **Membership** rows, each pointing at a
  **User** with a `Role` (`OWNER` / `ADMIN` / `MEMBER`). This is flat — no
  per-user "watch list" or "follow" concept exists anywhere today.
- A **PortalUser** is a *structurally separate* identity from `User`. It
  never has a `Membership`, is never resolved by
  `getCurrentUserOrganization()`, and belongs to exactly one `Client` (its
  organization is only ever reached by joining through that `Client`). Any
  notification design that doesn't treat "staff user" and "portal contact"
  as two distinct recipient types will eventually leak one org's internal
  notification into the other's — this is the single most important
  constraint in this document.
- `Client.userId` / `Project.ownerId` record who *created* the row, not an
  exclusive owner in an access-control sense — every Client/Project/Task/
  Invoice is reachable by anyone with a `Membership` in its
  `organizationId`. Notifying "the owner" of an entity is therefore usually
  equivalent to notifying its creator, which is frequently the same person
  who just performed the action — see §2's "no self-notification" rule.
- `Task.assigneeId` **exists in the schema but is wired into no form or
  action today** (confirmed via `src/lib/activity/task-metadata.ts`'s own
  comment: "no form or action in this app currently reads or writes it").
  Anything resembling "notify the assignee" is therefore not implementable
  yet without first shipping task assignment itself — classified
  **future only** below, not a gap in this design.
- Invoice `OVERDUE` and Task "overdue" are **not the same kind of fact**:
  - `Invoice.status = OVERDUE` is a value someone explicitly sets from the
    edit form's status dropdown, going through the ordinary
    `STATUS_CHANGED` path. It is a real, event-shaped fact.
  - A task being "overdue" is **re-derived at read time** by the dashboard
    query (`dueDate < now AND status != DONE`) — no job or code path ever
    writes an event the moment a task crosses its due date. There is no
    scheduler/cron of any kind in this codebase today.
  This distinction directly shapes §7 ("due date alerts" needs new
  scheduled infrastructure that does not exist yet; it is not a matter of
  just listening to an existing event).
- Client status changes (`ClientStatus`: `LEAD/ACTIVE/INACTIVE/ARCHIVED`)
  do **not** get their own `STATUS_CHANGED` action the way Project/Task/
  Invoice do — they're folded into the generic `UPDATED` action, with
  `"status"` appearing (or not) inside `metadata.changedFields`. A
  notification rule keyed only on `action` cannot distinguish "a client's
  name changed" from "a client went ACTIVE" — it would need to also
  inspect `changedFields`. Noted here so §2 and §7 don't quietly assume
  otherwise.

### 0.2 Where every Activity row is written

`createActivity(tx, input)` (`src/lib/activity/create-activity.ts`) is the
**only** function that writes an `Activity` row anywhere in the
application. It is always called from inside the same `prisma.$transaction`
as the business mutation it records, so the mutation and its Activity row
either both commit or both roll back. This single choke point is the most
important existing fact for this design: **it is the one place a
notification fan-out hook can be added once, instead of thirty-odd call
sites needing to each remember a second call.** §4 builds on this directly.

There are 17 call sites, producing every `(entityType, action)` pair the
schema's `ActivityEntityType`/`ActivityAction` enums allow. §1 catalogs
them all.

### 0.3 Existing conventions worth reusing, not reinventing

- **Keyset pagination**: the Activity feed (`src/app/(dashboard)/activity/`)
  already paginates by `ORDER BY createdAt DESC, id DESC` with a
  base64url-encoded `{createdAt, id}` cursor
  (`src/lib/activity/cursor.ts`), `take: PAGE_SIZE + 1` to detect
  `hasMore`, and an "expired cursor" fallback that resets to the first
  page rather than erroring. §5 reuses this exact shape for notifications.
- **Metadata discipline**: every `createActivity` call passes a small,
  allowlisted snapshot (name, changed field names, a `{from, to}` pair) —
  never a token, a signed URL, a full form payload, or a raw `storagePath`.
  `formatActivity()` never trusts `metadata` blindly; every field read is
  defensive, with a generic fallback line if something doesn't match the
  expected shape. Notification title/body rendering should follow the same
  discipline (§3, §7).
- **Role re-checks happen server-side, every time**, never trusted from
  the UI alone (e.g. `inviteMemberAction` re-checks `membership.role` even
  though the invite form is only rendered for OWNER/ADMIN). Fan-out
  recipient computation (§4) must follow the same rule: computed from
  `Membership` rows read inside the same transaction, never from a
  client-supplied recipient list.
- **Header/Sidebar layout**: `Header.tsx` is a single flex row
  (`OrganizationSwitcher` — spacer — `email` + `Sign out`). `Sidebar.tsx`
  collapses to a horizontal scrolling top bar below the `md:` breakpoint
  and a vertical column above it. §6 places the notification bell inside
  this existing header, not as a new layout region.

---

## 1. Existing event sources

Every `Activity` row currently written, grouped by feature and by exactly
which file/action produces it.

| Feature | File | `entityType` | `action`(s) |
|---|---|---|---|
| **Clients** | `clients/new/actions.ts` | `CLIENT` | `CREATED` |
| | `clients/[id]/edit/actions.ts` | `CLIENT` | `UPDATED` |
| | `clients/actions.ts` | `CLIENT` | `DELETED` |
| **Projects** | `projects/new/actions.ts` | `PROJECT` | `CREATED` |
| | `projects/[id]/edit/actions.ts` | `PROJECT` | `STATUS_CHANGED`, `UPDATED` |
| | `projects/actions.ts` | `PROJECT` | `DELETED` |
| **Tasks** | `tasks/new/actions.ts` | `TASK` | `CREATED` |
| | `tasks/[id]/edit/actions.ts` | `TASK` | `STATUS_CHANGED`, `UPDATED` |
| | `tasks/actions.ts` | `TASK` | `DELETED` |
| **Invoices** | `invoices/new/actions.ts` | `INVOICE` | `CREATED` |
| | `invoices/[id]/edit/actions.ts` | `INVOICE` | `STATUS_CHANGED`, `UPDATED` |
| | `invoices/actions.ts` | `INVOICE` | `DELETED` |
| **Team** (membership) | `team/actions.ts` | `MEMBERSHIP` | `ROLE_CHANGED`, `OWNERSHIP_TRANSFERRED`, `MEMBER_REMOVED`, `MEMBER_LEFT` |
| **Invitations** (staff org) | `team/actions.ts` | `INVITATION` | `INVITATION_SENT`, `INVITATION_RESENT`, `INVITATION_CANCELED` |
| | `invite/[token]/actions.ts` | `INVITATION` | `INVITATION_ACCEPTED` |
| **Portal** (client contacts) | `clients/[id]/edit/portal-access-actions.ts` | `PORTAL_USER` | `PORTAL_INVITATION_SENT`, `PORTAL_INVITATION_RESENT`, `PORTAL_INVITATION_CANCELED`, `PORTAL_USER_REMOVED` |
| | `portal/invite/[token]/actions.ts` | `PORTAL_USER` | `PORTAL_INVITATION_ACCEPTED` |
| **Attachments** | `src/lib/attachments/attachment-mutations.ts` | `ATTACHMENT` | `FILE_UPLOADED`, `FILE_DELETED` (both the direct-delete path and the cascade-delete-with-parent path) |
| **Anything else?** | — | — | None. Every `ActivityAction`/`ActivityEntityType` enum value is accounted for above; there is no dead/unused enum value and no Activity-writing code outside these 17 files. |

30 distinct `(entityType, action)` combinations in total, all reachable
from exactly the call sites above.

---

## 2. Which of these should generate a notification?

Four buckets, per the brief: **never** / **notify immediately** /
**notify only affected users** / **future only**. The guiding principle:
*a notification is for something a specific person needs to see promptly
and hasn't already seen* — not a second copy of the Activity feed. If
everyone in the org would see the same generic line with no personal
relevance, it belongs in Activity only. If a specific person is the actor
themselves, they don't need telling — they were just there.

| Entity | Action | Classification | Why |
|---|---|---|---|
| Client | `CREATED` | Never | Routine data entry; no one is specifically "affected" beyond the whole org, which would make this pure noise. Already visible on `/clients` and `/activity`. |
| Client | `UPDATED` | Never | Same reasoning; also the highest-frequency action in the system (every field edit). A notification per field edit would be actively annoying. |
| Client | `DELETED` | Notify only affected users | "Affected" here means anyone with an *open Project/Invoice/Attachment under that Client* loses easy access to it — but since delete cascades/blocks are already enforced at the DB level (`Client.userId → User onDelete: Restrict`, `Project.clientId → Client onDelete: Cascade`), and only OWNER/ADMIN can delete in practice, this is closer to "never" in practice today. Kept as "affected users" rather than "never" only because a future permission model could let more roles delete, at which point the other org members should hear about a client disappearing under them. |
| Project | `CREATED` | Never | Same reasoning as Client CREATED. |
| Project | `UPDATED` | Never | Same reasoning as Client UPDATED. |
| Project | `STATUS_CHANGED` | Notify only affected users | The one Project event with a plausible specific audience: anyone who has an *assigned Task* under this project (once assignment exists — see Task row below) cares that the project moved to `ON_HOLD`/`CANCELLED`/`COMPLETED`. Today, with no assignment wired up, this degrades to "no distinct affected set" — see the Task rows for why this is really gated by the same missing feature. Kept out of "never" because it's the natural home for this rule once assignment ships, not because it's actionable today. |
| Project | `DELETED` | Notify only affected users | Same logic as Client `DELETED` — currently narrow (only reachable by roles that already know), broadens naturally once assignment/sharing exists. |
| Task | `CREATED` | Future only | Only becomes meaningful once `Task.assigneeId` is actually collected by a form — "notify the assignee a task was created for them" is the textbook case, but the feature it depends on doesn't exist. |
| Task | `STATUS_CHANGED` | Future only | Same dependency — "the task you're assigned moved to IN_REVIEW" needs assignment to exist first. |
| Task | `UPDATED` | Never | Generic field edits (description, due date text) are not urgent even once assignment exists — see `dueDate` reaching `URGENT` priority or crossing its due date, which is the *due date alert* future capability in §7, deliberately separate from a generic "UPDATED" notification. |
| Task | `DELETED` | Future only | Same dependency as CREATED — "your assigned task was deleted" only makes sense once there's an assignee to tell. |
| Invoice | `CREATED` | Never | Routine; no specific person is "affected" by an invoice merely existing, only by its financial state changing (see `STATUS_CHANGED`). |
| Invoice | `STATUS_CHANGED` | Notify immediately | The one financial state-change event with real urgency for a small business: `SENT`, `PAID`, `OVERDUE` are all things an owner/admin plausibly wants to know about promptly, and there is no natural "assignee" to narrow this to (invoices aren't assigned to a person) — so it's "immediately" rather than "affected users", scoped to OWNER/ADMIN (not every MEMBER) via the fan-out rule in §4, not by inventing a new recipient concept. |
| Invoice | `UPDATED` | Never | Generic field edits (notes, contact details) carry no urgency. |
| Invoice | `DELETED` | Notify only affected users | Same reasoning as Client/Project `DELETED` — narrow today (delete already role-gated), broadens if that gate ever loosens. |
| Membership | `ROLE_CHANGED` | Notify immediately | Directly affects one specific person's own permissions in the product they use every day — this is squarely "you need to know this now," not "eventually visible in a feed." Recipient: the affected member only (a natural single-recipient case, not a fan-out). |
| Membership | `OWNERSHIP_TRANSFERRED` | Notify immediately | Affects exactly two people concretely (the outgoing and incoming owner) and is organizationally significant enough that the rest of the org arguably wants to know too — recipient is "the two directly involved people, immediately" plus the org's Activity feed for everyone else (already true today). |
| Membership | `MEMBER_REMOVED` | Notify immediately | The removed member needs to know their access just changed — same urgency class as `ROLE_CHANGED`. (Practically, their next request will already redirect them since their `Membership` row is gone — but the notification is for the *record*, e.g. via email in a later stage, not just the in-app state.) |
| Membership | `MEMBER_LEFT` | Never | Self-referential — the actor leaving IS the affected party; they don't need to be told they just did something. Everyone else already sees it in Activity; no one else has an urgent personal stake in learning it *immediately* over just seeing it next time they check. |
| Invitation | `INVITATION_SENT` | Never | The recipient isn't a `User` yet (no account exists to attach an in-app notification to) — delivery is already handled by the existing invitation email (`sendInvitationEmail`), which is a different, already-solved channel. In-app notifications are for people who already have an account. |
| Invitation | `INVITATION_RESENT` | Never | Same reasoning. |
| Invitation | `INVITATION_CANCELED` | Never | Same reasoning — also, notifying someone that an invitation *they never got to accept* was withdrawn adds no value. |
| Invitation | `INVITATION_ACCEPTED` | Notify only affected users | The inviter (`invitedById`) plausibly wants to know their invite was accepted. Recipient: the single `invitedById` user, if still a member (not "everyone" — this isn't organizationally urgent for anyone else). |
| Portal (`PORTAL_USER`) | `PORTAL_INVITATION_SENT` / `_RESENT` / `_CANCELED` | Never | Same reasoning as staff `INVITATION_SENT`/`_RESENT` — the recipient (a prospective portal contact) has no `PortalUser` row yet to notify, and delivery is already the portal invitation email. |
| Portal (`PORTAL_USER`) | `PORTAL_INVITATION_ACCEPTED` | Notify only affected users | The staff member who sent the invite (`invitedById`) plausibly wants to know their client's contact is now onboarded. Same shape as staff `INVITATION_ACCEPTED`. |
| Portal (`PORTAL_USER`) | `PORTAL_USER_REMOVED` | Future only | The natural recipient is the removed *portal contact themselves* — but a `PortalUser`'s notification inbox is a structurally separate concept from a staff `User`'s (see §4.3), which this design scaffolds for but does not build in Stage 1. Classified future rather than "never" because it's clearly the right rule once portal-side notifications exist, not because it's low-value. |
| Attachment | `FILE_UPLOADED` | Never | High-frequency, low-urgency; already visible on the parent entity's page the moment anyone opens it. |
| Attachment | `FILE_DELETED` | Never | Same reasoning. |

**Summary counts**: 6 never (data-entity CRUD noise) is actually 14 when
every row above is counted individually; 3 notify-immediately; 6
notify-only-affected-users; 5 future-only. The overwhelming majority of
existing Activity volume (every Client/Project/Task/Invoice `CREATED`/
`UPDATED`, every Attachment event, every non-accepted Invitation/Portal
event) is correctly **never** notified — this is intentional. A
notification system that mirrors Activity volume 1:1 is not a
notification system, it's Activity with extra steps and a badge counter
nobody trusts. The value of this feature is entirely in the ~9 rows
classified immediately/affected-only.

**One cross-cutting rule not captured in the table**: **never notify the
actor about their own action.** Every "notify" row above implicitly
excludes the case where the affected user IS the actor (e.g. an OWNER
changing their own role is impossible by the existing invariant, but an
ADMIN inviting themselves is nonsensical and already prevented upstream).
This is enforced once, in the fan-out layer (§4), not re-implemented per
rule.

---

## 3. Notification model

```prisma
enum NotificationType {
  ROLE_CHANGED
  OWNERSHIP_TRANSFERRED
  MEMBER_REMOVED
  INVITATION_ACCEPTED
  PORTAL_INVITATION_ACCEPTED
  INVOICE_STATUS_CHANGED
  // Deliberately not "1:1 with ActivityAction" — see rationale below.
}

model Notification {
  id String @id @default(uuid()) @db.Uuid

  // Every notification belongs to exactly one recipient AND one
  // organization — organizationId is redundant with a join through
  // recipientUserId -> Membership, but kept as a direct scalar because
  // every other org-scoped query in this app filters by organizationId
  // first (see Activity, Attachment) and a notification inbox query must
  // never accidentally read across tenants even if a bug elsewhere let a
  // stale/foreign recipientUserId slip through.
  organizationId String       @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // The recipient. Nullable-by-design split into two mutually exclusive
  // FKs rather than one polymorphic column — see §4.3 for why staff
  // Users and PortalUsers cannot share one recipient column.
  recipientUserId       String?     @db.Uuid
  recipientUser         User?       @relation(fields: [recipientUserId], references: [id], onDelete: Cascade)
  recipientPortalUserId String?     @db.Uuid
  recipientPortalUser   PortalUser? @relation(fields: [recipientPortalUserId], references: [id], onDelete: Cascade)
  // CHECK (recipientUserId IS NOT NULL) != (recipientPortalUserId IS NOT NULL)
  // enforced at the DB level (see §9) — exactly one recipient, never both,
  // never neither.

  // The event that caused this notification, when there is one. Nullable
  // because a future scheduled job (due-date alerts, §7) writes a
  // Notification directly — there is no Activity row for "48 hours until
  // this task is due," the fact is derived at check-time, not recorded as
  // something that "happened." Deliberately NOT a required foreign key
  // for the same reason Activity.entityId isn't one: the source Activity
  // row (or entity) can be deleted later without orphaning/blocking this
  // read history — metadata carries whatever snapshot is needed to render
  // the notification even after that happens.
  activityId String?   @db.Uuid
  activity   Activity? @relation(fields: [activityId], references: [id], onDelete: SetNull)

  type NotificationType

  // Short, plain-text, already-rendered strings — not a template + params
  // pair resolved at read time. Same reasoning as Activity's own
  // "snapshot at write time" philosophy: rendering logic (and the entity
  // names it depends on) can change or disappear after the fact; the
  // notification must still read correctly a year later. Render once, at
  // write time, using the exact same actor/entity names already resolved
  // for the Activity row.
  title String
  body  String?

  // App-relative path only (e.g. "/invoices/{id}/edit"), never an absolute
  // URL or a signed/sensitive link — same constraint Activity's own
  // metadata already follows (never a storagePath or signed URL).
  link String?

  // Snapshot/diff data for anything the UI wants beyond title/body/link
  // (e.g. { fromRole, toRole } to render an icon) — same allowlisted-
  // snapshot discipline as Activity.metadata, never a secret.
  metadata Json @default("{}")

  readAt    DateTime?
  createdAt DateTime  @default(now())

  // Unread-count and inbox-list queries both filter by recipient first —
  // see §5 for the exact query shapes these indexes serve.
  @@index([recipientUserId, readAt, createdAt, id])
  @@index([recipientPortalUserId, readAt, createdAt, id])
  @@index([organizationId, createdAt])
}
```

### Design decisions explained

- **`NotificationType` is its own enum, not a reuse of `ActivityAction`.**
  Only ~9 of the 30 `(entityType, action)` pairs in §2 ever produce a
  notification, and a future capability (comments, mentions, reminders —
  §7) will add notification types that have **no** corresponding
  `ActivityAction` at all (a mention isn't a CRUD event). Coupling the two
  enums would mean either polluting `ActivityAction` with types that never
  appear in the Activity feed, or leaving `NotificationType` unable to
  express a plain-language name for what actually happened. Keeping them
  separate costs one enum; conflating them costs a schema migration the
  first time a non-Activity-shaped notification is needed.
- **`activityId` is nullable and `onDelete: SetNull`**, mirroring exactly
  how `Activity.actorId` already handles "the thing this points at might
  stop existing" — a deleted Activity row (there currently is no delete
  path for Activity, but the pattern is defensive the same way actorId is)
  never blocks or cascades away the notification that came from it.
- **Two nullable recipient FKs instead of one polymorphic
  `recipientId` + `recipientKind`.** A single polymorphic column can't be
  a real foreign key in Postgres/Prisma — it would silently allow a
  `recipientId` that matches neither a `User` nor a `PortalUser`, which is
  exactly the kind of bug the rest of this schema goes out of its way to
  make structurally impossible (see the Client-Portal identity separation
  reasoning already in the schema's own comments). Two real FKs, mutually
  exclusive via a `CHECK` constraint, keep that same guarantee for
  notifications.
- **No separate `read` boolean** — `readAt: DateTime?` doubles as both the
  boolean (`readAt IS NULL` = unread) and the timestamp a future "mark as
  read 3 days ago, dismiss automatically" retention rule could use,
  without adding a second column later.
- **`title`/`body` are rendered strings, not a template key.** This
  mirrors `Activity.metadata`'s own "snapshot, not live lookup" philosophy
  exactly — `formatActivity()` already defensively handles metadata that
  no longer matches what current code expects, and a Notification row
  should have the same guarantee: it must still display correctly even if
  the entity that spawned it is later renamed or deleted, and even if the
  rendering logic that decides its wording changes in a future release. A
  template + params approach could look different retroactively when the
  template changes — undesirable for a historical record the user expects
  to mean what it said when they saw it.

---

## 4. Fan-out model

### 4.1 Where fan-out happens

`createActivity()` is the single existing choke point (§0.2). This design
adds one new function, `notify(tx, activityRow, ...)`, called from
**inside `createActivity()` itself** — not from each of the 17 call
sites individually. Concretely:

```
createActivity(tx, input)
  → tx.activity.create(...)                      // unchanged, existing
  → resolveNotificationRule(input.entityType, input.action)  // §2's table, as data
  → if a rule matches: compute recipients (§4.2/4.3), tx.notification.createMany(...)
```

This is the single most load-bearing decision in this whole document: it
means every one of the 17 call sites keeps working completely unchanged,
and a new call site added in the future gets fan-out for free just by
calling the same `createActivity()` it already has to call for the
Activity row. No call site needs to know or care that notifications
exist. The alternative — a second `notifyUsers(...)` call added to each
of the 17 files individually — is exactly the kind of "thirty places to
remember, guaranteed to eventually drift" problem this codebase's own
`check-no-test-mode.mjs`/security-check philosophy exists to avoid
elsewhere; the same principle applies here at the feature-design level.

### 4.2 Staff-side recipient resolution (one → many)

For each notify-immediately/affected-users rule in §2, the recipient set
is computed from `Membership` rows read inside the same transaction —
never trusted from anywhere else:

| Rule | Recipients | Query shape |
|---|---|---|
| `ROLE_CHANGED` | The single affected member | `WHERE Membership.id = <target>` (already loaded by the calling action) |
| `OWNERSHIP_TRANSFERRED` | The two involved members | The `previousOwnerId`/`newOwnerId` already resolved by `changeRoleAction` |
| `MEMBER_REMOVED` | The single removed member | Already loaded (`target.userId`) — note: their `Membership` row is gone by the time this fires, so the notification's `recipientUserId` points at the `User` directly, not through a `Membership` that no longer exists |
| `INVITATION_ACCEPTED` / `PORTAL_INVITATION_ACCEPTED` | The single inviter | `invitation.invitedById` (already a column on the row being processed) |
| `INVOICE_STATUS_CHANGED` | Every OWNER/ADMIN in the org | `SELECT userId FROM Membership WHERE organizationId = ? AND role IN (OWNER, ADMIN)` — this is the one genuine **one → many** fan-out among the current rule set |
| Client/Project/Invoice `DELETED` (if ever promoted out of "narrow" — see §2) | Every OWNER/ADMIN | Same query as above |

**"Notify everyone in an organization"** (the third fan-out shape the
brief asks about) has no rule in §2's table that needs it today — every
rule that isn't single-recipient narrows to OWNER/ADMIN, not literally
every `Membership` row. This is a deliberate, current-state fact, not a
gap: broadcasting to every `MEMBER` too is straightforward to add later
(drop the `role IN (OWNER, ADMIN)` filter) the day a rule needs it, and
the fan-out mechanism below doesn't care how large the recipient set is.

**The actor-exclusion rule (§2's cross-cutting note)** is applied once,
here: whatever recipient set is computed, `WHERE userId != actorId` is
always the final filter before `createMany`.

### 4.3 Portal-side recipient resolution — deliberately out of scope for Stage 1's build, scaffolded in the schema

`PORTAL_USER_REMOVED` is the only rule in §2 classified "future" purely
because its recipient is a `PortalUser`, not a `User`. The schema in §3
already has `recipientPortalUserId` so this isn't a schema change away —
but Stage 1's proposal is to **ship the staff-side fan-out first**
(§4.2's rules only) and defer wiring an actual portal-side rule until a
portal-facing notification UI exists (§6 doesn't design one; there's no
portal bell today). Building the recipient-resolution logic without a
place to surface it would be dead code with no test coverage, worse than
not building it yet.

### 4.4 Idempotency and the same transaction guarantee

`tx.notification.createMany(...)` runs inside the exact same
`prisma.$transaction` block as the `Activity` row and the business
mutation. If the notification insert fails, the whole mutation rolls back
— identical to how a failed `Activity` insert already rolls back a
`Client` create today. This is a deliberate consistency choice: a
notification for an event whose underlying mutation didn't actually
happen would be worse than no notification at all (it's a false claim
about something that occurred), so "notification and event are one
atomic unit" is the safer failure mode, matching the existing
Activity-and-mutation atomicity exactly.

---

## 5. Read model

All of the following mirror the Activity feed's already-proven query
shape (§0.3) rather than inventing a new pagination convention.

### Unread count

```sql
SELECT count(*) FROM "Notification"
WHERE "recipientUserId" = $1 AND "readAt" IS NULL
```
Served by the `[recipientUserId, readAt, createdAt, id]` index — `readAt
IS NULL` is a highly selective prefix match on that index (unread
notifications are a small, bounded fraction of a user's total inbox once
old ones are marked read or pruned — see §8's retention policy), so this
is a fast index-only count, not a full-table scan even as history grows.

Displayed as a capped badge (`"9+"` past some threshold, e.g. 9 or 99 —
a UI decision, §6) rather than an always-exact number past a point where
the exact count stops being useful and starts being expensive to keep
live-updating.

### Inbox listing (paginated)

Cursor-paginated exactly like `/activity`:

```sql
SELECT * FROM "Notification"
WHERE "recipientUserId" = $1
  AND ("createdAt", "id") < ($cursorCreatedAt, $cursorId)   -- keyset, not OFFSET
ORDER BY "createdAt" DESC, "id" DESC
LIMIT 21   -- PAGE_SIZE + 1, to detect hasMore, same as Activity
```

Same `{createdAt, id}` base64url cursor shape and encode/decode helpers
as `src/lib/activity/cursor.ts` — no new pagination primitive to design,
test, or explain to a future contributor. Unread and read notifications
appear in one unified, reverse-chronological list (no separate "unread
tab" by default) — a dropdown/panel showing only-unread-until-you-clear-
them, with an explicit "show all" toggle, is a UI-layer decision (§6), not
a query-layer one; the underlying query supports both by adding
`AND readAt IS NULL` to the same statement.

### Mark one as read

```sql
UPDATE "Notification" SET "readAt" = now()
WHERE id = $1 AND "recipientUserId" = $2 AND "readAt" IS NULL
```
Scoped by `recipientUserId` in the `WHERE`, not just `id` — identical to
every other "mutate my own row" pattern in this app (Client/Project/Task/
Invoice updates all scope by `{id, organizationId}` together, never by
`id` alone, specifically so a crafted request for someone else's id can
never succeed). `AND readAt IS NULL` makes a duplicate double-click a
no-op rather than needlessly rewriting the same timestamp.

### Mark all as read

```sql
UPDATE "Notification" SET "readAt" = now()
WHERE "recipientUserId" = $1 AND "readAt" IS NULL
```
Same index as the unread count serves this directly — bulk update over an
already-narrow, indexed row set.

### Ordering

Newest-first everywhere (`createdAt DESC, id DESC`), no alternative sort
— this matches the Activity feed and avoids giving the notification
dropdown a second, different mental model from the one users already have
for "look at recent things in this app."

---

## 6. UI

### Notification bell

Placed in `Header.tsx`, between the `OrganizationSwitcher` and the
`email`/`Sign out` group — an icon-only button (reusing this app's
existing hand-built icon convention, `src/components/ui/icons.tsx`, no new
icon library) with an `aria-label="Notifications"`, consistent with every
other icon-only control in this codebase (`DeleteButton`, `PencilIcon`
links) already carrying accessible names rather than relying on visual
context alone.

### Unread badge

A small filled circle at the bell's top-right corner, showing the capped
count from §5 (empty/no badge at zero — never a visible "0"). Styled as a
genuinely new small component, but following the same "no icon library,
plain Tailwind, `src/components/ui`" convention as `StatusBadge` and every
other badge-shaped element already in this app — not a new pattern to
learn.

### Dropdown vs. side panel

**Dropdown**, not a side panel, for the same reason `OrganizationSwitcher`
already is one: this app has no existing side-panel/drawer pattern
anywhere (confirmed — the only overlay primitive in the whole codebase is
`ConfirmDialog`'s native `<dialog>`, used for confirmations, not content
browsing), and introducing a second overlay paradigm just for
notifications is more new UI surface than the feature's actual value
justifies at this stage. The dropdown shows the most recent ~10
notifications with each row's `title` (bold if unread), a relative
timestamp, and a "View all" link at the bottom that goes to a real
`/notifications` page — which is exactly where the *full*, filterable,
paginated inbox lives, reusing `/activity`'s own list/section/EmptyState
component conventions almost verbatim. The dropdown is a *preview*, the
page is the actual read model surface from §5.

### Mobile behavior

`Sidebar.tsx` already collapses to a horizontal top bar below `md:` —
the bell stays in the header at every breakpoint (the header itself
doesn't collapse the same way the sidebar does), but the dropdown becomes
a full-width sheet anchored under the header rather than a small
floating panel, since a narrow floating dropdown is the first thing that
breaks on a small viewport. This is the same responsive philosophy this
app already uses for search/filter bars — a component that changes its
own layout at a breakpoint, not a second component tree for mobile.

---

## 7. Future compatibility

The schema in §3 is designed so every one of the following needs **zero**
schema changes — only new `NotificationType` enum values and new
fan-out rules (§4), which is exactly the extension point this design
puts all its flexibility into, on purpose.

- **Comments**: a future `Comment` model's create action calls
  `createActivity()` (a new `entityType: COMMENT`, `action: CREATED`)
  exactly like every existing entity — the fan-out hook in §4.1 already
  fires for any `createActivity()` call, so a comment-notification rule
  is a new row in §2's rule table, not new plumbing.
- **Mentions**: a `@mention` inside a comment/note body is detected at
  write time (parsing the text for `@name` before it's saved, the same
  place `changedFields` is already computed for Client/Task edits), and
  produces its own `Notification` row with `activityId` pointing at the
  comment's Activity row and `metadata: { mentionedUserId }` — no new
  column, since `metadata: Json` already exists for exactly this kind of
  per-type-specific extra data.
- **Reminders / due date alerts**: the one future capability that
  genuinely needs new infrastructure this codebase doesn't have yet — a
  scheduled job (there is no cron/scheduler of any kind today; Vercel Cron
  or a similar external trigger would call a new Route Handler). That job
  reads `Task`/`Invoice` rows directly (the same `dueDate < now`
  derivation the dashboard already does) and writes `Notification` rows
  with `activityId: null` — this is *exactly* why `activityId` is nullable
  in §3, not an afterthought.
- **Email notifications**: this app already has an email-sending
  abstraction (`src/lib/email/invitations.ts`, using Resend, with a
  documented "falls back to Copy Link if delivery fails" pattern). A
  future "email me my notifications" preference reuses that same
  abstraction; the `Notification` row's already-rendered `title`/`body`
  (§3) are exactly what an email template needs — no separate rendering
  path to build.
- **Push notifications**: needs a new `PushSubscription` model (device
  token per user) entirely outside the `Notification` table itself — the
  existing `Notification` row is still the single source of truth for
  *what* to tell someone; push is just one more delivery channel reading
  from it, the same relationship email will have.
- **Digest emails**: a scheduled job groups unread `Notification` rows by
  `recipientUserId` created since the last digest and renders them into
  one email — needs no new field on `Notification` beyond what's already
  there (a `digestedAt` timestamp, if ever needed to avoid re-including a
  row, is one more nullable column added when that feature actually
  ships, not before).

None of the above requires touching `recipientUserId`/
`recipientPortalUserId`, the notify-vs-never classification mechanism, or
the read-model queries in §5 — they all extend §2's rule table and §4's
fan-out, which is precisely the seam this design draws the line at.

---

## 8. Performance

### Expected query patterns

- **Unread count**: fired on every authenticated page load (to keep the
  header badge current) — must be cheap. Index-served, per §5.
- **Inbox listing**: fired on dropdown open and on `/notifications` page
  load/pagination — bounded by `LIMIT 21`, never a full scan.
- **Write (fan-out)**: `createMany` of at most a handful of rows per
  event (bounded by org size — see below), inside the existing
  transaction, so it adds one more statement to an already-open
  transaction, not a new round trip.

### Indexes

Already specified in §3:
- `[recipientUserId, readAt, createdAt, id]` — serves unread count, mark-
  all-read, and the default (unread-first) dropdown view.
- `[recipientPortalUserId, readAt, createdAt, id]` — same shape, for the
  portal side once §4.3 is built.
- `[organizationId, createdAt]` — for any future admin/ops view ("what
  did this org get notified about"), not on the per-user hot path but
  cheap to maintain and consistent with every other table in this schema
  already indexing `organizationId` first.

### Cleanup strategy

This app already has exactly one precedent for "old data that
accumulates and needs sweeping": the in-memory rate-limit store
(`src/lib/rate-limit/store.ts`), which sweeps expired entries
opportunistically. `Notification` rows are durable (Postgres, not
in-memory) so the same *mechanism* doesn't apply, but the same
*principle* does — don't let an ever-growing table go unmanaged.
Concretely: a scheduled job (the same infrastructure §7's due-date-alert
job needs — one scheduler serving both from day one it exists) deletes
`Notification` rows where `readAt IS NOT NULL AND readAt < now() -
interval '90 days'`. Read notifications are the safe thing to prune —
they're a "have you seen this" record, not a permanent audit log (that's
what `Activity`, which is genuinely append-only forever, already is).

### Retention

- **Read notifications**: 90 days from `readAt` (above).
- **Unread notifications**: never auto-deleted by age alone — an unread
  notification represents something the recipient hasn't yet acknowledged
  seeing, and silently removing it changes what actually happened to the
  user's inbox without their action. (A very old unread notification
  about something now stale, e.g. a role that's since changed twice more,
  is a UI/product question — "still show it, worded plainly" — not a
  reason to delete a record the user never dismissed.)
- **On recipient deletion**: `onDelete: Cascade` from both
  `recipientUserId` and `recipientPortalUserId` (§3) — a notification for
  a `User`/`PortalUser` that no longer exists has no reader and no reason
  to be retained, unlike `Activity`, which is deliberately kept even after
  its actor is gone (organizational history vs. personal inbox are
  different retention questions).

### Scale expectations

The README describes this product's target market as "freelancers and
small agencies" — every `Membership`-based fan-out in §4.2 is bounded by
org size, which this product's own positioning implies stays small (tens
of members at the very most, not thousands). `createMany` of a few dozen
rows per event, worst case, is not a performance concern at this stage;
this section exists to name the assumption explicitly so it's revisited
if the product's target market ever changes, not because today's numbers
require any special-casing.

---

## 9. Migration strategy — zero regression

1. **New models only, no changes to existing tables.** `Notification` and
   `NotificationType` are additive — no column is added to `Activity`,
   `User`, `PortalUser`, `Organization`, or any business entity. A
   migration that only adds new tables/enums cannot regress any existing
   query, index, or constraint; every existing `prisma migrate deploy`,
   test suite, and Server Action keeps working unchanged the moment this
   migration lands, before a single line of fan-out code exists.
2. **The mutually-exclusive-recipient `CHECK` constraint** (§3) is added
   in the same migration as the table itself, not bolted on after —
   avoiding a window where invalid rows (both recipients null, or both
   set) could exist even transiently.
3. **`createActivity()` gains its fan-out hook (§4.1) as a second,
   separate change**, deployed after the schema migration, gated so that
   an empty §2 rule table (or a rule table returning "no notification for
   this action") is indistinguishable from the feature not existing at
   all — the safest possible default is "matches nothing," so the very
   first deploy of the fan-out hook can ship with the rule table
   populated incrementally, one rule at a time, verified against real
   Activity volume before the next rule is enabled. This mirrors exactly
   how `TEST_MODE` and the E2E harness were introduced in this codebase's
   own recent history: a single, narrow, always-checkable gate, expanded
   deliberately rather than all at once.
4. **UI ships last.** The bell/dropdown/`/notifications` page (§6) are the
   final piece, added only once real rows exist to show — there is no
   value (and real risk of an empty, confusing badge) in shipping UI
   before the write path has been exercised in production for at least
   the first notify-immediately rule (`ROLE_CHANGED` is the simplest
   single-recipient case — the natural first rule to enable).
5. **Every existing test suite stays green throughout.** None of
   `test/unit/`, `test/integration/`, or `test/e2e/` needs a single
   existing test changed by this work — no existing Activity-related
   assertion depends on whether a `Notification` row was also written,
   since nothing in the current codebase reads the `Notification` table.
   New tests are additive, following this repo's existing layering
   exactly (per `docs/testing.md`): a unit test per notification-rule
   classifier, an integration test proving the fan-out `createMany`
   happens inside the same transaction as its `Activity` row (mirroring
   how `test/integration/activity/creation.test.ts` already proves
   Activity rows are written correctly), and — only once the UI exists —
   one or two E2E happy-path scenarios (an admin sees a badge; a role
   change produces a notification for the affected member), not a
   duplicate of every rule already covered at the integration layer, for
   the exact reason `docs/testing.md` already gives for why E2E stays
   deliberately small.
