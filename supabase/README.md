# Database

Everything the app needs is in `migrations/`, in filename order. There is
no state that only exists in the Supabase dashboard: buckets, storage
policies, triggers, reference data and the analytics functions are all
migrations, so a fresh project reproduces a working database exactly.

## Not using the CLI? Paste one file

```
supabase/bootstrap.sql
```

Everything the application needs on top of the original schema, in one
file. Supabase dashboard → SQL Editor → New query → paste → Run. Safe to
run repeatedly, and it refuses to run at all if the original tables are
absent rather than failing halfway through.

`supabase db push` does the same thing and records it in the migration
history, which is preferable when the CLI is part of how you deploy. This
file is the escape hatch, and it exists because being told to run a CLI
command is no help if the CLI is not part of your workflow.

Regenerate it after adding a migration:

```bash
./scripts/generate-bootstrap.sh   # rebuild from supabase/migrations/20260814*
./scripts/verify-bootstrap.sh     # prove it still works, three runs deep
```

`verify-bootstrap.sh` builds a database holding only the original schema —
the state a real deployment was found in — confirms submissions are broken
there, runs the bootstrap three times, requires `diagnose.sql` to come back
clean, and files a report to prove it end to end.

## If something is failing, check the schema first

```
supabase/diagnose.sql
```

Paste it into the SQL editor. It lists every object the application
expects and whether this database has it, plus any table with row-level
security enabled and no policy — a combination that denies every request
including reads.

This exists because a deployment failed every submission with

```
null value in column "complaint_number" of relation "complaints"
violates not-null constraint
```

which is what a missing numbering trigger looks like from the browser,
and nothing in the app could say so. Anything marked `MISSING` means the
migrations below have not all been applied.

## Applying the migrations

With the Supabase CLI, against a linked project:

```bash
supabase db push
```

Or paste each file into the SQL editor in filename order. Order matters —
later migrations depend on helper functions defined in earlier ones.

## Appointing the first administrator

Every profile is created as a `citizen`: `handle_new_user()` hardcodes it,
and there is no INSERT policy on `public.profiles`, so that trigger is the
only way a profile ever appears. Nothing in the UI can change a role.

Sign up normally, then run this once in the SQL editor:

```sql
select public.set_user_role(
  (select id from auth.users where email = 'you@example.com'),
  'government_admin'
);
```

The SQL editor presents no end-user JWT, which is what
`can_assign_roles()` recognises as a trusted server context. From then on
that administrator can appoint everyone else — and only a
`government_admin` can, so nobody promotes themselves. Every change is
recorded in `public.audit_logs`.

Appointing an officer or a supervisor is the same call with `'officer'` or
`'supervisor'`.

## What each migration does

| Migration | Purpose |
| --- | --- |
| `20260813064831_initial_nagriksetu_schema` | 14 tables, 6 enums, RLS enabled on all of them |
| `20260813070406_auth_profiles_and_roles` | `auth.users` → `public.profiles` trigger |
| `20260813070443_profile_rls_policies` | Profile access, and the guard against role self-escalation |
| `20260813074838_complaint_rls_policies` | A citizen sees only their own complaints |
| `20260813093815_complaint_media_storage` | The `complaint_media` table and its policies |
| `20260813130845_add_ai_analysis_to_complaints` | AI classification columns |
| `20260814120000_role_helpers_and_staff_rls` | `current_app_role()`, `is_staff()`, `is_oversight()`, `owns_complaint()`, `is_assigned_officer()`, and policies for the 11 tables that had none |
| `20260814120100_workflow_integrity_and_reference_data` | `updated_at` triggers, work-order numbering, SLA deadlines, seeded departments and wards |
| `20260814120200_analytics_functions` | Six `analytics_*` functions the dashboards call by RPC |
| `20260814120300_storage_bucket_and_object_policies` | The two buckets and their `storage.objects` policies |
| `20260814120400_complaint_number_sequence` | Database-assigned complaint numbers |
| `20260814120500_role_administration` | `set_user_role()`, and the exemption that makes role assignment possible at all |
| `20260814120600_verification_column_authority` | Stops a citizen forging the supervisor's verdict |
| `20260814120700_complaint_and_work_order_column_authority` | Column authority on complaints and work orders, plus the triage write path |
| `20260814120800_complaint_lifecycle` | Status history, idempotent submission, and triage advancing the status |
| `20260814120900_complaint_number_default` | A column default for the complaint number, and wall-clock ordering for history |
| `20260816120000_work_order_lifecycle` | The work-order state machine, the audit trail as a trigger, the complaint-status sync as a trigger, `advance_work_order()` and `assignable_officers()` |
| `20260817120000_analytics_completeness` | Analytics measured rather than assumed: resolution time from recorded history, null where nothing was measured, exhaustive SLA buckets, and the status/priority/work-order/hotspot metrics that had no source |
| `20260817130000_notification_lifecycle` | Notifications written by triggers, one row per lifecycle event, deduplicated by the audit row that caused them |

