-- ============================================================
-- COLLISION-FREE COMPLAINT NUMBERS
-- ============================================================
--
-- THE PROBLEM
--
-- public.complaints.complaint_number is `text not null unique`, but it
-- was generated in the browser by
-- src/lib/services/complaints.ts::generateComplaintNumber():
--
--   `NS-${year}-${Math.floor(100000 + Math.random() * 900000)}`
--
-- Six random digits is a space of 900,000 values shared by every
-- complaint filed in a given year. By the birthday bound a duplicate
-- becomes more likely than not at roughly 1,100 complaints per year —
-- well inside the load a single city ward produces. A duplicate raises
-- 23505 (unique_violation), which surfaces to the citizen as a failed
-- submission after they have already taken the photo and the GPS fix,
-- with no retry that would help.
--
-- THE FIX
--
-- Postgres allocates the number. A sequence cannot collide, and the
-- allocation is transactional, so two simultaneous reports get two
-- numbers without any coordination in the client.
--
-- The trigger fires BEFORE INSERT, which in Postgres runs before the
-- NOT NULL check, so the column can stay `not null` with no default —
-- the same arrangement already used for work_orders.work_order_number.
--
-- The `NS-` prefix is kept deliberately. Complaint numbers are quoted
-- to citizens and printed on acknowledgements; existing rows carry
-- `NS-`, and switching new ones to `CT-` would split the identifier
-- space for a cosmetic gain. Renaming it is a data-migration decision,
-- not a side effect of fixing uniqueness.
-- ============================================================

create sequence if not exists public.complaint_number_seq;


create or replace function public.set_complaint_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only allocate when the caller did not supply one. Existing rows and
  -- any deliberate backfill keep their number.
  if new.complaint_number is null or btrim(new.complaint_number) = '' then
    new.complaint_number :=
      'NS-'
      || to_char(now(), 'YYYY')
      || '-'
      || lpad(nextval('public.complaint_number_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;


drop trigger if exists complaints_set_number on public.complaints;

create trigger complaints_set_number
before insert on public.complaints
for each row
execute function public.set_complaint_number();


-- ------------------------------------------------------------
-- Start the sequence past anything already issued.
--
-- Existing numbers are random rather than sequential, so the highest
-- numeric suffix in the table is the only safe floor. Non-numeric
-- suffixes are ignored rather than allowed to abort the migration.
-- ------------------------------------------------------------

do $$
declare
  highest bigint;
begin
  select coalesce(max((regexp_match(complaint_number, '(\d+)$'))[1]::bigint), 0)
    into highest
  from public.complaints
  where complaint_number ~ '\d+$';

  if highest > 0 then
    perform setval('public.complaint_number_seq', highest);
  end if;
end;
$$;
