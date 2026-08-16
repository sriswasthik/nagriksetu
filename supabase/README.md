# Database

Everything the app needs is in `migrations/`, in filename order. There is
no state that only exists in the Supabase dashboard: buckets, storage
policies, triggers, reference data and the analytics functions are all
migrations, so a fresh project reproduces a working database exactly.

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

The classifier in `src/lib/services/ai.ts` runs in the reporting citizen's
browser, so the triage columns have exactly one caller-facing entry point:
`apply_complaint_triage()`, `SECURITY DEFINER`, owner-or-staff, and once
only for a citizen. It resolves the department from a code rather than
accepting an id, clamps `priority_score`, stamps `ai_processed_at` from the
server clock, and leaves `sla_due_at` to the SLA trigger — so no deadline,
timestamp or routing target is ever caller-supplied.

That function sets a transaction-local `app.sanctioned_triage` flag so its
own UPDATE passes the column trigger. `SECURITY DEFINER` changes the
executing role, not `auth.uid()`, so without the flag the function would
be blocked by the trigger written to accommodate it. It cannot be forged:
PostgREST gives each request its own transaction, `set_config(..., true)`
is scoped to it, and no function granted to `authenticated` sets arbitrary
GUCs. There is a regression test that follows a successful triage with a
direct PATCH in the same transaction and asserts it is still refused.

**Remaining:** a citizen can still influence the *first* classification of
their own report, because the classifier is client-side. Closing that means
running it in an Edge Function or a route handler with a service-role key;
nothing else would change, since `apply_complaint_triage()` is already the
only write path.

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

**Triage is not a form submission.** The classifier runs in the
browser (see the column-authority notes above), so
`apply_complaint_triage()` is once-only for a citizen and
`set_complaint_ai_status()` records `processing` and `failed` states. The
detail page reads `ai_analysis_status` to decide whether to run triage,
poll, or offer a retry — which is why triage no longer depends on the
citizen following a particular link after submitting.

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
