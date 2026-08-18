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
rows the caller could not already select.

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

Needs PostgreSQL server binaries; no Docker and no Supabase project.

The stub grants `anon` the same table privileges Supabase does. Without
that, the "an anonymous caller sees nothing" checks would pass because of a
missing GRANT and would keep passing if every policy were dropped.

The negative cases are the point. The suite fails if a citizen can read
another citizen's complaint, close their own complaint, rewrite its
priority or SLA, transfer it to someone else, promote themselves, forge a
supervisor's verdict, re-run their own triage, upload into another user's
folder, or delete a recorded proof — or if an officer can take another
officer's work order, repoint it at a different complaint, or rewrite the
citizen's account of the issue.

Route protection is verified separately, since it is not a database
concern:

```bash
./scripts/verify-route-protection.sh
```