Each file opens with a comment explaining what was wrong and why the fix
is shaped the way it is. Those comments are the reference; this table is
just an index.

## Row-level security

RLS is enabled on every table, and a table with RLS enabled and no policy
denies everything — which is what the `20260814120000` migration fixes for
the 11 tables that had none.

The helper functions are `SECURITY DEFINER` with `set search_path = ''`.
That is deliberate: policies on `complaints`, `work_orders` and the rest
need to read the caller's role out of `profiles`, and doing that as the
caller would re-enter the policies on `profiles` and recurse.

The `analytics_*` functions are the opposite — `SECURITY INVOKER`, so they
run with the caller's privileges and RLS scopes the aggregate. The same
`analytics_summary()` call returns the whole city to an administrator and
only their own reports to a citizen. There is no way to use them to read
rows the caller could not already select. That property is asserted, not
assumed: `05_analytics_test.sql` reads `pg_proc.prosecdef` and fails if any
of them ever becomes `SECURITY DEFINER`, because the scoping tests either
side of it would then pass while returning the city to everybody.

EXECUTE is also revoked from `PUBLIC`. Postgres grants it by default, so
an anonymous caller could run all six of the original functions; it got
zeros back, because RLS showed it no rows, which was the right answer for
the wrong reason. A policy mistake would have surfaced as a silent leak to
unauthenticated callers rather than as a denial.

## Storage

Two private buckets:

| Bucket | Path convention | Written by |
| --- | --- | --- |
| `complaint-evidence` | `<uploader_id>/<complaint_id>/<uuid>.<ext>` | The reporting citizen |
| `resolution-proofs` | `<uploader_id>/<work_order_id>/<uuid>.<ext>` | The assigned officer |

Both are private, so reads go through `createSignedUrl()`, which still
evaluates the policies — access stays row-level for files as well as rows.

Policies compare the first path segment as text rather than casting it to
`uuid`. A cast inside a policy raises `22P02` on any object whose name does
not parse, which would take out the whole query instead of hiding one row.

## Column authority

Row-level security decides which *rows* a caller may touch. It cannot say
which *columns*, and both `complaints` and `work_orders` are written by two
parties with different authority over the same row — the citizen owns the
report, the municipality owns the triage. Whole-row policies gave each side
everything.

Triggers close that gap:

| Trigger | Enforces |
| --- | --- |
| `complaints_enforce_authority` | Citizens cannot set status (except reopening), priority, SLA, department, ward or the `ai_*` fields. Staff cannot rewrite the citizen's title or description. Nobody changes `citizen_id`, `complaint_number` or `created_at`. |
| `work_orders_enforce_authority` | `complaint_id` is fixed; only oversight reassigns an officer |
| `work_orders_enforce_transition` | The state machine, plus: proof must exist to be submitted, an unassigned work order has no lifecycle, and lifecycle timestamps are server-stamped rather than caller-supplied |
| `verifications_enforce_authority` | Supervisor columns are supervisor-only, citizen columns citizen-only, `verified_at` derived |

