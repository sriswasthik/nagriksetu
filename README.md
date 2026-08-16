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
| `./supabase/tests/run.sh` | Apply the migrations to a throwaway PostgreSQL cluster and exercise every RLS policy |

## Project layout

```
src/app/           routes: /, /auth/*, /citizen/*, /officer/*, /government/*
src/components/    ui/ (shadcn), layout/ (shell), shared/, map/, charts/, report/
src/lib/design/    status + motion systems — single source of truth
src/lib/services/  Supabase and data access
src/lib/supabase/  browser and server clients
supabase/          migrations and the RLS test suite
docs/              implementation audit
```

## Roles

Four roles, defined by the `public.user_role` enum:

| Role | Workspace | Can |
| --- | --- | --- |
| `citizen` | `/citizen` | File reports, track their own, confirm or reject a repair |
| `officer` | `/officer` | Work their own assignments and submit proof |
| `supervisor` | `/government` | Everything an officer can see, plus verify submitted proof |
| `government_admin` | `/government` | Assign work, view city-wide analytics, appoint staff |

Enforced in the database, not the client: a citizen cannot read another
citizen's report or advance a work order regardless of what the browser
sends. `./supabase/tests/run.sh` asserts both halves of each rule.

## Current state

Officer and government screens read live database state. The completion
matrix and the recommended order of remaining work are in
[`docs/IMPLEMENTATION_AUDIT.md`](docs/IMPLEMENTATION_AUDIT.md).

That document also records open **security** items — most importantly that
`proxy.ts` refreshes the session but does not yet enforce authentication or
role checks on `/officer` and `/government`. Row-level security means an
unauthorised visitor sees empty screens rather than other people's data, but
the routes themselves are still reachable. Read it before deploying.

Known functional gaps: complaints are not assigned to a ward (the `wards`
table has no geometry to derive one from), nothing writes to the
`notifications` table yet, and there is no UI for a supervisor to record a
verdict or for a citizen to reject a repair — though the database supports
all three.

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
