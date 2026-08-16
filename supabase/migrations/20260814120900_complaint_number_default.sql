-- ============================================================
-- COMPLAINT NUMBER: A COLUMN DEFAULT, NOT ONLY A TRIGGER
-- ============================================================
--
-- REPORTED FROM A REAL DEPLOYMENT
--
--   Create complaint error: null value in column "complaint_number"
--   of relation "complaints" violates not-null constraint
--
-- complaint_number is `text not null` with no default, and since
-- 20260814120400 the client stopped supplying one — the number is
-- allocated by the complaints_set_number BEFORE INSERT trigger instead.
-- That is correct as long as the trigger exists. If the database is
-- behind on migrations, or that migration was applied partially, the
-- trigger is absent and every submission fails on the NOT NULL
-- constraint with a message no citizen can act on.
--
-- One mechanism guarding a required column is a single point of failure,
-- so the column now carries a DEFAULT as well.
--
-- WHY BOTH
--
-- They cover different cases and cannot fight:
--
--   * INSERT that omits the column  -> the DEFAULT fills it. The trigger
--     then sees a non-null value and leaves it alone.
--   * INSERT that passes an explicit NULL -> a DEFAULT does not apply to
--     an explicit NULL, so the trigger is what catches that.
--
-- Both draw from public.complaint_number_seq, so there is still exactly
-- one number per complaint and no possibility of a collision.
-- ============================================================

-- The generator, extracted so the column default and the trigger cannot
-- drift apart in format.
create or replace function public.next_complaint_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select
    'NS-'
    || to_char(now(), 'YYYY')
    || '-'
    || lpad(nextval('public.complaint_number_seq')::text, 6, '0');
$$;

comment on function public.next_complaint_number() is
  'Allocates the next NS-<year>-<sequence> complaint number. Used by both the complaints.complaint_number default and set_complaint_number().';


alter table public.complaints
  alter column complaint_number
  set default public.next_complaint_number();


-- Re-pointed at the shared generator. The guard stays: with the default
-- in place this trigger is normally a no-op, and it exists for the
-- explicit-NULL case the default cannot reach.
create or replace function public.set_complaint_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.complaint_number is null or btrim(new.complaint_number) = '' then
    new.complaint_number := public.next_complaint_number();
  end if;

  return new;
end;
$$;


-- A column default is evaluated as the calling role, so `authenticated`
-- needs EXECUTE on the generator. The sequence itself is reached from
-- inside a SECURITY DEFINER function and so needs no grant of its own;
-- it is granted anyway so the arrangement does not silently break if
-- that function is ever made SECURITY INVOKER.
grant execute on function public.next_complaint_number() to authenticated;
grant usage, select on sequence public.complaint_number_seq to authenticated;


-- ============================================================
-- STATUS HISTORY: WALL-CLOCK ORDERING WITHIN A TRANSACTION
-- ============================================================
--
-- record_complaint_status() relied on the created_at column default,
-- which is now(). now() is the *transaction* start time and does not
-- advance, so two transitions in one transaction — an officer's status
-- change followed by the complaint sync, or a staff update batch — were
-- stamped identically. Ordering then fell back to comparing random
-- uuids, so the recorded sequence came out arbitrary:
--
--   submitted -> ai_analyzed -> in_progress -> assigned
--
-- which is not what happened. The citizen timeline picks the first event
-- per stage, so it was reading an arbitrary one of the two as well.
--
-- clock_timestamp() reads the actual clock at each statement, which is
-- what an event log wants: two transitions that happened in sequence are
-- recorded in that sequence, even inside one transaction.

create or replace function public.record_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if tg_op = 'INSERT' then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, created_at)
    values
      (new.id, new.status, (select auth.uid()), clock_timestamp());

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, created_at)
    values
      (new.id, new.status, (select auth.uid()), clock_timestamp());
  end if;

  return new;

end;
$$;
