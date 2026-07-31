-- =============================================================================================
-- 0002_functions.sql — authoritative ranking view and the atomic operations
--
-- Anything where two tablets could race is a single function here rather than a sequence of
-- statements issued from the application: registration, starting a run, finalising a run,
-- resetting a participant, and changing the quiz state.
--
-- Every function is SECURITY DEFINER with a pinned search_path and is executable only by the
-- service role, which is the only role the application ever uses.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- leaderboard_view — the single source of truth for rank
-- ---------------------------------------------------------------------------------------------

create or replace view leaderboard_view as
select
  row_number() over (
    order by a.correct_count desc, a.elapsed_ms asc, a.submitted_at asc
  )::int                                  as rank,
  a.id                                    as attempt_id,
  a.participant_id,
  a.correct_count,
  a.elapsed_ms,
  a.submitted_at,
  (a.verified_at is not null)             as verified,
  a.public_number,
  p.full_name,
  p.public_leaderboard_opt_in
from attempts a
join participants p on p.id = a.participant_id
where a.status = 'submitted'
  and a.disqualified_at is null
  and a.invalidated_at is null;

-- ---------------------------------------------------------------------------------------------
-- register_participant — duplicate-safe registration
--
-- Returns (participant_id, duplicate). `duplicate` is true when either the email or the phone
-- already exists. The caller must NOT be told which one matched: revealing that turns the booth
-- form into an account-enumeration oracle.
-- ---------------------------------------------------------------------------------------------

