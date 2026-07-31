import { beforeAll, describe, expect, it } from 'vitest';
import { DemoStore, resetDemoStore } from '@/lib/database/demo-store';
import { DEFAULT_QUESTIONS_PER_ATTEMPT } from '@/lib/config/constants';
import { rankAttempts } from '@/lib/quiz/ranking';
import { formatElapsed } from '@/lib/quiz/scoring';
import { normaliseEmail } from '@/lib/utils/identity';
import { parseCsv, toCsv } from '@/lib/utils/csv';
import { buildPublicName } from '@/lib/utils/identity';

/**
 * Event capacity.
 *
 * Expected footfall across both booth days is about 2,500 people — not 2,500 at once, but every one
 * of them ends up as a row that has to rank correctly and export without truncation. This test builds
 * that many synthetic records in an isolated in-memory store and checks the two things that would
 * actually hurt on the day: a wrong leaderboard, and a lead export that silently drops the tail.
 *
 * Nothing here touches a real database. The synthetic records live in the demo store for the duration
 * of this file and are discarded with it, so this can never contaminate event data.
 */

const POPULATION = 2_500;

let store: DemoStore;
const participantIds: string[] = [];
/**
 * The demo store ships with a handful of sample attempts so the screens are never empty. They are
 * counted once here so the assertions below can talk about "everything in the store", rather than
 * quietly assuming the synthetic records are the only rows present.
 */
let baselineCompleted = 0;
let totalCompleted = 0;

/** Deterministic pseudo-randomness, so a failure is reproducible rather than a one-off. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

beforeAll(async () => {
  resetDemoStore();
  store = new DemoStore();
  const random = seeded(20_260_806);

  baselineCompleted = (await store.getLeaderboard(10_000)).length;

  for (let index = 0; index < POPULATION; index += 1) {
    const email = `load.tester.${index}@example.invalid`;
    // A valid-shaped Indian mobile, unique per synthetic participant. The 97 prefix keeps this range
    // clear of the +9198… numbers the demo seed uses, so nothing collides with the sample data.
    const phone = `+9197${String(index).padStart(8, '0')}`;

    const registered = await store.registerParticipant({
      full_name: `Load Tester ${index}`,
      email,
      email_normalized: normaliseEmail(email),
      phone_original: phone,
      phone_e164: phone,
      company_name: `Load Corp ${index}`,
      designation: 'Talent Lead',
      public_leaderboard_opt_in: index % 3 !== 0,
      marketing_opt_in: index % 2 === 0,
    });
    expect(registered.duplicate).toBe(false);
    const participantId = registered.participantId;
    if (participantId === null) throw new Error(`Synthetic participant ${index} was not created.`);
    participantIds.push(participantId);

    const questions = (await store.getServeableQuestions()).slice(0, DEFAULT_QUESTIONS_PER_ATTEMPT);
    const started = await store.startAttempt(
      participantId,
      130,
      questions.map((question, order) => ({
        question_id: question.id,
        display_order: order,
        option_order: ['a', 'b', 'c', 'd'] as const,
      })),
    );

    // A realistic spread of scores and times, including deliberate ties on both.
    const correct = Math.floor(random() * (DEFAULT_QUESTIONS_PER_ATTEMPT + 1));
    const answers = questions.map((question, order) => ({
      question_id: question.id,
      selected_option_id: order < correct ? question.correct_option_id : null,
      answered_offset_ms: 1_000 * (order + 1),
    }));

    await store.finaliseAttempt(started.attemptId, answers, 20_000 + Math.floor(random() * 100_000), false);
  }

  totalCompleted = baselineCompleted + POPULATION;
}, 120_000);

describe(`ranking and export with ${POPULATION} participants`, () => {
  it('registers every participant without dropping any', async () => {
    expect(participantIds).toHaveLength(POPULATION);
    expect(new Set(participantIds).size).toBe(POPULATION);
  });

  it('ranks every completed attempt, with no gaps and no duplicated ranks', async () => {
    const board = await store.getLeaderboard(totalCompleted);

    expect(board).toHaveLength(totalCompleted);
    expect(board.map((row) => row.rank)).toEqual(Array.from({ length: totalCompleted }, (_, index) => index + 1));
  });

  it('orders by correct answers, then elapsed time, then submission time', async () => {
    const board = await store.getLeaderboard(totalCompleted);

    for (let index = 1; index < board.length; index += 1) {
      const previous = board[index - 1]!;
      const current = board[index]!;

      if (previous.correct_count !== current.correct_count) {
        expect(previous.correct_count).toBeGreaterThan(current.correct_count);
        continue;
      }
      if (previous.elapsed_ms !== current.elapsed_ms) {
        expect(previous.elapsed_ms).toBeLessThan(current.elapsed_ms);
        continue;
      }
      expect(previous.submitted_at.localeCompare(current.submitted_at)).toBeLessThanOrEqual(0);
    }
  });

  it('agrees with the pure ranking function on the same data', async () => {
    const board = await store.getLeaderboard(totalCompleted);
    const reranked = rankAttempts(
      board.map((row) => ({
        attempt_id: row.attempt_id,
        correct_count: row.correct_count,
        elapsed_ms: row.elapsed_ms,
        submitted_at: row.submitted_at,
      })),
    );

    expect(reranked.map((row) => row.attempt_id)).toEqual(board.map((row) => row.attempt_id));
  });

  it('still returns only the top five when that is what was asked for', async () => {
    const top = await store.getLeaderboard(5);
    expect(top).toHaveLength(5);
    expect(top.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('exports every participant to CSV without truncation', async () => {
    const rows = await store.exportParticipants();
    const exportable = rows.filter((row) => row.email.startsWith('load.tester.'));
    expect(exportable).toHaveLength(POPULATION);

    const csv = toCsv(
      ['participant_id', 'full_name', 'email', 'phone_e164', 'score', 'completion_time_seconds', 'marketing_consent'],
      exportable.map((row) => [
        row.id,
        row.full_name,
        row.email,
        row.phone_e164,
        row.correct_count ?? '',
        row.elapsed_ms === null ? '' : formatElapsed(row.elapsed_ms),
        row.marketing_opt_in,
      ]),
    );

    const parsed = parseCsv(csv);
    // One header row plus one row per participant.
    expect(parsed).toHaveLength(POPULATION + 1);
    expect(parsed[0]?.[0]).toBe('participant_id');
    expect(parsed[POPULATION]?.[1]).toMatch(/^Load Tester \d+$/);
  });

  it('exports a public leaderboard that carries no contact details at any size', async () => {
    const board = await store.getLeaderboard(totalCompleted);
    const csv = toCsv(
      ['rank', 'display_name', 'correct_count'],
      board.map((row) => [
        row.rank,
        buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number),
        row.correct_count,
      ]),
    );

    expect(csv).not.toContain('@example.invalid');
    expect(csv).not.toContain('+9198');
    expect(parseCsv(csv)).toHaveLength(totalCompleted + 1);
  });

  it('applies no artificial ceiling below the expected footfall', async () => {
    // Guards against a stray LIMIT creeping into a query and quietly capping the event.
    const board = await store.getLeaderboard(totalCompleted * 2);
    expect(board.length).toBe(totalCompleted);
  });
});
