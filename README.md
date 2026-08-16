# CityTrace

Civic complaint management platform. Citizens report civic issues; the report
is triaged and routed to a department; field officers carry out the work and
submit photographic proof; supervisors and the reporting citizen verify it
before anything closes.

Previously named NagrikSetu. Some backend identifiers still carry the old name
on purpose — see [Naming](#naming).

## Stack

- **Next.js 16** (App Router) with React 19 and the React Compiler
- **TypeScript**, **Tailwind CSS v4** (CSS-first config, tokens in `src/app/globals.css`)
- **shadcn/ui** primitives over Radix
- **Supabase** — Postgres, Auth, Storage, RLS
- **Leaflet** / react-leaflet for maps, **Recharts** for analytics,
  **Framer Motion** for motion, **sonner** for toasts

Note that this Next.js version renames middleware to `proxy.ts` at the repo
root. See `AGENTS.md`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open http://localhost:3000.

Without Supabase credentials the app still builds and renders, but every
Supabase-backed screen will show its error state. That is by design, not a
failure.

### Environment

See `.env.example`. Only two variables are required, both public
(browser-exposed) by design:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |

No service-role key is used anywhere in the client. Access control is enforced
by Postgres row-level security, so the publishable key is safe to ship — but
that means **the RLS policies are the security boundary**.

### Database

Migrations live in `supabase/migrations/` and run in filename order:

```bash
supabase db push
```

There is no state that exists only in the Supabase dashboard — buckets,
storage policies, triggers, reference data and the analytics functions are
all migrations, so a fresh project reproduces a working database exactly.

**One manual step is required.** Every profile is created as a `citizen`
and nothing in the UI can change a role, so a new deployment has no staff
until an administrator is appointed by hand after the first sign-up:

```sql
select public.set_user_role(
  (select id from auth.users where email = 'you@example.com'),
  'government_admin'
);
```

That administrator can then appoint everyone else from the app.
[`supabase/README.md`](supabase/README.md) covers this in full, along with
what each migration does, the storage path conventions and the row-level
security model.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `./supabase/tests/run.sh` | Apply the migrations to a throwaway PostgreSQL cluster and exercise every RLS policy and authorization rule |
| `./scripts/verify-route-protection.sh` | Build, serve, and assert that no protected route is reachable without a session |

## Project layout

```
src/app/           routes: /, /auth/*, /citizen/*, /officer/*, /government/*
src/components/    ui/ (shadcn), layout/ (shell), shared/, map/, charts/, report/
src/lib/auth/      role→workspace map and the server-side workspace guard
src/lib/design/    status + motion systems — single source of truth
src/lib/services/  Supabase and data access
src/lib/supabase/  browser and server clients
src/proxy.ts       session refresh + route authorization (must sit beside app/)
supabase/          migrations and the RLS test suite
docs/              implementation audit
```

## Roles and authorization

Four roles, defined by the `public.user_role` enum:

| Role | Lands on | Workspaces | Can |
| --- | --- | --- | --- |
| `citizen` | `/citizen` | citizen | File reports, correct and track their own, reopen an unsatisfactory repair |
| `officer` | `/officer` | officer | Work their own assignments and submit proof |
| `supervisor` | `/officer` | officer, government | Oversee field work, verify submitted proof, read city-wide |
| `government_admin` | `/government` | officer, government | Assign work, triage, city analytics, appoint staff |

Administrators need the officer workspace because the authority queue
links straight to `/officer/work-orders/[id]` — that page is where an
assignment is inspected.

### Three layers, in order of authority

1. **Row-level security** is the boundary. It is the only layer a direct
   PostgREST call has to get past, and the publishable key is in every
   browser, so anything that matters is enforced here. Policies decide
   which rows; triggers decide which columns, because RLS cannot.
2. **`src/proxy.ts`** refreshes the session and redirects: no session to
   the login page carrying `?next=`, wrong role to that user's own
   workspace, already signed in away from the auth pages. It must sit
   beside `app/` — at the repository root Next.js silently ignores it.
3. **Workspace layouts** re-check server-side via
   `requireWorkspace()`. Redundant with the proxy on purpose: one check
   in one file is one point of failure, and reading cookies also stops
   protected shells being prerendered and served from a CDN.

Role comes from `public.profiles` and nowhere else. It is never read
from `user_metadata`, which the user can write at sign-up.

Both layers are asserted, not assumed:
`./supabase/tests/run.sh` for the database and
`./scripts/verify-route-protection.sh` for the routes.

## Current state

Officer and government screens read live database state. The completion
matrix and the recommended order of remaining work are in
[`docs/IMPLEMENTATION_AUDIT.md`](docs/IMPLEMENTATION_AUDIT.md).

Its Phase 0 security items are now closed — route protection, the
unauthenticated debug route, the constant-password path in `authService`,
and the `user_metadata.role` fallback. See
[Roles and authorization](#roles-and-authorization).

The citizen path — report, triage, track — is complete: submission is
idempotent, coordinates and text are validated server-side, evidence
uploads are retryable, and the tracking timeline is built from recorded
transitions rather than inferred from the current status. See
[supabase/README.md](supabase/README.md#the-complaint-lifecycle).

Known functional gaps: complaints are not assigned to a ward (the `wards`
table has no geometry to derive one from), nothing writes to the
`notifications` table yet — the in-app feed is derived from complaint
state instead — and there is no UI for a supervisor to record a verdict or
for a citizen to reject a repair, though the database supports both.

## Naming

User-facing copy says CityTrace. Several backend identifiers deliberately keep
the historical `nagriksetu` spelling because their values are already written
into database rows, and renaming them would make new records inconsistent with
existing ones:

- the `NS-` complaint-number prefix
- the AI model name recorded in `complaints.ai_model`
- legacy placeholder email domains in `services/auth.ts`

## Licence

Built for the Smart India Hackathon.
