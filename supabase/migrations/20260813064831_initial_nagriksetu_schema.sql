-- ============================================================
-- NAGRIKSETU INITIAL DATABASE SCHEMA
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type public.user_role as enum (
  'citizen',
  'officer',
  'supervisor',
  'government_admin'
);

create type public.complaint_category as enum (
  'garbage',
  'water_leakage',
  'pothole',
  'drainage',
  'streetlight',
  'other'
);

create type public.complaint_status as enum (
  'submitted',
  'ai_analyzed',
  'assigned',
  'accepted',
  'in_progress',
  'proof_submitted',
  'supervisor_review',
  'citizen_confirmation',
  'resolved',
  'reopened',
  'rejected'
);

create type public.priority_level as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.work_order_status as enum (
  'assigned',
  'accepted',
  'in_progress',
  'proof_submitted',
  'supervisor_review',
  'citizen_confirmation',
  'resolved',
  'reopened'
);

create type public.verification_status as enum (
  'pending',
  'approved',
  'rejected'
);

-- ============================================================
-- PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  role public.user_role not null default 'citizen',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- DEPARTMENTS
-- ============================================================

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- WARDS
-- ============================================================

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- COMPLAINTS
-- ============================================================

create table public.complaints (
  id uuid primary key default gen_random_uuid(),

  complaint_number text not null unique,

  citizen_id uuid not null
    references public.profiles(id)
    on delete cascade,

  title text not null,
  description text not null,

  category public.complaint_category not null default 'other',
  status public.complaint_status not null default 'submitted',

  latitude double precision,
  longitude double precision,
  address text,

  ward_id uuid
    references public.wards(id)
    on delete set null,

  department_id uuid
    references public.departments(id)
    on delete set null,

  priority_score integer
    check (priority_score >= 0 and priority_score <= 100),

  priority_level public.priority_level,

  priority_reason text,

  sla_due_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COMPLAINT MEDIA
-- ============================================================

create table public.complaint_media (
  id uuid primary key default gen_random_uuid(),

  complaint_id uuid not null
    references public.complaints(id)
    on delete cascade,

  storage_path text not null,
  file_name text not null,
  file_type text not null,

  uploaded_by uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz not null default now()
);

-- ============================================================
-- AI ANALYSIS
-- ============================================================

create table public.ai_analysis (
  id uuid primary key default gen_random_uuid(),

  complaint_id uuid not null
    references public.complaints(id)
    on delete cascade,

  category public.complaint_category,
  category_confidence numeric(5,2),

  recommended_department_id uuid
    references public.departments(id)
    on delete set null,

  severity numeric(5,2),
  public_impact numeric(5,2),
  location_risk numeric(5,2),

  duplicate_probability numeric(5,2),

  reasoning text,

  model text,

  created_at timestamptz not null default now()
);

-- ============================================================
-- DUPLICATE CLUSTERS
-- ============================================================

create table public.duplicate_clusters (
  id uuid primary key default gen_random_uuid(),

  primary_complaint_id uuid not null
    references public.complaints(id)
    on delete cascade,

  similarity_score numeric(5,2),

  created_at timestamptz not null default now()
);

create table public.duplicate_cluster_members (
  cluster_id uuid not null
    references public.duplicate_clusters(id)
    on delete cascade,

  complaint_id uuid not null
    references public.complaints(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (cluster_id, complaint_id)
);

-- ============================================================
-- WORK ORDERS
-- ============================================================

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),

  work_order_number text not null unique,

  complaint_id uuid not null unique
    references public.complaints(id)
    on delete cascade,

  department_id uuid
    references public.departments(id)
    on delete set null,

  officer_id uuid
    references public.profiles(id)
    on delete set null,

  status public.work_order_status not null default 'assigned',

  assigned_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- WORK ORDER UPDATES
-- ============================================================

create table public.work_order_updates (
  id uuid primary key default gen_random_uuid(),

  work_order_id uuid not null
    references public.work_orders(id)
    on delete cascade,

  status public.work_order_status not null,

  note text,

  created_by uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz not null default now()
);

-- ============================================================
-- RESOLUTION PROOFS
-- ============================================================

create table public.resolution_proofs (
  id uuid primary key default gen_random_uuid(),

  work_order_id uuid not null
    references public.work_orders(id)
    on delete cascade,

  storage_path text not null,

  description text,

  uploaded_by uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz not null default now()
);

-- ============================================================
-- VERIFICATIONS
-- ============================================================

create table public.verifications (
  id uuid primary key default gen_random_uuid(),

  work_order_id uuid not null unique
    references public.work_orders(id)
    on delete cascade,

  supervisor_id uuid
    references public.profiles(id)
    on delete set null,

  supervisor_status public.verification_status
    not null default 'pending',

  supervisor_comment text,

  citizen_status public.verification_status
    not null default 'pending',

  citizen_comment text,

  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  title text not null,
  message text not null,

  type text,

  is_read boolean not null default false,

  created_at timestamptz not null default now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),

  actor_id uuid
    references public.profiles(id)
    on delete set null,

  action text not null,

  entity_type text not null,

  entity_id uuid,

  metadata jsonb,

  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index complaints_citizen_id_idx
  on public.complaints(citizen_id);

create index complaints_status_idx
  on public.complaints(status);

create index complaints_category_idx
  on public.complaints(category);

create index complaints_department_id_idx
  on public.complaints(department_id);

create index complaints_ward_id_idx
  on public.complaints(ward_id);

create index complaints_created_at_idx
  on public.complaints(created_at desc);

create index work_orders_officer_id_idx
  on public.work_orders(officer_id);

create index work_orders_status_idx
  on public.work_orders(status);

create index notifications_user_id_idx
  on public.notifications(user_id);

create index notifications_created_at_idx
  on public.notifications(created_at desc);

create index audit_logs_actor_id_idx
  on public.audit_logs(actor_id);

create index audit_logs_created_at_idx
  on public.audit_logs(created_at desc);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.wards enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_media enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.duplicate_clusters enable row level security;
alter table public.duplicate_cluster_members enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_updates enable row level security;
alter table public.resolution_proofs enable row level security;
alter table public.verifications enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;