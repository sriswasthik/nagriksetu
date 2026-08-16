# CityTrace

Turns civic complaints into prioritised, trackable and verifiable municipal
work: a citizen reports an issue with a photo and a location, the report is
classified and prioritised, an administrator assigns it to a department
officer, the officer submits photographic proof of the repair, and a
supervisor and the reporting citizen both sign that proof off before it
closes.

Built with Next.js 16 (App Router), React 19, Tailwind CSS v4,
shadcn/ui and Supabase.

## Getting started

```bash
npm install
npm run dev
```

Create `.env.local` with your Supabase project's values:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```

Both are publishable by design — row-level security is what protects the
data, so the key alone grants nothing. Never put a service-role key in a
`NEXT_PUBLIC_` variable: it bypasses RLS and would ship to the browser.

Open [http://localhost:3000](http://localhost:3000).

The app needs a Supabase project with the migrations applied before any
page beyond the landing page will work — see
[supabase/README.md](supabase/README.md) for the database setup, including
how to appoint the first administrator. Without it every account is a
citizen and the officer and government workspaces have nothing to show.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build, including type checking |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `./supabase/tests/run.sh` | Apply the migrations to a throwaway PostgreSQL cluster and exercise the row-level security policies |

## Layout

```
src/app/            Routes. citizen/, officer/ and government/ are the
                    three workspaces; auth/ holds sign-in and sign-up.
src/components/     ui/ is shadcn/ui; the rest is grouped by feature
                    (layout/, map/, report/, shared/).
src/lib/services/   Everything that talks to Supabase.
src/lib/design/     Status, priority and motion tokens shared by the UI.
src/types/          Types mirroring the database schema.
supabase/           Migrations and the row-level security test suite.
```

## Roles

Four roles, defined by the `public.user_role` enum:

| Role | Workspace | Can |
| --- | --- | --- |
| `citizen` | `/citizen` | File reports, track their own, confirm or reject a repair |
| `officer` | `/officer` | Work their own assignments and submit proof |
| `supervisor` | `/government` | Everything an officer can see, plus verify submitted proof |
| `government_admin` | `/government` | Assign work, view city-wide analytics, appoint staff |

Roles are enforced in the database by row-level security, not in the
client, so a citizen cannot read another citizen's report or advance a
work order regardless of what the browser sends.

## Deploying

Any host that runs Next.js works; [Vercel](https://vercel.com/new) is the
path of least resistance. Set the same two environment variables listed
above, and apply the migrations to the production Supabase project before
the first deploy.
