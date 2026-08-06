# Client Portal CRM

A lightweight CRM for freelancers and small agencies to manage clients, projects, tasks, and invoices — built with Next.js App Router, Prisma, and Supabase.

> Portfolio project. Every module (Clients, Projects, Tasks, Invoices) is a complete CRUD slice with search, filtering, sorting, and pagination, built on Server Components and Server Actions with no client-side data-fetching library.

## Live demo

**[client-portal-crm.vercel.app](https://client-portal-crm.vercel.app)**

Demo credentials:

| | |
|---|---|
| Email | `demo@clientportal.dev` |
| Password | `DemoPassword123!` |

This account is seeded via `prisma/seed.ts` (see [Database setup](#database-setup-prisma)) and comes preloaded with sample clients, projects, tasks, and invoices.

## Screenshots

| | |
|---|---|
| **Dashboard** — live metrics and recent activity | **Clients** — search, filter, sort, pagination |
| ![Dashboard](docs/images/dashboard.png) | ![Clients](docs/images/clients.png) |
| **Projects** | **Tasks** |
| ![Projects](docs/images/projects.png) | ![Tasks](docs/images/tasks.png) |
| **Invoices** | **Login** |
| ![Invoices](docs/images/invoices.png) | ![Login](docs/images/login.png) |

## Features

- **Auth** — email/password sign-up and login via Supabase Auth, session refresh handled in middleware, protected routes redirect unauthenticated users.
- **Clients, Projects, Tasks, Invoices** — full CRUD for each, with ownership enforced at the database query level, not just the UI.
- **Search, filter, sort, pagination** — server-side, URL-param-driven (`?q=&status=&sort=field:dir&page=`), so state survives a refresh and is shareable as a link. No client-side filtering, no debounce library.
- **Dashboard** — live metrics (client count, active projects, open/overdue tasks, unpaid invoices, outstanding amount) and recent-activity feeds, computed with concurrent Prisma queries.
- **Toast notifications** — success feedback for create/update/delete/login/signup, implemented as a small custom Context provider (no toast library).
- **Accessible confirmation dialog** — destructive actions (delete) confirm via the native `<dialog>` element, not `window.confirm`.
- **Error boundaries** — custom 404, global error boundary, and scoped error boundaries for the dashboard and auth route groups.
- **Seed script** — creates two working demo accounts (real Supabase Auth users, not just database rows) with realistic sample data.

## Architecture

- **Rendering model**: every list/detail page is a Server Component. Data is fetched directly with Prisma inside the page — there is no client-side data-fetching layer (no SWR/React Query) and no global client state store.
- **Mutations**: all writes go through Next.js Server Actions (`"use server"` functions), colocated with the route that uses them (e.g. `app/(dashboard)/clients/new/actions.ts`). Forms use React's `useActionState` for pending/error state.
- **Auth**: Supabase Auth issues a session via cookies. `middleware.ts` refreshes that session on every request. Route protection itself happens in `app/(dashboard)/layout.tsx`, which redirects to `/login` if there's no session — this one check gates every page under the dashboard shell.
- **Data ownership model**: every row is reachable back to the authenticated user, either directly or through a relation:
  - `Client.userId → User`
  - `Project.ownerId → User`
  - `Task` → scoped through `project.ownerId` (no redundant `userId` column on `Task`)
  - `Invoice` → scoped through `project.ownerId`; `Invoice.clientId` is still stored (required by the schema) but is always **derived** from the selected project in the server action, never taken from form input.
- **Auth-to-database identity**: `User.id` is set to the Supabase Auth user's UUID directly (no separate mapping table). `getOrCreateUser()` (`src/lib/current-user.ts`) upserts the Prisma `User` row on first authenticated request.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL (via Supabase) |
| ORM | Prisma 7, with the `@prisma/adapter-pg` driver adapter |
| Auth | Supabase Auth (`@supabase/ssr`, cookie-based sessions) |
| Hosting target | Vercel |
| Seed runner | `tsx` (dev-only, runs `prisma/seed.ts`) |

No UI component library, no client-side state library, no toast library, no icon library — status badges, tables, dialogs, toasts, and icons are all small hand-built components under `src/components/ui`.

## Project structure

```
prisma/
  schema.prisma            # data model
  migrations/               # applied migrations
  seed.ts                   # demo data (creates real Supabase auth users too)

src/
  app/
    (auth)/                 # /login, /signup — public
      login/, signup/
      error.tsx
    (dashboard)/             # protected route group, shares one layout
      layout.tsx             # auth check + Sidebar + Header shell
      dashboard/              # metrics + recent activity
      clients/, projects/, tasks/, invoices/
        page.tsx              # list: search/filter/sort/pagination
        query.ts               # param parsing + Prisma where/orderBy builder
        new/                    # create form + action
        [id]/edit/               # edit form + action
        actions.ts              # delete action
        loading.tsx             # route-level skeleton
      error.tsx
    global-error.tsx
    not-found.tsx
    layout.tsx                # root layout — fonts, metadata, ToastProvider

  components/
    ui/                      # Button, Input, Select, Table, StatusBadge,
                               # ConfirmDialog, DeleteButton, EmptyState, …
    list/                    # SearchFilterBar, Pagination, AutoSubmitSelect
    layout/                  # Sidebar, Header
    toast/                   # ToastProvider, ToastListener
    dashboard/               # MetricCard
    clients/ projects/ tasks/ invoices/   # per-module form components

  lib/
    prisma.ts                # Prisma client singleton (driver adapter)
    current-user.ts          # getOrCreateUser()
    list-params.ts           # shared search/sort/pagination param parsing
    toast-url.ts             # post-redirect toast helper
    format.ts                # currency + status-label formatting
    validation/               # per-entity form validation
    supabase/
      server.ts               # Supabase server client
      middleware.ts            # session refresh, used by root middleware.ts

  types/index.ts             # shared form-state types

middleware.ts                 # calls updateSession on every request
```

## Setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is enough)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your Supabase project's values (see [Environment variables](#environment-variables) below):

```bash
cp .env.example .env
```

### 3. Set up the database

Follow [Database setup](#database-setup-prisma) below to apply the schema (and optionally seed demo data).

### 4. Run the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Where to find it | Used by |
|---|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (**Transaction** pooler, port 6543) | App runtime (Prisma client) |
| `DIRECT_URL` | Same page, **Session** pooler (port 5432) | Prisma CLI: migrations, `db seed`, `validate` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Supabase client (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Supabase client (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**keep secret**) | `prisma/seed.ts` (bypasses RLS to create demo auth users), and at runtime by File Attachments' Supabase Storage admin client (`src/lib/storage/admin-client.ts`) — server-only, never sent to the browser. |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys (**keep secret**) | Server-only — sends team invitation emails (`src/lib/email/`). Optional: if unset, invites/resends still work, they just fall back to "created, but the email could not be sent" and the Copy link button. |
| `INVITATION_FROM_EMAIL` | Any address on a domain verified in your Resend account | The "From" address on invitation emails. |
| `APP_BASE_URL` | Your deployed app's URL (e.g. `https://your-app.vercel.app`) | Server-only — builds the `/invite/{token}` link inside invitation emails. Optional on Vercel (falls back to the auto-provided `VERCEL_URL`, then to `http://localhost:3000` in dev). |
| `CRON_SECRET` | Generate your own (e.g. `openssl rand -base64 32`) | Server-only — required by every `/api/cron/*` route (notification delivery retry, notification cleanup). Vercel Cron sends it back as `Authorization: Bearer <value>` on every scheduled call (see [Deployment](#deployment-vercel) below). Without it set, cron routes reject everything with 401. |

No real values are shown here — copy `.env.example` to `.env` and fill in your own Supabase project's credentials.

`DATABASE_URL` uses the pgbouncer transaction pooler because it's what the deployed app talks to under serverless/edge concurrency. `DIRECT_URL` bypasses the pooler because schema migrations need a session-scoped connection — this split is configured in `prisma.config.ts` (CLI operations use `DIRECT_URL`) and `src/lib/prisma.ts` (the app's runtime client uses `DATABASE_URL`).

## Database setup (Prisma)

The data model lives in `prisma/schema.prisma` (`User`, `Client`, `Project`, `Task`, `Invoice`, plus their status/priority enums) and is versioned as SQL migrations under `prisma/migrations/`.

1. **Apply the schema** to your database (non-interactive, safe for a fresh database or CI):

   ```bash
   npx prisma migrate deploy
   ```

2. **(Optional) Seed demo data.** Requires `SUPABASE_SERVICE_ROLE_KEY` to be set — the seed script (`prisma/seed.ts`) creates two real Supabase Auth accounts via the Admin API, then fills them with realistic sample clients, projects, tasks, and invoices:

   ```bash
   npm run db:seed
   ```

   This prints the demo login credentials (email + password) to the console.

3. **(Optional) Browse the database** with Prisma Studio:

   ```bash
   npx prisma studio
   ```

During active development, use `npx prisma migrate dev` instead of `migrate deploy` when you change `schema.prisma` — it creates a new migration file and applies it in one step.

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import it in Vercel.
3. Add the environment variables above in Vercel's Project Settings → Environment Variables (`SUPABASE_SERVICE_ROLE_KEY` only if you intend to run the seed script against production, which most people won't; `RESEND_API_KEY`/`INVITATION_FROM_EMAIL`/`APP_BASE_URL` only if you want invitation emails actually delivered instead of falling back to Copy link; `CRON_SECRET` is required for the background jobs below to run at all).
4. Vercel runs `next build` automatically. Make sure migrations have already been applied to the target database (`npx prisma migrate deploy`, run locally against the production `DIRECT_URL` or via a CI step) — the build does not run migrations for you.
5. Deploy.

No further configuration is needed — there's no separate backend to deploy; Server Actions run as part of the Next.js deployment itself.

### Background jobs (Vercel Cron)

Two scheduled jobs, defined in `vercel.json`, retry failed notification
emails and clean up old read notifications — see
`docs/notifications-architecture.md`'s cron section for the full retry/
cleanup policy. Both are gated by `CRON_SECRET` (`src/lib/cron/auth.ts`);
Vercel automatically sends it as `Authorization: Bearer <CRON_SECRET>` on
every scheduled invocation once the env var is set in Project Settings —
no extra configuration needed beyond adding that one variable.

**Vercel plan note**: this project assumes a **Hobby** plan, which caps
Cron Jobs at once per day *per job*. Both jobs below are scheduled daily
as a result — the delivery retry job's ideal cadence (every 15–30
minutes) needs a **Pro** plan or higher; if you're on Pro, tighten
`vercel.json`'s schedule for `/api/cron/notification-delivery` accordingly.

## Security approach

- **Every query is ownership-scoped.** Reads and writes filter by `userId`/`ownerId` (directly or via a relation), never by primary key alone. Delete/update operations use Prisma's `updateMany`/`deleteMany` with a compound `{ id, ownerId }`-style `where`, since Prisma's unique-`where` `update()`/`delete()` can't express "this id, but only if it's mine" in one atomic query.
- **404, not a permission error, on cross-user access.** Trying to open another user's record by guessing its id returns the same `notFound()` response as a record that doesn't exist at all — nothing distinguishes "not yours" from "doesn't exist."
- **Foreign keys are always re-verified server-side.** A create/edit form's `<select>` only ever lists the current user's own clients/projects, but that's a UI convenience, not the security boundary — every action independently re-checks that a submitted `clientId`/`projectId` actually belongs to the authenticated user before writing.
- **The service-role key never reaches the app.** It's used exclusively by `prisma/seed.ts` (a local/CI-only script) to provision demo accounts through the Supabase Admin API. Application code only ever uses the anon key + session cookies.
- **Per-tenant uniqueness, not global.** `Client.email` and `Invoice.invoiceNumber` are unique per owning user/client (composite unique constraints), not globally — so two different freelancers' businesses never collide with each other over something as common as an email address or invoice numbering scheme.
- **CLI vs. runtime connections are separated.** Prisma CLI operations (migrate, seed) use a direct, non-pooled connection (`DIRECT_URL`); the deployed app uses the pooled connection (`DATABASE_URL`) — configured once in `prisma.config.ts`, so there's no risk of migrations accidentally running through a connection pooler that doesn't support them well.
- **No public Supabase Data API access.** A migration (`prisma/migrations/20260802120937_lockdown_public_schema_grants`) revokes `anon`/`authenticated` privileges on every table in the `public` schema — the app talks to Postgres exclusively through Prisma, not PostgREST, so there's no table-level REST endpoint a client-side request could hit directly.
- **Hardened session cookies.** Supabase session cookies are written with one shared `cookieOptions` config (`getSupabaseCookieOptions()` in `src/lib/supabase/cookie-options.ts`), applied at every `createServerClient(...)` call site — `npm run security:check` flags any call site missing it.
- **HTTP security headers on every response.** `next.config.ts` sets a Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a restrictive `Permissions-Policy`, applied to every route including API routes.
- **Application-level rate limiting.** Sensitive actions (e.g. accepting an invitation, downloading an attachment) are rate-limited in-process (`src/lib/rate-limit`), independent of any platform-level limiting.

## Testing

Three layers — unit (pure logic), integration (real Prisma against a real
PGlite-backed Postgres), and E2E (real Chromium against a real production
build) — plus a set of static security checks. See
[`docs/testing.md`](docs/testing.md) for the full architecture, how to run
each layer locally and in CI, what's deliberately not covered at the E2E
layer and why, and the TEST_MODE identity/Storage bypass E2E relies on
(and how it's verified to never affect a real deployment).

## CI

GitHub Actions (`.github/workflows/`) run on every pull request:

- **`ci-fast.yml`** — `prisma validate`, type-check, lint, build, static security checks, unit tests.
- **`ci-integration.yml`** — integration tests, then a production build and the Playwright E2E suite.

Both are intended to be green before merging a pull request.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run db:seed` | Seed demo data (see [Database setup](#database-setup-prisma)) |
| `npx prisma migrate dev` | Create/apply a migration in development |
| `npx prisma migrate deploy` | Apply pending migrations (production-safe, non-interactive) |
| `npx prisma studio` | Browse the database |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests against a real PGlite-backed Postgres |
| `npm run test:e2e` | Playwright E2E — run `npm run build` first (see [`docs/testing.md`](docs/testing.md)) |
| `npm run security:check` | Static security checks (`scripts/security-checks/`) |

## Roadmap

Ideas for future iterations. None of these are implemented yet:

- **Enforce the `Role` field.** `User.role` (`OWNER` / `ADMIN` / `MEMBER`) already exists in the schema but isn't checked anywhere in the app — every authenticated user currently has full access to their own data only. A real multi-user/team mode would need role-based permission checks in the Server Actions.
- **Team/shared workspaces.** Today every `Client`/`Project` is owned by exactly one `User`; there's no concept of a team sharing the same clients.
- **File attachments** on clients, projects, or invoices (e.g. contracts, deliverables) — no file storage is wired up yet.
- **Invoice PDF export / email delivery** — invoices currently exist only as database records with a status field; there's no PDF generation or send-by-email flow.

## Billing (foundation only, not connected)

A provider-neutral billing foundation exists in code — see
[`docs/billing-architecture.md`](docs/billing-architecture.md): a
`Subscription`/`WebhookEvent` schema, a typed plan catalog, organization
entitlements, and server-side limit enforcement on a small set of write
paths (staff invites, Client/Project creation, Attachment uploads). **No
payment provider is connected** (no SDK, no checkout, no webhooks, no
customer portal), **no billing UI exists**, and **live billing is
disabled** — nothing in this repository can charge a real customer.
Provider eligibility (Paddle vs. Stripe) for this project is still an open,
unverified item pending legal/provider review (see the architecture doc's
own §16/§2).

## License

Portfolio project — no license specified.
