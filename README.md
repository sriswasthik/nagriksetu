# CityTrace

Civic complaint management platform. Citizens report civic issues; the report
is triaged and routed to a department; field officers carry out the work and
submit photographic proof; supervisors verify it before anything closes.

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

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Project layout

```
src/app/           routes: /, /auth/*, /citizen/*, /officer/*, /government/*
src/components/    ui/ (shadcn), layout/ (shell), shared/, map/, charts/, report/
src/lib/design/    status + motion systems — single source of truth
src/lib/services/  Supabase and data access
src/lib/supabase/  browser and server clients
src/lib/mock/      demonstration data (see the audit)
supabase/          migrations
docs/              implementation audit
```

## Current state

Some officer and government screens are backed by demonstration data rather
than the database, and render a "Sample data" notice where they are. The
reasons, the completion matrix and the recommended order of work are in
[`docs/IMPLEMENTATION_AUDIT.md`](docs/IMPLEMENTATION_AUDIT.md).

That document also records open **security** items — most importantly that
`proxy.ts` refreshes the session but does not yet enforce authentication or
role checks on `/officer` and `/government`. Read it before deploying.

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
