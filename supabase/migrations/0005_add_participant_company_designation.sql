-- =============================================================================================
-- 0005_add_participant_company_designation.sql — lead fields for company and job title
--
-- Adds two nullable columns to participants and a v2 registration function that requires them.
--
-- Rollout is deliberately zero-downtime. The currently deployed application calls
-- register_participant/7, which this migration does not touch: after 0005 is applied but before the
-- new build goes live, the old function keeps working and simply leaves the two new columns null.
-- The new build calls register_participant_v2/9, which requires both values. Nothing has to be
-- deployed and migrated in the same instant.
--
-- Both columns are NULLABLE, for two different reasons:
--
--   company_name  is REQUIRED of every new registration, but production already holds rows taken
--                 before the field existed. Back-filling them with "Unknown" would invent lead data
--                 nobody supplied, so history keeps null and the requirement is enforced by
--                 register_participant_v2 rather than by a NOT NULL column.
--   designation   is OPTIONAL. A participant may simply decline to give a job title, so null is a
--                 legitimate value for a brand-new row, not only for a historical one.
--
-- A blank or whitespace-only designation is normalised to null, so the column never holds an empty
-- string: it is either null or a real 2–100 character value, with nothing in between.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------

alter table participants add column if not exists company_name text;
alter table participants add column if not exists designation  text;

-- Length rules apply only when a value is present, so historical nulls — and a deliberately omitted
-- designation — remain valid. `add constraint if not exists` does not exist in Postgres, hence the
-- guarded blocks — same style as the enum creation in 0001.
do $$ begin
  alter table participants add constraint participants_company_name_length
    check (company_name is null or char_length(btrim(company_name)) between 2 and 120);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table participants add constraint participants_designation_length
    check (designation is null or char_length(btrim(designation)) between 2 and 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- register_participant_v2 — duplicate-safe registration, now with company and designation
--
-- Identical in contract to register_participant/7: returns (participant_id, duplicate) and never
-- reveals whether the email or the phone was the one that matched, because that would turn the booth
-- form into an account-enumeration oracle. The only additions are the two lead fields, trimmed and
-- validated here as a second line of defence behind the application's own validation.
--
-- p_company_name is required. p_designation is optional: null, empty and whitespace-only are all
-- accepted and stored as null. A designation that is present but the wrong length is still rejected.
--
-- register_participant/7 is intentionally left in place. It is removed in a later migration, once no
-- deployed build calls it any more.
-- ---------------------------------------------------------------------------------------------

create or replace function register_participant_v2(
  p_full_name        text,
  p_email            text,
  p_email_normalized text,
  p_phone_original   text,
  p_phone_e164       text,
  p_public_opt_in    boolean,
  p_marketing_opt_in boolean,
  p_company_name     text,
  p_designation      text
)
returns table (participant_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_company     text := btrim(coalesce(p_company_name, ''));
  -- Blank collapses to null here, so the column never stores an empty string.
  v_designation text := nullif(btrim(coalesce(p_designation, '')), '');
begin
  -- Company is required: blank, whitespace-only, too short and too long all fail. The application
  -- validates first and returns a field-level message; this exists so a direct RPC call cannot
  -- bypass the rule.
  if char_length(v_company) < 2 or char_length(v_company) > 120 then
    raise exception 'invalid_company_name' using errcode = 'P0001';
  end if;

  -- Designation is optional. Null is accepted; a value that is supplied must be a real one.
  if v_designation is not null and (char_length(v_designation) < 2 or char_length(v_designation) > 100) then
    raise exception 'invalid_designation' using errcode = 'P0001';
  end if;

  -- One statement, so two simultaneous inserts of the same person cannot both succeed.
  insert into participants (
    full_name, email, email_normalized, phone_original, phone_e164,
    public_leaderboard_opt_in, marketing_opt_in, accepted_rules_at,
    company_name, designation
  )
  values (
    btrim(p_full_name), btrim(p_email), p_email_normalized, btrim(p_phone_original), p_phone_e164,
    p_public_opt_in, p_marketing_opt_in, now(),
    v_company, v_designation
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
-- Permissions: only the service role (used exclusively by server-side application code) may execute.
-- ---------------------------------------------------------------------------------------------

revoke all on function register_participant_v2(text, text, text, text, text, boolean, boolean, text, text)
  from public, anon, authenticated;

grant execute on function register_participant_v2(text, text, text, text, text, boolean, boolean, text, text)
  to service_role;