create or replace function register_participant(
  p_full_name        text,
  p_email            text,
  p_email_normalized text,
  p_phone_original   text,
  p_phone_e164       text,
  p_public_opt_in    boolean,
  p_marketing_opt_in boolean
)
returns table (participant_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- One statement, so two simultaneous inserts of the same person cannot both succeed.
  insert into participants (
    full_name, email, email_normalized, phone_original, phone_e164,
    public_leaderboard_opt_in, marketing_opt_in, accepted_rules_at
  )
  values (
    btrim(p_full_name), btrim(p_email), p_email_normalized, btrim(p_phone_original), p_phone_e164,
    p_public_opt_in, p_marketing_opt_in, now()
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    insert into attempts (participant_id, status) values (v_id, 'registered');
    return query select v_id, false;
    return;
  end if;

  -- Conflict on either unique index. Look the person up so the caller can log a participant id,
  -- but report only the generic duplicate flag.
  select id into v_id
  from participants
  where email_normalized = p_email_normalized or phone_e164 = p_phone_e164
  limit 1;

  return query select v_id, true;
end;
$$;

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
    and status in ('registered', 'in_progress', 'submitted', 'timed_out')
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
  where attempt_id = p_attempt_id and is_correct;

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

-- ---------------------------------------------------------------------------------------------
-- reset_participant — recover from a genuine technical failure
--
-- Never deletes anything. The old attempt is invalidated (so it drops off the leaderboard and frees
-- the one-live-attempt index) and a fresh 'registered' attempt is created that points back at it.
-- ---------------------------------------------------------------------------------------------

create or replace function reset_participant(
  p_participant_id uuid,
  p_reason         text
)
returns table (new_attempt_id uuid, invalidated_attempt_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  select id into v_old_id
  from attempts
  where participant_id = p_participant_id
    and status in ('registered', 'in_progress', 'submitted', 'timed_out')
  order by created_at desc
  limit 1
  for update;

  if v_old_id is not null then
    update attempts
       set status = 'invalidated', invalidated_at = now()
     where id = v_old_id;
  end if;

  insert into attempts (participant_id, status, replacement_for_attempt_id)
  values (p_participant_id, 'registered', v_old_id)
  returning id into v_new_id;

  insert into admin_audit_log (action, target_type, target_id, detail)
  values ('participant.reset', 'participant', p_participant_id,
          jsonb_build_object('reason', p_reason,
                             'invalidated_attempt_id', v_old_id,
                             'new_attempt_id', v_new_id));

  return query select v_new_id, v_old_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- set_quiz_state — start / pause / lock, with an audit entry in the same transaction
-- ---------------------------------------------------------------------------------------------

create or replace function set_quiz_state(p_state quiz_state, p_actor text)
returns quiz_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous quiz_state;
begin
  select quiz_state into v_previous from app_settings where id = 'singleton' for update;

  update app_settings set quiz_state = p_state where id = 'singleton';

  insert into admin_audit_log (action, target_type, target_id, detail, actor_label)
  values ('quiz.state_changed', 'app_settings', null,
          jsonb_build_object('from', v_previous, 'to', p_state), p_actor);

  return p_state;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- event_stats — the numbers shown on the leaderboard, LED display and admin dashboard
-- ---------------------------------------------------------------------------------------------

create or replace function event_stats()
returns table (
  total_challengers      bigint,
  total_completed        bigint,
  average_score          numeric,
  best_score             integer,
  fastest_perfect_ms     integer,
  toughest_pillar        text,
  toughest_pillar_accuracy numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (select * from leaderboard_view),
  pillar_accuracy as (
    select q.pillar::text as pillar,
           avg(case when aa.is_correct then 1.0 else 0.0 end) as accuracy,
           count(*) as answered
    from attempt_answers aa
    join questions q on q.id = aa.question_id
    join attempts a  on a.id = aa.attempt_id and a.status = 'submitted' and a.disqualified_at is null
    group by q.pillar
    -- Ignore pillars with a trivial sample; a single wrong answer should not crown a "toughest pillar".
    having count(*) >= 10
  )
  select
    (select count(*) from participants),
    (select count(*) from ranked),
    (select round(avg(correct_count)::numeric, 2) from ranked),
    (select max(correct_count) from ranked),
    -- "Fastest perfect score" means a full-marks run, so compare against the configured attempt size.
    (select min(r.elapsed_ms) from ranked r
      where r.correct_count = (select questions_per_attempt from app_settings where id = 'singleton')),
    (select pillar from pillar_accuracy order by accuracy asc, pillar asc limit 1),
    (select round(accuracy::numeric, 3) from pillar_accuracy order by accuracy asc, pillar asc limit 1);
$$;

-- ---------------------------------------------------------------------------------------------
-- prune_rate_limit_events — housekeeping so the table stays small across a two-day event
-- ---------------------------------------------------------------------------------------------

create or replace function prune_rate_limit_events(p_older_than_minutes integer default 60)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limit_events
   where created_at < now() - make_interval(mins => p_older_than_minutes);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permissions: only the service role (used exclusively by server-side application code) may execute.
-- ---------------------------------------------------------------------------------------------

revoke all on function register_participant(text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function start_attempt(uuid, integer, jsonb)                                   from public, anon, authenticated;
revoke all on function finalise_attempt(uuid, jsonb, integer, boolean)                       from public, anon, authenticated;
revoke all on function reset_participant(uuid, text)                                         from public, anon, authenticated;
revoke all on function set_quiz_state(quiz_state, text)                                      from public, anon, authenticated;
revoke all on function event_stats()                                                         from public, anon, authenticated;
revoke all on function prune_rate_limit_events(integer)                                      from public, anon, authenticated;

grant execute on function register_participant(text, text, text, text, text, boolean, boolean) to service_role;
grant execute on function start_attempt(uuid, integer, jsonb)                                   to service_role;
grant execute on function finalise_attempt(uuid, jsonb, integer, boolean)                       to service_role;
grant execute on function reset_participant(uuid, text)                                         to service_role;
grant execute on function set_quiz_state(quiz_state, text)                                      to service_role;
grant execute on function event_stats()                                                         to service_role;
grant execute on function prune_rate_limit_events(integer)                                      to service_role;

revoke all on leaderboard_view from anon, authenticated;
grant select on leaderboard_view to service_role;