The triage columns have exactly one caller-facing entry point:
`apply_complaint_triage()`, `SECURITY DEFINER`, owner-or-staff, and once
only for a citizen. It resolves the department from a code rather than
accepting an id, clamps `priority_score`, stamps `ai_processed_at` from the
server clock, and leaves `sla_due_at` to the SLA trigger — so no deadline,
timestamp or routing target is ever caller-supplied.

Its fixed parameter list is also what makes it safe to call with values a
language model produced. The model's reply is validated against a closed
schema first (`src/lib/ai/schema.ts`), and then travels as function
arguments — a department it invents is resolved to an id or rejected, and
a string it invents cannot reach a query or a privileged operation.

That function sets a transaction-local `app.sanctioned_triage` flag so its
own UPDATE passes the column trigger. `SECURITY DEFINER` changes the
executing role, not `auth.uid()`, so without the flag the function would
be blocked by the trigger written to accommodate it. It cannot be forged:
PostgREST gives each request its own transaction, `set_config(..., true)`
is scoped to it, and no function granted to `authenticated` sets arbitrary
GUCs. There is a regression test that follows a successful triage with a
direct PATCH in the same transaction and asserts it is still refused.

**Closed:** classification no longer runs in the reporting citizen's
browser. `POST /api/ai/analyze` authenticates the caller, reads the
complaint text *from the database* rather than from the request, and calls
`apply_complaint_triage()` with values the citizen's client never saw.

**Remaining, and deliberate:** the RPC is still granted to
`authenticated`, because the route handler calls it with the caller's own
session and no service-role key exists anywhere in this deployment. So a
determined citizen could still invoke it once, by hand, for a complaint
they own. Revoking the grant would require a service-role key in the app —
a strictly worse trade: one leaked key is unrestricted access to every
row, where this is one self-inflicted classification on one's own report,
which staff can re-triage. The once-only limit, the department resolution
and the score clamp all still apply to that call.

## The complaint lifecycle

A citizen's report moves through the database like this:

| Step | What the database does |
| --- | --- |
| Submit | `submit_complaint()` — idempotent on `submission_key`, validates text and coordinates, takes `citizen_id` from `auth.uid()` |
| Number | `complaints_set_number` assigns `NS-<year>-<sequence>` |
| Record | `complaints_record_status` writes the first `complaint_status_history` row |
| Triage | `apply_complaint_triage()` sets category, priority, department, the `ai_*` columns, and advances `submitted` → `ai_analyzed` |
| SLA | `complaints_set_sla_due_at` derives `sla_due_at` from the new priority |
| Track | Every later transition appends to `complaint_status_history` |

Three things are worth knowing about that.

**Submission is idempotent.** The client generates a `submission_key`
per form fill and `submit_complaint()` returns the existing complaint if
that key has been used. Without it, an insert that succeeded but whose
response was lost looked identical to a failure, so a retry filed the
same issue twice.

**Status history is append-only.** `complaint_status_history` has a SELECT
policy and nothing else — no INSERT, UPDATE or DELETE, for anyone. Rows
come only from the trigger. It is what lets the citizen's timeline date
each stage; `complaints.updated_at` cannot, because every later change
overwrites it.

**Triage is not a form submission.** It is a server-side step that may
fail, so the database tracks it as a state rather than an event:
`set_complaint_ai_status()` records `processing` and `failed`, and
`apply_complaint_triage()` stamps `ai_processed_at` on success. The detail
page reads `ai_analysis_status` to decide whether to start a run, poll, or
offer a retry — which is why triage does not depend on the citizen
following a particular link after submitting, and why a second request
mid-run cannot produce a second classification.

