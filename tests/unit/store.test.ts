import { beforeEach, describe, expect, it } from 'vitest';
import { DemoStore, resetDemoStore } from '@/lib/database/demo-store';
import { selectAttemptQuestions } from '@/lib/quiz/selection';
import { evaluateTiming } from '@/lib/quiz/scoring';
import { normaliseEmail, normalisePhone } from '@/lib/utils/identity';
import type { OptionId } from '@/lib/config/constants';

/**
 * Behavioural tests for the store contract.
 *
 * These run against DemoStore because it implements the same `DataStore` interface as the Supabase
 * store, so the rules asserted here — duplicate handling, one live attempt, idempotent finalisation,
 * reset semantics — are the rules both implementations must honour. The Supabase implementation
 * enforces the same invariants in SQL (unique indexes, the partial one-live-attempt index and
 * `finalise_attempt`), which is verified against a real project by the manual test checklist.
 */

let store: DemoStore;

function registration(
  overrides: Partial<{
    name: string;
    email: string;
    phone: string;
    company: string;
    designation: string | null;
  }> = {},
) {
  const email = overrides.email ?? 'ananya@example.invalid';
  const phone = overrides.phone ?? '+919876543210';
  return {
    full_name: overrides.name ?? 'Ananya Sharma',
    email,
    email_normalized: normaliseEmail(email),
    phone_original: phone,
    phone_e164: phone,
    company_name: overrides.company ?? 'Northwind Analytics',
    designation: overrides.designation === undefined ? 'Head of People' : overrides.designation,
    public_leaderboard_opt_in: true,
    marketing_opt_in: false,
  };
}

async function startRun(participantId: string) {
  const questions = selectAttemptQuestions(await store.getServeableQuestions(), 7);
  const started = await store.startAttempt(
    participantId,
    60,
    questions.map((entry) => ({
      question_id: entry.question.id,
      display_order: entry.display_order,
      option_order: entry.option_order,
    })),
  );
  return { started, questions };
}

beforeEach(() => {
  resetDemoStore();
  store = new DemoStore();
});

describe('registration and duplicate protection', () => {
  it('accepts a first-time participant', async () => {
    const result = await store.registerParticipant(registration());
    expect(result.duplicate).toBe(false);
    expect(result.participantId).toBeTruthy();
  });

  it('creates a registered attempt alongside the participant', async () => {
    const result = await store.registerParticipant(registration());
    const attempt = await store.getLiveAttempt(result.participantId ?? '');
    expect(attempt?.status).toBe('registered');
  });

  it('rejects the same email with a different phone', async () => {
    await store.registerParticipant(registration());
    const second = await store.registerParticipant(
      registration({ phone: '+919000000001' }),
    );
    expect(second.duplicate).toBe(true);
  });

  it('rejects the same phone with a different email', async () => {
    await store.registerParticipant(registration());
    const second = await store.registerParticipant(registration({ email: 'someone.else@example.invalid' }));
    expect(second.duplicate).toBe(true);
  });

  it('treats differently-cased emails as the same person', async () => {
    await store.registerParticipant(registration({ email: 'Ananya@Example.Invalid' }));
    const second = await store.registerParticipant(registration({ email: 'ananya@example.invalid' }));
    expect(second.duplicate).toBe(true);
  });

  it('treats differently-formatted phone numbers as the same person once normalised', async () => {
    const first = normalisePhone('98765 43210', 'IN');
    const second = normalisePhone('+91 98765 43210', 'IN');
    expect(first.ok && second.ok && first.e164 === second.e164).toBe(true);

    await store.registerParticipant(registration({ phone: first.ok ? first.e164 : '' }));
    const duplicate = await store.registerParticipant(
      registration({ email: 'other@example.invalid', phone: second.ok ? second.e164 : '' }),
    );
    expect(duplicate.duplicate).toBe(true);
  });

  it('allows two genuinely different people', async () => {
    await store.registerParticipant(registration());
    const second = await store.registerParticipant(
      registration({ email: 'rohit@example.invalid', phone: '+919000000002', name: 'Rohit Menon' }),
    );
    expect(second.duplicate).toBe(false);
  });

  it('does not create a second attempt for a duplicate registration', async () => {
    const first = await store.registerParticipant(registration());
    await store.registerParticipant(registration({ phone: '+919000000009' }));
    const attempts = await store.searchAttempts(undefined, undefined, 500);
    expect(attempts.filter((row) => row.participant_id === first.participantId)).toHaveLength(1);
  });

  it('stores the company and designation against the participant', async () => {
    const { participantId } = await store.registerParticipant(
      registration({ company: 'Northwind Analytics', designation: 'Chief People Officer' }),
    );
    const participant = await store.getParticipant(participantId ?? '');
    expect(participant?.company_name).toBe('Northwind Analytics');
    expect(participant?.designation).toBe('Chief People Officer');
  });

  it('registers someone who left the optional designation blank', async () => {
    const { participantId, duplicate } = await store.registerParticipant(registration({ designation: null }));
    expect(duplicate).toBe(false);
    const participant = await store.getParticipant(participantId ?? '');
    expect(participant?.company_name).toBe('Northwind Analytics');
    expect(participant?.designation).toBeNull();
  });
});

