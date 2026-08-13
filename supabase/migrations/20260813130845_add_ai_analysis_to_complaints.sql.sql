-- ============================================================
-- NAGRIKSETU
-- AI ANALYSIS FIELDS
-- ============================================================
--
-- Adds AI-powered classification and prioritization fields
-- to the complaints table.
--
-- AI pipeline:
--
-- Complaint
--    ↓
-- AI Analysis
--    ├── Category
--    ├── Severity
--    ├── Priority
--    ├── Department
--    ├── Confidence
--    ├── Summary
--    └── Duplicate Detection
--
-- ============================================================


-- ============================================================
-- 1. AI ANALYSIS STATUS
-- ============================================================

alter table public.complaints
add column if not exists ai_analysis_status text
default 'pending';


-- ============================================================
-- 2. AI CATEGORY
-- ============================================================

alter table public.complaints
add column if not exists ai_category text;


-- ============================================================
-- 3. AI SEVERITY
-- ============================================================

alter table public.complaints
add column if not exists ai_severity text;


-- ============================================================
-- 4. AI PRIORITY
-- ============================================================

alter table public.complaints
add column if not exists ai_priority text;


-- ============================================================
-- 5. AI DEPARTMENT
-- ============================================================

alter table public.complaints
add column if not exists ai_department text;


-- ============================================================
-- 6. AI CONFIDENCE
-- ============================================================

alter table public.complaints
add column if not exists ai_confidence numeric(5,4);


-- ============================================================
-- 7. AI SUMMARY
-- ============================================================

alter table public.complaints
add column if not exists ai_summary text;


-- ============================================================
-- 8. POSSIBLE DUPLICATE
-- ============================================================

alter table public.complaints
add column if not exists ai_possible_duplicate boolean
default false;


-- ============================================================
-- 9. DUPLICATE COMPLAINT ID
-- ============================================================

alter table public.complaints
add column if not exists ai_duplicate_complaint_id uuid;


-- ============================================================
-- 10. AI REASONING
-- ============================================================

alter table public.complaints
add column if not exists ai_reasoning text;


-- ============================================================
-- 11. AI MODEL
-- ============================================================

alter table public.complaints
add column if not exists ai_model text;


-- ============================================================
-- 12. AI PROCESSED AT
-- ============================================================

alter table public.complaints
add column if not exists ai_processed_at timestamptz;


-- ============================================================
-- 13. AI ERROR MESSAGE
-- ============================================================

alter table public.complaints
add column if not exists ai_error_message text;


-- ============================================================
-- 14. CONSTRAINTS
-- ============================================================

alter table public.complaints
drop constraint if exists complaints_ai_analysis_status_check;

alter table public.complaints
add constraint complaints_ai_analysis_status_check
check (
  ai_analysis_status in (
    'pending',
    'processing',
    'completed',
    'failed'
  )
);


alter table public.complaints
drop constraint if exists complaints_ai_severity_check;

alter table public.complaints
add constraint complaints_ai_severity_check
check (
  ai_severity is null
  or ai_severity in (
    'low',
    'medium',
    'high',
    'critical'
  )
);


alter table public.complaints
drop constraint if exists complaints_ai_priority_check;

alter table public.complaints
add constraint complaints_ai_priority_check
check (
  ai_priority is null
  or ai_priority in (
    'P1',
    'P2',
    'P3',
    'P4'
  )
);


alter table public.complaints
drop constraint if exists complaints_ai_confidence_check;

alter table public.complaints
add constraint complaints_ai_confidence_check
check (
  ai_confidence is null
  or (
    ai_confidence >= 0
    and ai_confidence <= 1
  )
);


-- ============================================================
-- 15. DUPLICATE COMPLAINT FOREIGN KEY
-- ============================================================

alter table public.complaints
drop constraint if exists complaints_ai_duplicate_complaint_id_fkey;

alter table public.complaints
add constraint complaints_ai_duplicate_complaint_id_fkey
foreign key (
  ai_duplicate_complaint_id
)
references public.complaints(id)
on delete set null;


-- ============================================================
-- 16. INDEXES
-- ============================================================

create index if not exists idx_complaints_ai_status
on public.complaints(ai_analysis_status);


create index if not exists idx_complaints_ai_category
on public.complaints(ai_category);


create index if not exists idx_complaints_ai_priority
on public.complaints(ai_priority);


create index if not exists idx_complaints_ai_department
on public.complaints(ai_department);


-- ============================================================
-- 17. COMMENTS
-- ============================================================

comment on column public.complaints.ai_analysis_status
is 'Current status of AI complaint analysis.';

comment on column public.complaints.ai_category
is 'Category predicted by AI.';

comment on column public.complaints.ai_severity
is 'Severity predicted by AI.';

comment on column public.complaints.ai_priority
is 'Priority predicted by AI.';

comment on column public.complaints.ai_department
is 'Government department recommended by AI.';

comment on column public.complaints.ai_confidence
is 'AI confidence score between 0 and 1.';

comment on column public.complaints.ai_summary
is 'AI-generated summary of the complaint.';

comment on column public.complaints.ai_possible_duplicate
is 'Indicates whether AI suspects this complaint is a duplicate.';

comment on column public.complaints.ai_duplicate_complaint_id
is 'Potential duplicate complaint identified by AI.';

comment on column public.complaints.ai_reasoning
is 'Explanation generated by the AI for its classification.';

comment on column public.complaints.ai_model
is 'AI model/provider used for analysis.';

comment on column public.complaints.ai_processed_at
is 'Timestamp when AI analysis completed.';

comment on column public.complaints.ai_error_message
is 'Error information when AI processing fails.';