Where those values come from, and how a model failure is recorded rather
than raised, is in [the root README](../README.md#ai-complaint-triage).

## Analytics

Every figure on an authority screen is aggregated in Postgres and read
through one service. What this section is about is the figures that were
*not* measured.

### Two invented statistics

`analytics_ward_health()` coalesced `sla_compliance` to **100** when a ward
had no complaint carrying an SLA deadline, and scored it `good`. So a ward
nobody had filed anything in presented as the city's best-performing one.
`analytics_department_performance()` coalesced the same figure to **0**,
which the UI renders as a full-width red bar.

Neither number came from data. Both are now `null`, the type is
`number | null`, and the screens render "No data". A ward with nothing to
comply with has no compliance figure — that is the honest answer, and
saying "0%" or "100%" instead is a claim a municipality will act on.

Every average and percentage now travels with a `*SampleSize`, so a
dashboard can say "18h across 12 resolved reports" rather than implying
the figure covers everything. A figure exists if and only if its sample is
non-zero, which is asserted directly.

### Resolution time is measured, not approximated

`avgResolutionHours` and `slaCompliance` both measured from
`complaints.updated_at`, treating "last touched" as "resolved" — so a
staff note, a triage correction or an AI re-run on a closed complaint
moved its apparent resolution time.

`complaint_resolution_times()` is now the single definition: the moment
`complaint_status_history` recorded the status becoming `resolved`. A
complaint with no such row is **excluded** rather than approximated, which
is why the sample size matters.

It also distinguishes *was resolved* from *is resolved*. A reopened
complaint has a resolution event and is nonetheless open — the citizen
rejected the repair — and counting both made it appear in two SLA buckets
at once and contribute to the city's average resolution time as though the
job were done. It is judged by current state; the history keeps the
earlier attempt.

### "At risk" now means at risk

`analytics_sla_breakdown()` counted every open complaint whose deadline
had not yet passed, so a report filed an hour ago with six days of
headroom was flagged and the metric was unreadable. Risk is now a
deadline inside a window (24h by default, a clamped parameter), and what
the old figure counted is returned as `onTrack`.

The buckets also did not sum to the whole. A complaint resolved *after*
its deadline belonged to none of them — not `withinSLA`, and not open, so
neither of the other two. The dashboard divides by their sum to size a
stacked bar, so the bar under-filled and every percentage printed beside
it used the wrong denominator. `withinSLA`, `breached`, `atRisk`,
`onTrack` and `unmeasured` now partition every visible complaint.

### The metrics that had no source

| Function | Answers |
| --- | --- |
| `analytics_status_distribution()` | Complaints by status — every enum value, including the empty ones |
| `analytics_priority_distribution()` | The open priority mix, in severity order so the chart's shape is stable |
| `analytics_work_orders()` | Field workload: active, awaiting sign-off, completed, unassigned |
| `analytics_hotspots()` | Geographic concentration, counted per ~550 m cell |
| `analytics_sla_risk_items()` | Which complaints are at risk, bounded and ordered by urgency |

`analytics_hotspots()` uses a coordinate grid rather than PostGIS, so it
runs on a stock Supabase project. It ranks neighbourhoods; it is not a
clustering algorithm and does not claim to be. Reports at `0,0` are
excluded — a lost GPS fix is not a location, and counting it puts a
permanent hotspot in the Gulf of Guinea.

### Bounded by construction

Every function that returns a list clamps its own row cap, so a caller
cannot ask for the city. That matters because the queries these replaced
did: the hotspot map and the authority queue both selected every work
order with its complaint, department and officer joined, to count and
filter them in the browser. Rows are now capped and totals come from the
aggregates, so a capped page no longer means a capped number — and the
queue says when it is showing a subset.

## Notifications

`public.notifications` has existed since the initial schema, with
per-recipient policies added in `20260814120000`. **Nothing ever wrote a
row to it.** Both notification surfaces derived a feed from complaint
state instead — one entry per report showing its current status — which
was true as far as it went but was state rather than history: a report
that passed through triage, assignment, work and closure produced a
single entry, overwritten each time. A citizen who had been asked to
confirm a repair saw it only if they happened to look before the next
transition, and read state lived in a React `Set`, so it was lost on
reload.

### Triggers, not application writes

Every event worth notifying about already fires a trigger, because the
lifecycle lives in the database: `complaint_status_history` records one
row per real complaint transition and `work_order_updates` one per
work-order transition, both append-only and both in the same transaction
as the change.

| Trigger | On | Notifies |
| --- | --- | --- |
| `complaint_status_notify` | `complaint_status_history` insert | The reporting citizen, for every stage of their report |
| `work_order_update_notify` | `work_order_updates` insert | The assigned officer, when somebody *else* made the transition |
| `work_order_assignment_notify` | `work_orders` insert / `officer_id` change | The newly assigned officer |

Notifying from the application would mean a second statement that can
fail on its own — the same shape as the audit trail that used to be
"best-effort" and was therefore missing exactly when something had gone
wrong. A notification nobody receives because a browser closed
mid-request is that failure again.

**An officer is not told about their own actions.** A transition notifies
them only when `created_by` is not the assignee: a tray that says "you
accepted this" is a tray nobody reads.

### Deduplication is structural

Every notification carries an `event_key` derived from the primary key of
the audit row that caused it, plus the recipient:

```
csh:<complaint_status_history.id>:<user_id>
wou:<work_order_updates.id>:<user_id>
woassign:<work_orders.id>:<officer_id>
```

A partial unique index makes a duplicate impossible rather than unlikely,
and `emit_notification()` inserts with `on conflict do nothing` — so an
at-least-once caller behaves as exactly-once without anybody comparing
message text. Those audit rows are themselves one-per-real-transition: an
UPDATE setting a status to the value it already holds is not `distinct
from` its old value, so no history row is written and no notification
follows.

The assignment key is per work order per officer rather than per event,
because an assignment writes no audit row of its own. The consequence is
deliberate: bouncing a job between two officers who have both held it
notifies neither again. One "this is yours" per officer per job.

### Who can write, and who can read

The insert policy was:

```sql
with check (public.is_staff() or user_id = auth.uid())
```

So any officer could write a notification, with any text, into any
citizen's inbox. Nothing did — and now nothing needs to, since every
notification comes from a trigger. It is replaced with self-insert only.

`emit_notification()` is `SECURITY DEFINER` (the officer advancing a work
order has no policy allowing them to insert a row addressed to the
citizen, and should not) and is **granted to nobody**, so it is reachable
from triggers alone.

Reading and marking are `SECURITY INVOKER`: `unread_notification_count()`
and `mark_notifications_read()` run as the caller, so the
`user_id = auth.uid()` policies confine them. Passing another user's ids
to the marking function changes nothing rather than erroring. There is no
DELETE policy at all — an inbox its sender can empty is not a record of
what the citizen was told.

## The work-order lifecycle

Once a complaint is assigned, the work order is the record of the repair.
`work_orders.status` is an enum, which means Postgres would accept any of
its eight values in place of any other — so the state machine is a
trigger, and it is split by authority:

| Who | May move it |
| --- | --- |
| The assigned officer | `assigned → accepted → in_progress → proof_submitted`, and `reopened → in_progress` for rework |
| Oversight | `proof_submitted → supervisor_review → citizen_confirmation → resolved`, `→ reopened` from any of those, `resolved → reopened`, and `→ assigned` from anything unresolved (reassignment) |

**The officer's terminal state is `proof_submitted`, not `resolved`.** An
officer declaring their own work finished is what the verification stage
exists to prevent. Before this, an officer could PATCH straight from
`assigned` to `resolved` — closing a job nobody had visited.

Four more things the trigger enforces, each of which was previously only
a property of the UI:

- **Proof must exist to be submitted.** `proof_submitted` is what a
  supervisor signs off from. The page required a photograph; the database
  required nothing, so a hand-written PATCH produced a work order
  awaiting verification with nothing to verify.
- **An unassigned work order has no lifecycle.** RLS already stops an
  officer (`officer_id = auth.uid()` cannot hold against null), but
  oversight passed it, and accepting on nobody's behalf records that
  nobody accepted it.
- **Timestamps are server-stamped.** `accepted_at`, `started_at` and
  `completed_at` came from the browser. They are SLA evidence, so a
  caller that could set them could backdate a repair. An update carrying
  them is now refused outright rather than silently overwritten — a
  client that thinks it is recording history should not look like it
  succeeded.
- **Reassignment clears the previous officer's stamps.** They describe
  work the new assignee has not done. The audit trail keeps the history.

### The audit trail is not optional

`work_order_updates` was written by the application, in a separate
statement, deliberately best-effort — "if the audit insert fails the
transition itself still stands". So the record of who changed what could
be missing exactly when something went wrong, and a caller who simply
never issued the second statement left no trace at all.

It is now `work_orders_record_transition`: same transaction as the
transition, actor from `auth.uid()`, unreachable from any client. The
table has a SELECT policy and no INSERT, UPDATE or DELETE policy for
anyone, so its rows come only from the trigger and nobody can edit them
afterwards.

### The citizen's view cannot lag

The complaint's status was mirrored by a third application statement,
also best-effort. If it failed the officer saw `in_progress` and the
citizen tracking that report still saw `assigned`, with nothing to
reconcile them and no error either would ever be shown. And creating a
work order propagated nothing at all, so assignment left the citizen
looking at "Submitted" indefinitely.

`work_orders_sync_complaint` fires on insert as well as update, in the
same transaction. It is `SECURITY DEFINER` because the officer has no
policy permitting them to update that citizen's complaint and should not
— this is the one derived write, and it writes one column.

The officer's note travels with it, into
`complaint_status_history.note`, which existed and had never been
populated. A citizen's timeline could say "In Progress" but never why,
even when the officer had written down exactly what they were doing.

### advance_work_order()

The caller-facing entry point, so a client sends an intent rather than a
row patch, and so the note reaches the audit row the trigger writes.

`SECURITY INVOKER`, deliberately: every check that matters is a policy or
a trigger, and running as the caller means the function cannot become a
way around them. An officer calling it about someone else's work order is
refused by the same RLS that refuses their PATCH — with one message for
"does not exist" and "not yours", since distinguishing them would confirm
the existence of work orders the caller has no business knowing about.

## Testing

```bash
./supabase/tests/run.sh
```

Creates a throwaway PostgreSQL cluster, applies the platform stub
(`authenticated`/`anon` roles, `auth.uid()` reading `request.jwt.claim.sub`
as PostgREST sets it, the `storage` schema), applies every migration in
order, then runs each suite:

| Suite | Covers |
| --- | --- |
| `01_rls_smoke_test.sql` | The full lifecycle as four users: file → assign → work → verify → confirm → resolve |
| `02_auth_boundary_test.sql` | Who may read and write what: anonymous access, citizen confinement, officer confinement, authority limits, the triage path, role escalation |
| `03_complaint_lifecycle_test.sql` | The citizen's own path: submission, idempotency, coordinate validation, triage, and the status history a timeline reads |
| `04_officer_lifecycle_test.sql` | The officer's path: the state machine, proof gating, the audit trail's actors, the citizen's view following along, and sign-off |
| `05_analytics_test.sql` | That no figure is invented: nulls where nothing was measured, resolution time unmoved by later edits, buckets that sum to the whole, and aggregates scoped to the caller |
| `06_notifications_test.sql` | That real events notify, that a retried event does not notify twice, and that nobody reads or marks another user's inbox |

Needs PostgreSQL server binaries; no Docker and no Supabase project.

The stub grants `anon` the same table privileges Supabase does. Without
that, the "an anonymous caller sees nothing" checks would pass because of a
missing GRANT and would keep passing if every policy were dropped.

The negative cases are the point. The suite fails if a citizen can read
another citizen's complaint, close their own complaint, rewrite its
priority or SLA, transfer it to someone else, promote themselves, forge a
supervisor's verdict, re-run their own triage, upload into another user's
folder, or delete a recorded proof — or if an officer can take another
officer's work order, repoint it at a different complaint, rewrite the
citizen's account of the issue, skip a lifecycle stage, resolve their own
work, submit proof with no photograph, backdate a completion, advance an
unassigned work order, or edit the audit trail afterwards.

Route protection is verified separately, since it is not a database
concern:

```bash
./scripts/verify-route-protection.sh
```
