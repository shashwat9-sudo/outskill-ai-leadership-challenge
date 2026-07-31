-- =============================================================================================
-- 0006_allow_result_on_stopped_attempts.sql — let a stopped attempt keep its result
--
-- attempts_result_consistent was written as an equivalence:
--
--   (status in ('submitted', 'timed_out'))
--     = (submitted_at is not null and correct_count is not null and elapsed_ms is not null)
--
-- which says a row may carry a result *if and only if* it is submitted or timed out. Both of the
-- ways an attempt is stopped after the fact contradict that, because both deliberately keep the
-- result rather than destroying it:
--
--   disqualify_attempt  status -> 'disqualified', result retained  -> false = true, rejected
--   reset_participant   status -> 'invalidated',  result retained  -> false = true, rejected
--
-- Confirmed in production as:
--   Disqualify attempt: new row for relation "attempts" violates check constraint
--   "attempts_result_consistent"
--
-- The fix exempts exactly those two terminal states and changes nothing else. For 'registered',
-- 'in_progress', 'submitted' and 'timed_out' the original expression is preserved verbatim, so the
-- rule that a finished run must carry a full result — and an unfinished one must not — is untouched.
--
-- Deliberately NOT done here: nulling the result columns on disqualification. That would delete
-- attempt data, break restore_attempt (which reads submitted_at to decide which state to restore to)
-- and destroy the evidence an audit trail exists to preserve.
--
-- The new constraint is strictly more permissive than the old one, so every existing row already
-- satisfies it; the validating scan cannot fail.
-- =============================================================================================

alter table attempts drop constraint if exists attempts_result_consistent;

alter table attempts add constraint attempts_result_consistent check (
  -- A stopped attempt keeps whatever result it had at the moment it was stopped.
  status in ('disqualified', 'invalidated')
  -- Unchanged from 0001 for every other state.
  or (status in ('submitted', 'timed_out'))
     = (submitted_at is not null and correct_count is not null and elapsed_ms is not null)
);