describe('lead fields in admin surfaces', () => {
  const LEAD = {
    email: 'lead.tester@example.invalid',
    phone: '+919000000123',
    name: 'Lead Tester',
    company: 'Zenith Robotics Pvt Ltd',
    designation: 'VP, People & Culture',
  };

  it('finds a participant by company name', async () => {
    await store.registerParticipant(registration(LEAD));
    const rows = await store.searchParticipants('Zenith Robotics', 50);
    expect(rows.map((row) => row.participant.full_name)).toContain('Lead Tester');
  });

  it('finds a participant by designation', async () => {
    await store.registerParticipant(registration(LEAD));
    const rows = await store.searchParticipants('People & Culture', 50);
    expect(rows.map((row) => row.participant.full_name)).toContain('Lead Tester');
  });

  it('matches company case-insensitively, the way booth staff actually type', async () => {
    await store.registerParticipant(registration(LEAD));
    const rows = await store.searchParticipants('zenith robotics', 50);
    expect(rows.map((row) => row.participant.full_name)).toContain('Lead Tester');
  });

  it('carries both fields into the participant export', async () => {
    await store.registerParticipant(registration(LEAD));
    const exported = await store.exportParticipants();
    const row = exported.find((entry) => entry.email === LEAD.email);
    expect(row?.company_name).toBe(LEAD.company);
    expect(row?.designation).toBe(LEAD.designation);
  });

  it('never exposes company or designation on the public leaderboard', async () => {
    const { participantId } = await store.registerParticipant(registration(LEAD));
    const { started, questions } = await startRun(participantId ?? '');
    await store.finaliseAttempt(
      started.attemptId,
      questions.map((entry) => ({
        question_id: entry.question.id,
        selected_option_id: entry.question.correct_option_id,
        answered_offset_ms: 500,
      })),
      5_000,
      false,
    );

    const board = await store.getLeaderboard(50);
    expect(board.length).toBeGreaterThan(0);
    // Asserted over the serialised rows so a future field added to LeaderboardRow cannot leak
    // silently: the check does not depend on knowing which keys exist today.
    const serialised = JSON.stringify(board);
    expect(serialised).not.toContain(LEAD.company);
    expect(serialised).not.toContain(LEAD.designation);
    for (const row of board) {
      expect(row).not.toHaveProperty('company_name');
      expect(row).not.toHaveProperty('designation');
    }
  });

  it('never exposes company or designation through the public stats used by the TV display', async () => {
    await store.registerParticipant(registration(LEAD));
    const stats = await store.getStats();
    const serialised = JSON.stringify(stats);
    expect(serialised).not.toContain(LEAD.company);
    expect(serialised).not.toContain(LEAD.designation);
  });

  it('clears both fields when participants are anonymised', async () => {
    const { participantId } = await store.registerParticipant(registration(LEAD));
    await store.anonymiseParticipants();
    const participant = await store.getParticipant(participantId ?? '');
    expect(participant?.company_name).toBeNull();
    expect(participant?.designation).toBeNull();
  });
});

