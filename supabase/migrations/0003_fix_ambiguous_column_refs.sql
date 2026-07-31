-- =============================================================================================
-- 0003_fix_ambiguous_column_refs.sql — qualify two column references
--
-- Both functions below declare `returns table (...)` output columns whose names also exist as
-- columns on the tables they query. Inside PL/pgSQL an output column is a variable in scope, so an
-- unqualified reference to that name is ambiguous and Postgres refuses to run the query:
--
--   start_attempt     out column `status`      vs attempts.status
--                     -> ERROR: column reference "status" is ambiguous
--   finalise_attempt  out column `attempt_id`  vs attempt_answers.attempt_id
--
-- The only change here is qualifying those two references with their table name. Signatures,
-- output column names, ordering, locking, scoring and every other statement are unchanged, so
-- application code that reads these results by name is unaffected.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- start_attempt — stamp the server clock and lock in the question set atomically
--
-- p_questions is [{"question_id": uuid, "display_order": int, "option_order": ["c","a","d","b"]}, ...]
-- selected by the application. Timing is set here, from the database clock, never from the client.
-- ---------------------------------------------------------------------------------------------

create or replace function start_attempt(
  p_participant_id uuid,
  p_duration_seconds integer,
  p_questions jsonb
)
returns table (
  attempt_id uuid,
  started_at timestamptz,
  deadline_at timestamptz,
  already_started boolean,
  status attempt_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt attempts%rowtype;
  v_now     timestamptz := now();
begin
  -- Lock the participant's live attempt row so a double-tap on "Start Challenge" cannot start twice.
  select * into v_attempt
  from attempts
  where participant_id = p_participant_id
    and attempts.status in ('registered', 'in_progress', 'submitted', 'timed_out')
  order by created_at desc
  limit 1
  for update;

  if v_attempt.id is null then
    raise exception 'no_live_attempt' using errcode = 'P0002';
  end if;

  -- Already running or already finished: return the existing timing so a refresh resumes cleanly
  -- instead of quietly granting a second run.
  if v_attempt.status <> 'registered' then
    return query select v_attempt.id, v_attempt.started_at, v_attempt.deadline_at, true, v_attempt.status;
    return;
  end if;

  update attempts
     set status      = 'in_progress',
         started_at  = v_now,
         deadline_at = v_now + make_interval(secs => p_duration_seconds)
   where id = v_attempt.id
   returning * into v_attempt;

  insert into attempt_questions (attempt_id, question_id, display_order, option_order)
  select v_attempt.id,
         (item->>'question_id')::uuid,
         (item->>'display_order')::int,
         item->'option_order'
  from jsonb_array_elements(p_questions) item;

  return query select v_attempt.id, v_attempt.started_at, v_attempt.deadline_at, false, v_attempt.status;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- finalise_attempt — score an attempt exactly once
--
-- Idempotent by construction: if the attempt is already finished, the stored result is returned and
-- nothing is written. That is what makes the client's retry-with-backoff safe on bad venue Wi-Fi.
--
-- p_answers is [{"question_id": uuid, "selected_option_id": "a"|null, "answered_offset_ms": int|null}, ...]
-- Correctness is computed here from the questions table — the client never sends it.
-- ---------------------------------------------------------------------------------------------

create or replace function finalise_attempt(
  p_attempt_id  uuid,
  p_answers     jsonb,
  p_elapsed_ms  integer,
  p_timed_out   boolean
)
returns table (
  attempt_id     uuid,
  status         attempt_status,
  correct_count  integer,
  elapsed_ms     integer,
  submitted_at   timestamptz,
  already_final  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt       attempts%rowtype;
  v_correct_count integer;
  v_status        attempt_status;
begin
  select * into v_attempt from attempts where id = p_attempt_id for update;

  if v_attempt.id is null then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status in ('submitted', 'timed_out') then
    return query select v_attempt.id, v_attempt.status, v_attempt.correct_count,
                        v_attempt.elapsed_ms, v_attempt.submitted_at, true;
    return;
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_not_startable' using errcode = 'P0001';
  end if;

  -- Record answers only for questions that were actually served to this attempt, so a crafted
  -- payload cannot inject extra rows or answer a question the participant never saw.
  insert into attempt_answers (attempt_id, question_id, selected_option_id, answered_offset_ms, is_correct)
  select p_attempt_id,
         aq.question_id,
         nullif(item->>'selected_option_id', ''),
         nullif(item->>'answered_offset_ms', '')::int,
         (item->>'selected_option_id') is not null
           and (item->>'selected_option_id') = q.correct_option_id
  from jsonb_array_elements(p_answers) item
  join attempt_questions aq
    on aq.attempt_id = p_attempt_id
   and aq.question_id = (item->>'question_id')::uuid
  join questions q on q.id = aq.question_id
  on conflict (attempt_id, question_id) do nothing;

  -- Unanswered questions are simply absent from attempt_answers and therefore count as incorrect.
  select count(*)::int into v_correct_count
  from attempt_answers
  where attempt_answers.attempt_id = p_attempt_id and is_correct;

  v_status := case when p_timed_out then 'timed_out'::attempt_status else 'submitted'::attempt_status end;

  update attempts
     set status        = v_status,
         submitted_at  = now(),
         correct_count = v_correct_count,
         elapsed_ms    = p_elapsed_ms
   where id = p_attempt_id
   returning * into v_attempt;

  return query select v_attempt.id, v_attempt.status, v_attempt.correct_count,
                      v_attempt.elapsed_ms, v_attempt.submitted_at, false;
end;
$$;
