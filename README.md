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

The AI triage variables are optional and **server-only** — none is
`NEXT_PUBLIC_`, and none may become one. See
[AI complaint triage](#ai-complaint-triage).

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | — | Ollama server, e.g. `http://127.0.0.1:11434`. Unset ⇒ no model, deterministic classification |
| `OLLAMA_MODEL` | `llama3.2` | Model tag, already pulled on that server |
| `AI_REQUEST_TIMEOUT_MS` | `20000` | Deadline before falling back |
| `AI_TEMPERATURE` | `0` | Sampling temperature; 0 keeps triage reproducible |
| `AI_MIN_CONFIDENCE` | `0.35` | Below this the model's own answer is discarded |

### Database

Migrations live in `supabase/migrations/` and run in filename order:

```bash
supabase db push
```

There is no state that exists only in the Supabase dashboard — buckets,
storage policies, triggers, reference data and the analytics functions are
all migrations, so a fresh project reproduces a working database exactly.

Without the CLI, paste [`supabase/bootstrap.sql`](supabase/bootstrap.sql)
into the SQL editor instead; it is the same set in one re-runnable file.
[`supabase/diagnose.sql`](supabase/diagnose.sql) reports what a database is
missing.

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
| `npm test` | Unit tests — model-output parsing, schema validation, fallback selection, the work-order state machine, analytics null handling, and notification routing (`node --test`, no test framework dependency) |
| `./supabase/tests/run.sh` | Apply the migrations to a throwaway PostgreSQL cluster and exercise every RLS policy and authorization rule |
| `./scripts/verify-route-protection.sh` | Build, serve, and assert that no protected route is reachable without a session |
| `./scripts/verify-bootstrap.sh` | Prove `supabase/bootstrap.sql` upgrades an original-schema database and is safe to re-run |
| `./scripts/generate-bootstrap.sh` | Rebuild `supabase/bootstrap.sql` after adding a migration |

## Project layout

```
src/app/           routes: /, /auth/*, /citizen/*, /officer/*, /government/*
src/app/api/       server-only endpoints: ai/analyze (complaint triage)
src/components/    ui/ (shadcn), layout/ (shell), shared/, map/, charts/, report/
src/lib/ai/        triage: rule engine, Ollama provider, output schema, orchestrator
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

## AI complaint triage

Every complaint is classified once, on the server, and the result is
persisted. Category, priority, department, summary, confidence and
provenance are read back from `public.complaints` by the citizen,
officer and government views alike — no screen recomputes a
classification, so no two screens can disagree about one.

```
POST /api/ai/analyze  { complaintId }
  authenticate caller ........ 401 if signed out; RLS decides visibility
  read complaint from DB ..... never from the request body
  already processed? ......... return the stored analysis, 200
  run in flight? ............. 202, caller polls
  mark ai_analysis_status=processing
  classify:
    Ollama configured? ....... POST /api/chat, format:json, deadline
    validate output .......... zod, closed schema, alias-tolerant
    confidence >= floor? ..... otherwise discard it
    any failure at all ....... deterministic rule engine
  persist via apply_complaint_triage()  (SQL function, fixed columns)
```

| File | Responsibility |
|---|---|
| `src/lib/ai/deterministic.ts` | Keyword rule engine. Pure — no network, no Supabase |
| `src/lib/ai/schema.ts` | The validation boundary: extract JSON from a model's reply, then accept or reject it against a closed schema |
| `src/lib/ai/ollama.ts` | The local model provider. Returns typed failures, never throws |
| `src/lib/ai/analyze.ts` | Chooses model or fallback and records which |
| `src/app/api/ai/analyze/route.ts` | Authentication, idempotency and persistence |

**Local models only.** No hosted AI dependency, no vendor SDK, no API
key: complaint text is citizen-reported and never leaves the
infrastructure Ollama runs on.

**A model is optional.** With `OLLAMA_BASE_URL` unset, the rule engine
classifies everything and `ai_model` records `citytrace-rules-v2`. The
fallback exists because priority sets an SLA deadline and department
decides who is dispatched — an unclassified complaint is an unrouted
one, which is worse than a keyword guess. It is never presented as a
model judgement, and nothing is fabricated to fill a gap.

**Every failure is recorded, not raised.** Provider unreachable, model
not pulled, timeout, non-JSON reply, JSON that fails the schema, or a
confidence below the floor: each falls back and each is written to
`ai_error_message`, which staff read and citizens do not. What a citizen
sees is a status and, when it succeeds, the assessment itself.

**Model output is data, never instruction.** The complaint text is a
separate chat turn from the prompt, the reply is validated against a
closed schema before it is stored, and persistence goes through
`apply_complaint_triage()` — a SQL function with a fixed parameter
list. A string the model invents cannot reach a query, a shell or a
privileged operation, and the department it names is resolved to an id
by the database or rejected.

Parsing and validation are the parts most worth testing, so they are:
`npm test` covers fenced replies, prose padding, trailing commas,
percentage confidences, out-of-range values, unknown enum members,
arrays and empty bodies, plus each fallback path.

## Notifications

`public.notifications` existed from the initial schema and **nothing ever
wrote to it**. Both surfaces derived a feed from complaint state instead:
one entry per report, showing its current status. Real data, but state
rather than history — a report that passed through triage, assignment,
work and closure produced a single entry that was overwritten each time,
so a citizen asked to confirm a repair saw it only if they looked before
the next transition. Read state lived in a React `Set` and was lost on
reload.

Now one row per event, written by a database trigger in the same
transaction as the event itself.

| Event | Recipient |
|---|---|
| Report submitted (and therefore created) | The reporting citizen |
| Triage completed | The citizen |
| Assigned to a department | The citizen |
| Accepted, work started, proof submitted | The citizen |
| Under review, confirmation requested | The citizen |
| Resolved, reopened, rejected | The citizen |
| Work order assigned or reassigned | The receiving officer |
| Work returned for rework | The assigned officer |
| Anything else | `status_changed`, so a status added later still notifies |

Submission and "successfully created" are one database event — the row
exists with status `submitted` — so they are one notification. Emitting
two would mean inventing an event to satisfy a list.

**Officers are not notified about their own actions.** A transition
notifies the assignee only when somebody else made it, because a tray
that says "you accepted this" is a tray nobody reads. Government has no
notification surface of its own in the product, and supervisors and
administrators reach work orders through the officer workspace, so they
share that tray rather than getting a route that does not exist.

**Duplicates are structurally impossible.** Every notification carries an
`event_key` built from the primary key of the audit row that caused it
plus the recipient, behind a unique index and an `on conflict do nothing`
insert — so a retried event is a no-op without anybody comparing message
text.

**Nobody reads or marks anybody else's.** The policies are
`user_id = auth.uid()` with no staff exemption: an inbox is
correspondence, not operational data. `emit_notification()` is granted to
nobody and reachable only from triggers, which closed a real hole — the
previous insert policy let any staff member write any text into any
citizen's inbox.

**Refresh, not realtime.** Supabase realtime is in `config.toml` because
it ships in the default config; nothing in this codebase subscribes to
anything and no migration adds a publication. A subscription layer for a
tray would be more machinery than the feature justifies, so refresh is
explicit: on mount, when the tray opens, when the tab regains focus, and
after a mutation.

Details in [supabase/README.md](supabase/README.md#notifications).

## Authority analytics

Every figure on a government screen is aggregated in Postgres and read
through `analyticsService` — no page holds a query, and nothing is derived
in a render path that the database can compute.

What is worth knowing is what the dashboards used to show.

**Two figures were invented.** A ward with no complaints reported **100%
SLA compliance** and a health score of `good`, because the database
coalesced its missing figure to 100 — so the wards a municipality knew
least about presented as its best performers, and the "wards needing
attention" list was sorted against a fiction. A department with none
reported **0%**, which renders as a full red bar. Both are now `null`, the
type is `number | null`, and the screens say "No data". Zero is a
measurement; the absence of one is not, and they must not look alike.

**Resolution time was an approximation shown as a measurement.** It
measured from `complaints.updated_at` — "last touched" — so any later edit
to a resolved complaint moved it. It now comes from the moment
`complaint_status_history` recorded the resolution, complaints with no such
record are excluded rather than guessed at, and every average carries the
sample it was computed from ("18h across 12 resolved reports").

**"At risk" meant "not yet late".** Every open complaint with a future
deadline was flagged, so a report filed an hour ago with six days of
headroom counted. Risk is now a deadline inside a window; what the old
figure counted is reported separately as "on track".

**The SLA bar's buckets did not sum to the whole.** A complaint resolved
*after* its deadline belonged to none of them, so the bar under-filled and
every percentage beside it used the wrong denominator. The five buckets now
partition every complaint.

| Metric | Source |
|---|---|
| Total / new / open / critical complaints | `analytics_summary()` |
| Resolution rate, average resolution time, SLA compliance | `analytics_summary()`, measured from recorded history |
| Complaints by status | `analytics_status_distribution()` |
| Complaints by category | `analytics_category_distribution()` |
| Complaints by department | `analytics_department_performance()` |
| Complaints by ward | `analytics_ward_health()` |
| Priority distribution | `analytics_priority_distribution()` |
| SLA posture and risk items | `analytics_sla_breakdown()`, `analytics_sla_risk_items()` |
| Geographic concentration | `analytics_hotspots()` |
| Active / completed work orders | `analytics_work_orders()` |

**Scoped by RLS, not by a role check.** The functions are `SECURITY
INVOKER`, so the same `analytics_summary()` call returns the city to an
administrator and only their own reports to a citizen — which is correct
behaviour, not a leak. `EXECUTE` is revoked from `PUBLIC`, so an
unauthenticated caller is refused rather than relying on RLS to hand it
zeros. A test reads `pg_proc.prosecdef` and fails if any of them ever
becomes `SECURITY DEFINER`.

**Bounded.** Every list function clamps its own row cap. The queries these
replaced did not: the hotspot map and the authority queue each selected
every work order in the city, with its complaint, department and officer
joined, to count and filter in the browser. Rows are capped now and totals
come from the aggregates, so a capped page does not mean a capped number.

Details in
[supabase/README.md](supabase/README.md#analytics).

## The officer work-order lifecycle

A work order is the record of one repair, and its status is a state
machine enforced by a database trigger — not by the buttons the page
happens to render.

```
                    ┌──────────── the assigned officer ────────────┐
assigned ─→ accepted ─→ in_progress ─→ proof_submitted
    ↑                        ↑                │
    │                        │  rework        │  ┌──── oversight ────┐
    │                     reopened ←──────────┴──┤ supervisor_review │
    │                                            │        ↓          │
    └──── reassignment ──────────────────────────┤ citizen_confirm.  │
         (oversight, unresolved only)            │        ↓          │
                                                 │     resolved      │
                                                 └───────────────────┘
```

**An officer's terminal state is `proof_submitted`.** Sign-off exists
precisely so that an officer does not declare their own work finished.
Before this, `assigned → resolved` in one PATCH closed a job nobody had
visited.

Every mutation validates authentication, role, assignment, and the
current status; writes audit information; and returns a message written
to be read. All of it at the database boundary, because the publishable
key is in every browser and PostgREST accepts a hand-written PATCH:

| Refused | By |
|---|---|
| Skipping a stage, or any backwards move except reopening | `work_orders_enforce_transition` |
| Resolving your own work as an officer | the same, split by `is_oversight()` |
| Submitting proof with no photograph attached | the same, counting `resolution_proofs` |
| Advancing an unassigned work order | the same |
| Backdating `accepted_at` / `started_at` / `completed_at` | the same — server-stamped, and a caller that sends one is refused |
| Resolving, or even seeing, another officer's work order | the `Work order update access` policy |
| Reassigning yourself a work order | `work_orders_enforce_authority` |
| Repointing a work order at another complaint | the same |
| Proof for a work order that is not yours | the `Assigned officer can add proof` policy |
| Editing or deleting the audit trail | no INSERT/UPDATE/DELETE policy exists on it |

**The audit trail and the citizen's status are triggers, not follow-up
statements.** Both used to be application writes, explicitly
best-effort — so the record of who did what could be missing exactly
when something had gone wrong, and an officer could see `in_progress`
while the citizen tracking that report still saw `assigned`. They now
run in the same transaction as the transition: either all three happen or
none does. Assignment propagates too, which it never did, so a newly
assigned report no longer reads "Submitted" indefinitely.

The officer's note travels with the transition into the citizen's
timeline. `complaint_status_history.note` existed and had never been
populated, so a citizen could be told "In Progress" but never why.

Details, and what each trigger is compensating for, in
[supabase/README.md](supabase/README.md#the-work-order-lifecycle).

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

The officer path — accept, start, photograph, submit, sign off — is
complete and enforced at the database boundary. See
[The officer work-order lifecycle](#the-officer-work-order-lifecycle).

Authority dashboards read live aggregates with no invented figures; see
[Authority analytics](#authority-analytics).

Notifications are real: one row per lifecycle event, per recipient. See
[Notifications](#notifications).

Known functional gaps: complaints are not assigned to a ward (the `wards`
table has no geometry to derive one from), so ward health is measurable
only once something sets `ward_id`; a citizen cannot reject a repair
themselves (a supervisor records that verdict on their behalf); and the
authority queue lists existing work orders, so a complaint with no work
order at all is assigned from the work-order page rather than from the
queue.

## Naming

User-facing copy says CityTrace. Several backend identifiers deliberately keep
the historical `nagriksetu` spelling because their values are already written
into database rows, and renaming them would make new records inconsistent with
existing ones:

- the `NS-` complaint-number prefix
- legacy placeholder email domains in `services/auth.ts`

## Licence

Built for the Smart India Hackathon.