describe('starting an attempt', () => {
  it('stamps a server start time and deadline', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');

    expect(started.alreadyStarted).toBe(false);
    expect(started.status).toBe('in_progress');
    expect(Date.parse(started.deadlineAt) - Date.parse(started.startedAt)).toBe(60_000);
  });

  it('does not re-roll the questions when start is called twice', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const first = await startRun(participantId ?? '');
    const firstServed = (await store.getServedQuestions(first.started.attemptId)).map((entry) => entry.question.id);

    const second = await startRun(participantId ?? '');
    expect(second.started.alreadyStarted).toBe(true);
    expect(second.started.attemptId).toBe(first.started.attemptId);

    const secondServed = (await store.getServedQuestions(first.started.attemptId)).map((entry) => entry.question.id);
    expect(secondServed).toEqual(firstServed);
  });

  it('preserves the original deadline on a resume, so a refresh cannot buy more time', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const first = await startRun(participantId ?? '');
    const second = await startRun(participantId ?? '');
    expect(second.started.deadlineAt).toBe(first.started.deadlineAt);
  });

  it('records the exact option order that was served', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started, questions } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);

    expect(served).toHaveLength(7);
    for (const [index, entry] of served.entries()) {
      expect(entry.option_order).toEqual(questions[index]?.option_order);
    }
  });
});

describe('submission', () => {
  async function runAndSubmit(allCorrect: boolean) {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);

    const answers = served.map((entry) => ({
      question_id: entry.question.id,
      selected_option_id: (allCorrect
        ? entry.question.correct_option_id
        : entry.question.options.find((option) => option.id !== entry.question.correct_option_id)?.id ?? 'a') as OptionId,
      answered_offset_ms: 1_000,
    }));

    const result = await store.finaliseAttempt(started.attemptId, answers, 34_800, false);
    return { started, answers, result };
  }

  it('scores a perfect run server-side', async () => {
    const { result } = await runAndSubmit(true);
    expect(result.correctCount).toBe(7);
    expect(result.status).toBe('submitted');
    expect(result.alreadyFinal).toBe(false);
  });

  it('scores a run with every answer wrong', async () => {
    const { result } = await runAndSubmit(false);
    expect(result.correctCount).toBe(0);
  });

  it('is idempotent — a retry returns the stored result and does not rescore', async () => {
    const { started, answers, result } = await runAndSubmit(true);

    const retry = await store.finaliseAttempt(started.attemptId, answers, 99_999, false);
    expect(retry.alreadyFinal).toBe(true);
    expect(retry.correctCount).toBe(result.correctCount);
    expect(retry.elapsedMs).toBe(result.elapsedMs);
    expect(retry.submittedAt).toBe(result.submittedAt);
  });

  it('a retry with different answers cannot change the score', async () => {
    const { started, result } = await runAndSubmit(true);
    const served = await store.getServedQuestions(started.attemptId);

    const sabotaged = served.map((entry) => ({
      question_id: entry.question.id,
      selected_option_id: (entry.question.options.find((option) => option.id !== entry.question.correct_option_id)?.id ??
        'a') as OptionId,
      answered_offset_ms: 500,
    }));

    const retry = await store.finaliseAttempt(started.attemptId, sabotaged, 1_000, false);
    expect(retry.correctCount).toBe(result.correctCount);
  });

  it('ignores answers for questions that were never served to this attempt', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);
    const servedIds = new Set(served.map((entry) => entry.question.id));

    const injected = (await store.getServeableQuestions()).find((question) => !servedIds.has(question.id));
    expect(injected).toBeDefined();

    const answers = [
      ...served.map((entry) => ({
        question_id: entry.question.id,
        selected_option_id: entry.question.correct_option_id,
        answered_offset_ms: 100,
      })),
      { question_id: injected?.id ?? '', selected_option_id: injected?.correct_option_id ?? 'a', answered_offset_ms: 100 },
    ];

    const result = await store.finaliseAttempt(started.attemptId, answers, 30_000, false);
    // Seven served questions means seven is the ceiling, regardless of what was posted.
    expect(result.correctCount).toBe(7);
  });

  it('counts unanswered questions as incorrect', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);
    const firstTwo = served.slice(0, 2).map((entry) => ({
      question_id: entry.question.id,
      selected_option_id: entry.question.correct_option_id,
      answered_offset_ms: 100,
    }));

    const result = await store.finaliseAttempt(started.attemptId, firstTwo, 20_000, false);
    expect(result.correctCount).toBe(2);
  });

  it('records a late submission as timed_out and keeps it off the leaderboard', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');

    const verdict = evaluateTiming({
      startedAtMs: Date.parse(started.startedAt),
      deadlineAtMs: Date.parse(started.deadlineAt),
      receivedAtMs: Date.parse(started.deadlineAt) + 10_000,
    });
    expect(verdict.outcome).toBe('timed_out');

    await store.finaliseAttempt(started.attemptId, [], verdict.elapsed_ms, true);
    expect(await store.getRank(started.attemptId)).toBeNull();
  });

  it('refuses to finalise an attempt that was never started', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const attempt = await store.getLiveAttempt(participantId ?? '');
    await expect(store.finaliseAttempt(attempt?.id ?? '', [], 1_000, false)).rejects.toThrow();
  });
});

