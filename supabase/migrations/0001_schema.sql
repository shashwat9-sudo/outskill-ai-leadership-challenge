-- =============================================================================================
-- 0001_schema.sql — core tables, constraints and indexes
--
-- The 60-Second AI Leadership Challenge (Outskill @ People Matters TechHR Summit 2026)
--
-- Run this in the Supabase SQL Editor before 0002 and 0003.
-- =============================================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------------------------
-- Enumerated domains
-- ---------------------------------------------------------------------------------------------

do $$ begin
  create type pillar as enum (
    'business_judgment', 'responsible_ai', 'hr_workforce', 'work_design', 'adoption_change'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('draft', 'reviewed', 'approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum (
    'registered', 'in_progress', 'submitted', 'timed_out', 'invalidated', 'disqualified'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type quiz_state as enum ('active', 'paused', 'locked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------------------------

create table if not exists participants (
  id                        uuid primary key default gen_random_uuid(),
  full_name                 text        not null check (char_length(btrim(full_name)) between 2 and 80),
  email                     text        not null,
  email_normalized          text        not null,
  phone_original            text        not null,
  phone_e164                text        not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  public_leaderboard_opt_in boolean     not null default false,
  marketing_opt_in          boolean     not null default false,
  accepted_rules_at         timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- The two duplicate rules the product depends on. Enforced in the database, not only in application
-- code, so a race between two tablets cannot create a second row for the same person.
create unique index if not exists participants_email_normalized_key on participants (email_normalized);
create unique index if not exists participants_phone_e164_key       on participants (phone_e164);

-- Supports admin search by partial name / email / phone.
create index if not exists participants_full_name_idx  on participants (lower(full_name) text_pattern_ops);
create index if not exists participants_email_idx      on participants (email_normalized text_pattern_ops);
create index if not exists participants_phone_idx      on participants (phone_e164 text_pattern_ops);
create index if not exists participants_created_at_idx on participants (created_at desc);
create index if not exists participants_marketing_idx  on participants (marketing_opt_in) where marketing_opt_in;

drop trigger if exists participants_set_updated_at on participants;
create trigger participants_set_updated_at before update on participants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------------------------

create table if not exists questions (
  id                uuid          primary key default gen_random_uuid(),
  code              text          not null unique,
  pillar            pillar        not null,
  difficulty        difficulty    not null,
  question_text     text          not null check (char_length(btrim(question_text)) >= 10),
  -- [{"id":"a","text":"..."}, ...] — exactly four options with ids a/b/c/d.
  options           jsonb         not null,
  correct_option_id text          not null check (correct_option_id in ('a','b','c','d')),
  explanation       text          not null,
  active            boolean       not null default true,
  review_status     review_status not null default 'draft',
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  -- Cheap structural checks that a CHECK constraint can express (no subqueries allowed here).
  constraint questions_options_is_quad check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4
  )
);

-- The remaining option-shape rules need to inspect array elements, which a CHECK constraint cannot do.
-- A BEFORE trigger gives the same guarantee: a malformed question can never be stored.
create or replace function validate_question_options()
returns trigger
language plpgsql
as $$
declare
  distinct_ids integer;
  well_formed  boolean;
  has_correct  boolean;
begin
  select count(distinct o->>'id'), bool_and((o ? 'id') and (o ? 'text') and char_length(btrim(o->>'text')) > 0)
    into distinct_ids, well_formed
    from jsonb_array_elements(new.options) o;

  if distinct_ids <> 4 or not coalesce(well_formed, false) then
    raise exception 'questions.options must contain four distinct options, each with a non-empty id and text';
  end if;

  select exists (select 1 from jsonb_array_elements(new.options) o where o->>'id' = new.correct_option_id)
    into has_correct;

  if not has_correct then
    raise exception 'questions.correct_option_id (%) is not one of the options on this row', new.correct_option_id;
  end if;

  return new;
end;
$$;

drop trigger if exists questions_validate_options on questions;
create trigger questions_validate_options before insert or update on questions
  for each row execute function validate_question_options();

-- The exact filter used when building an attempt.
create index if not exists questions_serveable_idx
  on questions (difficulty, pillar)
  where active and review_status in ('reviewed', 'approved');

create index if not exists questions_pillar_idx        on questions (pillar);
create index if not exists questions_difficulty_idx    on questions (difficulty);
create index if not exists questions_active_idx        on questions (active);
create index if not exists questions_review_status_idx on questions (review_status);
create index if not exists questions_code_idx          on questions (code text_pattern_ops);

drop trigger if exists questions_set_updated_at on questions;
create trigger questions_set_updated_at before update on questions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------------------------

create sequence if not exists attempt_public_number_seq start with 100;

create table if not exists attempts (
  id                         uuid           primary key default gen_random_uuid(),
  participant_id             uuid           not null references participants (id) on delete cascade,
  status                     attempt_status not null default 'registered',
  started_at                 timestamptz,
  deadline_at                timestamptz,
  submitted_at               timestamptz,
  correct_count              integer        check (correct_count is null or correct_count >= 0),
  elapsed_ms                 integer        check (elapsed_ms is null or elapsed_ms >= 0),
  verified_at                timestamptz,
  verified_by                text,
  disqualified_at            timestamptz,
  disqualified_by            text,
  disqualification_reason    text,
  invalidated_at             timestamptz,
  replacement_for_attempt_id uuid           references attempts (id) on delete set null,
  -- Non-sensitive public identifier used for "Anonymous Leader 184". Never the database id.
  public_number              integer        not null default nextval('attempt_public_number_seq'),
  created_at                 timestamptz    not null default now(),
  updated_at                 timestamptz    not null default now(),

  -- Status is the single source of truth; these keep the timestamps from contradicting it.
  constraint attempts_disqualified_consistent check (
    (status = 'disqualified') = (disqualified_at is not null)
  ),
  constraint attempts_invalidated_consistent check (
    (status = 'invalidated') = (invalidated_at is not null)
  ),
  constraint attempts_started_consistent check (
    status = 'registered' or (started_at is not null and deadline_at is not null)
  ),
  -- A finished run must carry a full result; an unfinished one must carry none of it.
  constraint attempts_result_consistent check (
    (status in ('submitted', 'timed_out'))
      = (submitted_at is not null and correct_count is not null and elapsed_ms is not null)
  ),
  constraint attempts_verified_requires_result check (
    verified_at is null or submitted_at is not null
  ),
  constraint attempts_deadline_after_start check (
    deadline_at is null or started_at is null or deadline_at > started_at
  )
);

-- One live (non-invalidated, non-disqualified) attempt per participant. An admin reset invalidates the
-- old row first, which is what frees the participant to start their single replacement attempt.
create unique index if not exists attempts_one_live_per_participant
  on attempts (participant_id)
  where status in ('registered', 'in_progress', 'submitted', 'timed_out');

-- The authoritative leaderboard ordering, as a covering index.
create index if not exists attempts_leaderboard_idx
  on attempts (correct_count desc, elapsed_ms asc, submitted_at asc)
  where status = 'submitted';

create index if not exists attempts_participant_idx    on attempts (participant_id);
create index if not exists attempts_status_idx         on attempts (status);
create index if not exists attempts_submitted_at_idx   on attempts (submitted_at desc);
create index if not exists attempts_verified_idx       on attempts (verified_at) where verified_at is not null;
create index if not exists attempts_disqualified_idx   on attempts (disqualified_at) where disqualified_at is not null;
create index if not exists attempts_public_number_idx  on attempts (public_number);
create index if not exists attempts_replacement_idx    on attempts (replacement_for_attempt_id)
  where replacement_for_attempt_id is not null;

drop trigger if exists attempts_set_updated_at on attempts;
create trigger attempts_set_updated_at before update on attempts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- attempt_questions — exactly what was served, in exactly what order
-- ---------------------------------------------------------------------------------------------

create table if not exists attempt_questions (
  attempt_id    uuid        not null references attempts (id)  on delete cascade,
  question_id   uuid        not null references questions (id) on delete restrict,
  display_order integer     not null check (display_order >= 0),
  -- The shuffled option ids for this attempt, e.g. ["c","a","d","b"].
  option_order  jsonb       not null,
  created_at    timestamptz not null default now(),

  primary key (attempt_id, question_id),
  constraint attempt_questions_option_order_shape check (
    jsonb_typeof(option_order) = 'array' and jsonb_array_length(option_order) = 4
  )
);

create unique index if not exists attempt_questions_order_key on attempt_questions (attempt_id, display_order);
create index if not exists attempt_questions_question_idx     on attempt_questions (question_id);

-- ---------------------------------------------------------------------------------------------
-- attempt_answers
-- ---------------------------------------------------------------------------------------------

create table if not exists attempt_answers (
  attempt_id         uuid        not null references attempts (id)  on delete cascade,
  question_id        uuid        not null references questions (id) on delete restrict,
  selected_option_id text        check (selected_option_id in ('a','b','c','d')),
  -- Recorded for later analysis only. Ranking never uses this value: it is client-reported.
  answered_offset_ms integer     check (answered_offset_ms is null or answered_offset_ms >= 0),
  is_correct         boolean     not null default false,
  created_at         timestamptz not null default now(),

  primary key (attempt_id, question_id),
  -- Correctness is only meaningful when something was actually selected.
  constraint attempt_answers_correct_requires_selection check (
    not is_correct or selected_option_id is not null
  )
);

create index if not exists attempt_answers_question_idx on attempt_answers (question_id);
create index if not exists attempt_answers_correct_idx  on attempt_answers (question_id, is_correct);

-- ---------------------------------------------------------------------------------------------
-- app_settings — a single row, guarded by a check constraint
-- ---------------------------------------------------------------------------------------------

create table if not exists app_settings (
  id                          text        primary key default 'singleton' check (id = 'singleton'),
  quiz_title                  text        not null,
  hook_text                   text        not null,
  supporting_line             text        not null,
  event_name                  text        not null,
  event_location              text        not null,
  event_start_at              timestamptz not null,
  event_end_at                timestamptz not null,
  winner_announcement_at      timestamptz not null,
  quiz_state                  quiz_state  not null default 'active',
  quiz_duration_seconds       integer     not null default 60  check (quiz_duration_seconds between 30 and 180),
  questions_per_attempt       integer     not null default 7   check (questions_per_attempt between 5 and 10),
  leaderboard_size            integer     not null default 10  check (leaderboard_size between 3 and 50),
  result_auto_reset_seconds   integer     not null default 25  check (result_auto_reset_seconds between 10 and 120),
  leaderboard_refresh_seconds integer     not null default 10  check (leaderboard_refresh_seconds between 5 and 60),
  prize_first                 text        not null,
  prize_second                text        not null,
  prize_third                 text        not null,
  spin_cta_text               text        not null,
  qr_caption                  text        not null,
  privacy_contact_text        text        not null,
  privacy_notice_text         text        not null,
  rules_text                  text        not null,
  updated_at                  timestamptz not null default now(),

  constraint app_settings_event_window check (event_end_at > event_start_at)
);

drop trigger if exists app_settings_set_updated_at on app_settings;
create trigger app_settings_set_updated_at before update on app_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------------------------

create table if not exists admin_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  action      text        not null,
  target_type text        not null,
  target_id   uuid,
  -- Free-form context. Must never contain names, emails, phone numbers or answers.
  detail      jsonb,
  actor_label text        not null default 'event-admin',
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx  on admin_audit_log (target_type, target_id);
create index if not exists admin_audit_log_action_idx  on admin_audit_log (action);

-- ---------------------------------------------------------------------------------------------
-- rate_limit_events — hashed source only, never a raw IP
-- ---------------------------------------------------------------------------------------------

create table if not exists rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  action     text        not null,
  ip_hash    text        not null check (char_length(ip_hash) between 16 and 64),
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx on rate_limit_events (action, ip_hash, created_at desc);
create index if not exists rate_limit_events_created_idx on rate_limit_events (created_at);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
--
-- RLS is enabled with NO policies at all. That is deliberate: the anon and authenticated roles get
-- zero access, and every request in this application is served by server-side code using the Supabase
-- secret key, which bypasses RLS. There is no browser path to these tables.
-- ---------------------------------------------------------------------------------------------

alter table participants      enable row level security;
alter table questions         enable row level security;
alter table attempts          enable row level security;
alter table attempt_questions enable row level security;
alter table attempt_answers   enable row level security;
alter table app_settings      enable row level security;
alter table admin_audit_log   enable row level security;
alter table rate_limit_events enable row level security;

alter table participants      force row level security;
alter table questions         force row level security;
alter table attempts          force row level security;
alter table attempt_questions force row level security;
alter table attempt_answers   force row level security;
alter table app_settings      force row level security;
alter table admin_audit_log   force row level security;
alter table rate_limit_events force row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
