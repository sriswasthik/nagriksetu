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

## Testing

```bash
./supabase/tests/run.sh
```

Creates a throwaway PostgreSQL cluster, applies the platform stub
(`authenticated`/`anon` roles, `auth.uid()`, the `storage` schema), applies
every migration in order, then walks the full lifecycle as four different
users — asserting both that the intended actor can act and that nobody
else can. Needs PostgreSQL server binaries; no Docker and no Supabase
project.

The negative cases are the point of the suite. It fails if a citizen can
read another citizen's complaint, advance a work order, promote
themselves, forge a supervisor's verdict, upload into another user's
folder, or delete a recorded proof.