describe('leaderboard and stats', () => {
  it('ranks a submitted attempt', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);

    await store.finaliseAttempt(
      started.attemptId,
      served.map((entry) => ({
        question_id: entry.question.id,
        selected_option_id: entry.question.correct_option_id,
        answered_offset_ms: 100,
      })),
      1_000,
      false,
    );

    // A perfect run in one second beats every pre-seeded demo entry.
    expect(await store.getRank(started.attemptId)).toBe(1);
  });

  it('disqualifies an entry without destroying any of it', async () => {
    // Regression guard for the defect fixed in migration 0006: disqualification kept failing because
    // `attempts_result_consistent` only permitted a result on a 'submitted' or 'timed_out' row, so
    // moving a scored attempt to 'disqualified' violated the constraint. The behaviour that mattered
    // — and that any future "fix" must not trade away — is that the result survives the status change.
    const board = await store.getLeaderboard(10);
    const target = board[0];
    const other = board[1];
    expect(target).toBeDefined();
    expect(other).toBeDefined();

    const beforeAttempt = await store.getAttempt(target?.attempt_id ?? '');
    expect(beforeAttempt?.status).toBe('submitted');

    const result = await store.disqualifyAttempt(
      target?.attempt_id ?? '',
      'Duplicate entry confirmed at the desk',
      'event-admin:test',
    );

    // Status and reason are recorded.
    expect(result.status).toBe('disqualified');
    expect(result.disqualification_reason).toBe('Duplicate entry confirmed at the desk');
    expect(result.disqualified_at).not.toBeNull();

    // Nothing is deleted: the attempt row, its score, its time and its participant all survive.
    const afterAttempt = await store.getAttempt(target?.attempt_id ?? '');
    expect(afterAttempt).not.toBeNull();
    expect(afterAttempt?.correct_count).toBe(beforeAttempt?.correct_count);
    expect(afterAttempt?.elapsed_ms).toBe(beforeAttempt?.elapsed_ms);
    expect(afterAttempt?.submitted_at).toBe(beforeAttempt?.submitted_at);
    expect(await store.getParticipant(target?.participant_id ?? '')).not.toBeNull();

    // It leaves the public board, and nobody else is affected.
    expect(await store.getRank(target?.attempt_id ?? '')).toBeNull();
    const afterBoard = await store.getLeaderboard(10);
    expect(afterBoard.map((row) => row.attempt_id)).not.toContain(target?.attempt_id);
    expect(afterBoard.map((row) => row.attempt_id)).toContain(other?.attempt_id);
    const otherAttempt = await store.getAttempt(other?.attempt_id ?? '');
    expect(otherAttempt?.status).toBe('submitted');
    expect(otherAttempt?.disqualified_at).toBeNull();
  });

  it('records the disqualification and its reason in the audit log', async () => {
    const board = await store.getLeaderboard(10);
    const target = board[0];
    const reason = 'Second entry under a different email, confirmed at the desk';

    await store.disqualifyAttempt(target?.attempt_id ?? '', reason, 'event-admin:test');
    await store.recordAudit({
      action: 'attempt.disqualified',
      target_type: 'attempt',
      target_id: target?.attempt_id ?? '',
      detail: { reason },
      actor_label: 'event-admin:test',
    });

    const audit = await store.listAudit(20, target?.attempt_id ?? '');
    const entry = audit.find((row) => row.action === 'attempt.disqualified');
    expect(entry).toBeDefined();
    expect(entry?.detail).toMatchObject({ reason });
  });

  it('keeps an invalidated attempt with a result valid too — the same constraint blocked reset', async () => {
    // reset_participant moves a submitted attempt to 'invalidated' while keeping its result, which
    // hit the identical check-constraint failure before 0006.
    const { participantId } = await store.registerParticipant(
      registration({ email: 'reset.after.submit@example.invalid', phone: '+919000000431' }),
    );
    const { started, questions } = await startRun(participantId ?? '');
    await store.finaliseAttempt(
      started.attemptId,
      questions.map((entry) => ({
        question_id: entry.question.id,
        selected_option_id: entry.question.correct_option_id,
        answered_offset_ms: 100,
      })),
      2_000,
      false,
    );

    await store.resetParticipant(participantId ?? '', 'Tablet froze after submission');

    const old = await store.getAttempt(started.attemptId);
    expect(old?.status).toBe('invalidated');
    // The score is retained, not wiped.
    expect(old?.correct_count).not.toBeNull();
    expect(await store.getRank(started.attemptId)).toBeNull();
  });

  it('drops a disqualified attempt off the leaderboard', async () => {
    const board = await store.getLeaderboard(10);
    const target = board[0];
    expect(target).toBeDefined();

    await store.disqualifyAttempt(target?.attempt_id ?? '', 'Duplicate entry confirmed at the desk', 'tester');
    expect(await store.getRank(target?.attempt_id ?? '')).toBeNull();
  });

  it('restores a disqualified attempt back onto the leaderboard', async () => {
    const target = (await store.getLeaderboard(10))[0];
    await store.disqualifyAttempt(target?.attempt_id ?? '', 'Mistake', 'tester');
    await store.restoreAttempt(target?.attempt_id ?? '', 'tester');
    expect(await store.getRank(target?.attempt_id ?? '')).not.toBeNull();
  });

  it('refuses to restore an attempt that was not disqualified', async () => {
    const target = (await store.getLeaderboard(10))[0];
    await expect(store.restoreAttempt(target?.attempt_id ?? '', 'tester')).rejects.toThrow();
  });

  it('marks verification and reports it on the board', async () => {
    const target = (await store.getLeaderboard(10)).find((row) => !row.verified);
    expect(target).toBeDefined();

    await store.setVerification(target?.attempt_id ?? '', true, 'tester');
    const updated = (await store.getLeaderboard(50)).find((row) => row.attempt_id === target?.attempt_id);
    expect(updated?.verified).toBe(true);
  });

  it('returns stats consistent with the board', async () => {
    const stats = await store.getStats();
    const board = await store.getLeaderboard(500);

    expect(stats.total_completed).toBe(board.length);
    expect(stats.best_score).toBe(Math.max(...board.map((row) => row.correct_count)));
  });
});

