-- ============================================================
-- SCHEMA DIAGNOSTIC
-- ============================================================
--
-- Paste into the Supabase SQL editor. It reports which objects the
-- application expects and whether this database has them.
--
-- Written because a deployment failed every submission with
--
--   null value in column "complaint_number" of relation "complaints"
--   violates not-null constraint
--
-- which is what a missing numbering trigger looks like from the client,
-- and there was no way to see that from the outside. Anything marked
-- MISSING below means the migrations in supabase/migrations have not all
-- been applied — run `supabase db push`.

select
  kind,
  name,
  case when present then 'ok' else 'MISSING' end as status,
  purpose
from (
  -- ---------- tables ----------
  select 'table' as kind, 'complaint_status_history' as name,
    to_regclass('public.complaint_status_history') is not null as present,
    'Status history behind the citizen tracking timeline' as purpose
  union all
  select 'table', 'work_orders',
    to_regclass('public.work_orders') is not null,
    'Officer assignments'

  -- ---------- columns ----------
  union all
  select 'column', 'complaints.submission_key',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'complaints'
        and column_name = 'submission_key'
    ),
    'Makes a resubmitted report idempotent instead of duplicated'
  union all
  select 'column', 'complaints.ai_analysis_status',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'complaints'
        and column_name = 'ai_analysis_status'
    ),
    'Whether triage has run; the detail page reads it to decide'
  union all
  select 'column', 'complaint_media.file_size',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'complaint_media'
        and column_name = 'file_size'
    ),
    'Evidence metadata'

  -- ---------- the complaint number, both mechanisms ----------
  union all
  select 'default', 'complaints.complaint_number',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'complaints'
        and column_name = 'complaint_number'
        and column_default is not null
    ),
    'Assigns NS-YYYY-NNNNNN. Absent here = every submission fails on NOT NULL'
  union all
  select 'trigger', 'complaints_set_number',
    exists (
      select 1 from pg_trigger
      where tgname = 'complaints_set_number' and not tgisinternal
    ),
    'Backstop for the complaint number on an explicit null'
  union all
  select 'sequence', 'complaint_number_seq',
    to_regclass('public.complaint_number_seq') is not null,
    'Source of both of the above'

  -- ---------- triggers ----------
  union all
  select 'trigger', 'complaints_record_status',
    exists (
      select 1 from pg_trigger
      where tgname = 'complaints_record_status' and not tgisinternal
    ),
    'Records each transition. Absent = an undated tracking timeline'
  union all
  select 'trigger', 'complaints_set_sla_due_at',
    exists (
      select 1 from pg_trigger
      where tgname = 'complaints_set_sla_due_at' and not tgisinternal
    ),
    'Derives the SLA deadline from the priority'
  union all
  select 'trigger', 'complaints_enforce_authority',
    exists (
      select 1 from pg_trigger
      where tgname = 'complaints_enforce_authority' and not tgisinternal
    ),
    'Column authority. Absent = a citizen can close their own complaint'
  union all
  select 'trigger', 'work_orders_enforce_transition',
    exists (
      select 1 from pg_trigger
      where tgname = 'work_orders_enforce_transition' and not tgisinternal
    ),
    'The work-order state machine. Absent = an officer can resolve their own work'
  union all
  select 'trigger', 'work_orders_record_transition',
    exists (
      select 1 from pg_trigger
      where tgname = 'work_orders_record_transition' and not tgisinternal
    ),
    'Writes the audit trail. Absent = transitions happen with no record of who'
  union all
  select 'trigger', 'work_orders_sync_complaint',
    exists (
      select 1 from pg_trigger
      where tgname = 'work_orders_sync_complaint' and not tgisinternal
    ),
    'Absent = the citizen''s tracking view never follows the officer''s work'

  -- ---------- functions ----------
  union all
  select 'function', 'submit_complaint',
    exists (select 1 from pg_proc where proname = 'submit_complaint'),
    'The submission entry point'
  union all
  select 'function', 'apply_complaint_triage',
    exists (select 1 from pg_proc where proname = 'apply_complaint_triage'),
    'The only citizen-reachable path to the triage columns'
  union all
  select 'function', 'set_user_role',
    exists (select 1 from pg_proc where proname = 'set_user_role'),
    'Appoints staff. Absent = no officer or administrator can exist'
  union all
  select 'function', 'analytics_summary',
    exists (select 1 from pg_proc where proname = 'analytics_summary'),
    'Authority dashboard figures'
  union all
  select 'function', 'advance_work_order',
    exists (select 1 from pg_proc where proname = 'advance_work_order'),
    'How an officer accepts, starts and completes work'
  union all
  select 'function', 'assignable_officers',
    exists (select 1 from pg_proc where proname = 'assignable_officers'),
    'Absent = nothing can be assigned to anybody'
  union all
  select 'function', 'complaint_resolution_times',
    exists (select 1 from pg_proc where proname = 'complaint_resolution_times'),
    'The one definition of "resolved at". Absent = every analytics figure is unavailable'
  union all
  select 'function', 'analytics_status_distribution',
    exists (select 1 from pg_proc where proname = 'analytics_status_distribution'),
    'Complaints by status on the authority overview'
  union all
  select 'function', 'analytics_hotspots',
    exists (select 1 from pg_proc where proname = 'analytics_hotspots'),
    'Geographic concentration. Absent = the hotspot ranking is empty'
  union all
  select 'function', 'emit_notification',
    exists (select 1 from pg_proc where proname = 'emit_notification'),
    'Absent = no lifecycle event ever notifies anybody'
  union all
  select 'function', 'unread_notification_count',
    exists (select 1 from pg_proc where proname = 'unread_notification_count'),
    'The notification badge'
  union all
  select 'trigger', 'complaint_status_notify',
    exists (
      select 1 from pg_trigger
      where tgname = 'complaint_status_notify' and not tgisinternal
    ),
    'Absent = a citizen is never told their report progressed'
  union all
  select 'trigger', 'work_order_assignment_notify',
    exists (
      select 1 from pg_trigger
      where tgname = 'work_order_assignment_notify' and not tgisinternal
    ),
    'Absent = an officer is never told a job is theirs'

  -- ---------- storage ----------
  union all
  select 'bucket', 'complaint-evidence',
    exists (select 1 from storage.buckets where id = 'complaint-evidence'),
    'Citizen evidence. Absent = every photo upload fails'
  union all
  select 'bucket', 'resolution-proofs',
    exists (select 1 from storage.buckets where id = 'resolution-proofs'),
    'Officer proof of work'
  union all
  select 'policy', 'storage.objects policies',
    exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
    ),
    'Absent = uploads and signed reads are both denied'
) checks
order by present, kind, name;


-- ------------------------------------------------------------
-- Tables with row-level security enabled and no policy at all.
--
-- That combination denies every request including reads, so anything
-- listed here is unreachable by the application.
-- ------------------------------------------------------------

select
  c.relname as table_with_rls_and_no_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;
