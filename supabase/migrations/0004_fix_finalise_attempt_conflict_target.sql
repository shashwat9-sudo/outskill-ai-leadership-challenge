-- =============================================================================================
-- 0004_fix_finalise_attempt_conflict_target.sql — resolve the last ambiguous reference
--
-- 0003 qualified the `attempt_id` reference in the correct-count query, but finalise_attempt has a
-- second one that qualification cannot reach: the ON CONFLICT inference list
--
--   on conflict (attempt_id, question_id) do nothing
--
-- PL/pgSQL substitutes variables inside that list, so it collides with the `attempt_id` output
-- column, and SQL does not permit a table-qualified name in a conflict target — `on conflict
-- (attempt_answers.attempt_id, ...)` is a syntax error.
--
-- `#variable_conflict use_column` resolves any such collision in favour of the column, which is the
-- intended reading everywhere in this function: every genuine variable reference in the body is
-- either a record field (v_attempt.*) or a distinctly named local (v_status, v_correct_count) or
-- parameter (p_*), none of which this directive affects.
--
-- The function is otherwise unchanged from 0002 + 0003: same signature, same output column names,
-- same locking, same idempotency, same scoring.
-- =============================================================================================

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
#variable_conflict use_column
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