describe('participant reset', () => {
  it('invalidates the old attempt and grants exactly one replacement', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');

    const result = await store.resetParticipant(participantId ?? '', 'Tablet froze at question 4');

    expect(result.invalidatedAttemptId).toBe(started.attemptId);
    expect(result.newAttemptId).not.toBe(started.attemptId);

    const oldAttempt = await store.getAttempt(started.attemptId);
    expect(oldAttempt?.status).toBe('invalidated');

    const live = await store.getLiveAttempt(participantId ?? '');
    expect(live?.id).toBe(result.newAttemptId);
    expect(live?.status).toBe('registered');
  });

  it('never deletes the original record', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    await store.resetParticipant(participantId ?? '', 'Wi-Fi dropped');

    expect(await store.getAttempt(started.attemptId)).not.toBeNull();
  });

  it('links the replacement back to the attempt it replaced', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const result = await store.resetParticipant(participantId ?? '', 'Wi-Fi dropped');

    const replacement = await store.getAttempt(result.newAttemptId);
    expect(replacement?.replacement_for_attempt_id).toBe(started.attemptId);
  });

  it('keeps an invalidated attempt off the leaderboard', async () => {
    const { participantId } = await store.registerParticipant(registration());
    const { started } = await startRun(participantId ?? '');
    const served = await store.getServedQuestions(started.attemptId);
    await store.finaliseAttempt(
      started.attemptId,
      served.map((entry) => ({
        question_id: entry.question.id,
        selected_option_id: entry.question.correct_option_id,
        answered_offset_ms: 10,
      })),
      1_000,
      false,
    );
    expect(await store.getRank(started.attemptId)).toBe(1);

    await store.resetParticipant(participantId ?? '', 'Scored on a frozen tablet');
    expect(await store.getRank(started.attemptId)).toBeNull();
  });

  it('writes an audit entry', async () => {
    const { participantId } = await store.registerParticipant(registration());
    await startRun(participantId ?? '');
    await store.resetParticipant(participantId ?? '', 'Tablet froze');

    const audit = await store.listAudit(20, participantId ?? '');
    expect(audit.some((entry) => entry.action === 'participant.reset')).toBe(true);
  });
});

