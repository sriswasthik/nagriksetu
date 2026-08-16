-- ============================================================
-- WORKFLOW INTEGRITY + REFERENCE DATA
-- ============================================================
--
-- Three gaps the service layer assumed the database already handled:
--
-- 1. updated_at was declared on complaints, work_orders and
--    verifications with a default, but no trigger maintained it. Every
--    UPDATE left it at the insert time, so "Updated 3h ago" in the UI
--    was reporting creation time, and ordering by updated_at was wrong.
--
-- 2. work_orders.work_order_number is NOT NULL UNIQUE with no default
--    and no generator, so every insert had to invent one client-side.
--
-- 3. departments and wards were never seeded, so the AI service's
--    department lookup by code could not match anything even once RLS
--    allowed the read.
--
-- No table is added and no column is dropped.
-- ============================================================


-- ============================================================
-- 1. updated_at MAINTENANCE
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists complaints_touch_updated_at on public.complaints;

create trigger complaints_touch_updated_at
before update on public.complaints
for each row
execute function public.touch_updated_at();


drop trigger if exists work_orders_touch_updated_at on public.work_orders;

create trigger work_orders_touch_updated_at
before update on public.work_orders
for each row
execute function public.touch_updated_at();


drop trigger if exists verifications_touch_updated_at on public.verifications;

create trigger verifications_touch_updated_at
before update on public.verifications
for each row
execute function public.touch_updated_at();


drop trigger if exists profiles_touch_updated_at on public.profiles;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();


-- ============================================================
-- 2. WORK ORDER NUMBERS
-- ============================================================
--
-- Generated in the database rather than the client so the value is
-- unique under concurrency. A sequence guarantees that; a client-side
-- random suffix does not.
--
-- Format: WO-<year>-<zero-padded sequence>, e.g. WO-2026-000042.

create sequence if not exists public.work_order_number_seq;


create or replace function public.set_work_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.work_order_number is null or new.work_order_number = '' then
    new.work_order_number :=
      'WO-'
      || to_char(now(), 'YYYY')
      || '-'
      || lpad(nextval('public.work_order_number_seq')::text, 6, '0');
  end if;

  -- assigned_at should reflect when an officer was actually attached.
  if new.officer_id is not null and new.assigned_at is null then
    new.assigned_at := now();
  end if;

  return new;
end;
$$;


drop trigger if exists work_orders_set_number on public.work_orders;

create trigger work_orders_set_number
before insert on public.work_orders
for each row
execute function public.set_work_order_number();


-- ============================================================
-- 3. SLA DUE DATE
-- ============================================================
--
-- complaints.sla_due_at existed but was never populated, so SLA
-- monitoring had nothing real to read. The windows mirror SLA_HOURS
-- in src/lib/constants.ts so the UI and database agree.

create or replace function public.set_complaint_sla_due_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.priority_level is not null
     and (
       new.sla_due_at is null
       or new.priority_level is distinct from old.priority_level
     )
  then
    new.sla_due_at := coalesce(new.created_at, now()) +
      case new.priority_level
        when 'critical' then interval '24 hours'
        when 'high'     then interval '48 hours'
        when 'medium'   then interval '72 hours'
        else                 interval '120 hours'
      end;
  end if;

  return new;
end;
$$;


drop trigger if exists complaints_set_sla_due_at on public.complaints;

create trigger complaints_set_sla_due_at
before insert or update of priority_level on public.complaints
for each row
execute function public.set_complaint_sla_due_at();


-- ============================================================
-- 4. DEPARTMENT REFERENCE DATA
-- ============================================================
--
-- Codes must match mapAIDepartmentToCode() in
-- src/lib/services/ai.ts exactly — that function resolves a
-- department by code, and a mismatch leaves department_id null and
-- the complaint unrouted.
--
-- Note these are NOT the codes in the DEPARTMENTS constant in
-- src/lib/constants.ts (ENG/SAN/ELEC/WTR/RDS). That constant is not
-- used for any database lookup; ai.ts is the contract that matters.

insert into public.departments (name, code, description) values
  ('Roads & Infrastructure', 'ROADS',      'Road surfaces, footpaths and structural repairs'),
  ('Sanitation',             'SANITATION', 'Waste collection, public cleanliness and sanitation'),
  ('Water Works',            'WATER',      'Water supply, leakage and pipeline maintenance'),
  ('Drainage',               'DRAINAGE',   'Storm drains, sewerage and waterlogging'),
  ('Electrical',             'ELECTRICAL', 'Street lighting and electrical infrastructure'),
  ('Traffic',                'TRAFFIC',    'Signals, signage and traffic management'),
  ('Public Safety',          'SAFETY',     'Hazards, open manholes and public safety risks'),
  ('General',                'OTHER',      'Unclassified civic issues awaiting routing')
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description;


-- ============================================================
-- 5. WARD REFERENCE DATA
-- ============================================================
-- Placeholder administrative wards so ward-level reporting has real
-- rows to aggregate. Replace with the actual municipal ward list
-- before production use.

insert into public.wards (name, code) values
  ('Ward 1 — Central',   'W01'),
  ('Ward 2 — North',     'W02'),
  ('Ward 3 — South',     'W03'),
  ('Ward 4 — East',      'W04'),
  ('Ward 5 — West',      'W05'),
  ('Ward 6 — Northeast', 'W06')
on conflict (code) do update
  set name = excluded.name;


-- ============================================================
-- 6. SUPPORTING INDEXES
-- ============================================================
-- The new work-order joins filter on complaint_id and department_id.

create index if not exists work_orders_complaint_id_idx
  on public.work_orders(complaint_id);

create index if not exists work_orders_department_id_idx
  on public.work_orders(department_id);

create index if not exists complaint_media_complaint_id_idx
  on public.complaint_media(complaint_id);

create index if not exists ai_analysis_complaint_id_idx
  on public.ai_analysis(complaint_id);