describe('quiz state', () => {
  it('changes state and records it in the audit log', async () => {
    expect((await store.getSettings()).quiz_state).toBe('active');

    await store.setQuizState('paused', 'tester');
    expect((await store.getSettings()).quiz_state).toBe('paused');

    await store.setQuizState('locked', 'tester');
    expect((await store.getSettings()).quiz_state).toBe('locked');

    const audit = await store.listAudit(20);
    expect(audit.filter((entry) => entry.action === 'quiz.state_changed')).toHaveLength(2);
  });

  it('does not let a settings update silently change the quiz state', async () => {
    await store.setQuizState('paused', 'tester');
    const settings = await store.getSettings();

    const { id: _id, updated_at: _updated, ...editable } = settings;
    await store.updateSettings({ ...editable, quiz_state: 'active', quiz_title: 'Renamed' });

    const after = await store.getSettings();
    expect(after.quiz_title).toBe('Renamed');
    expect(after.quiz_state).toBe('paused');
  });
});

describe('rate limiting', () => {
  it('counts events within the window', async () => {
    await store.recordRateEvent('register', 'hash-1');
    await store.recordRateEvent('register', 'hash-1');
    expect(await store.countRateEvents('register', 'hash-1', 300)).toBe(2);
  });

  it('keeps counts separate per action and per source', async () => {
    await store.recordRateEvent('register', 'hash-1');
    expect(await store.countRateEvents('start', 'hash-1', 300)).toBe(0);
    expect(await store.countRateEvents('register', 'hash-2', 300)).toBe(0);
  });
});
