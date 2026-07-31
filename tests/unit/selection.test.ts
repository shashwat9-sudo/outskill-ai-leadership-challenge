import { describe, expect, it } from 'vitest';
import {
  SelectionError,
  describePoolHealth,
  eligibleQuestions,
  getBlueprint,
  selectAttemptQuestions,
  shuffle,
  toParticipantQuestion,
} from '@/lib/quiz/selection';
import { DIFFICULTY_BLUEPRINTS, MANDATORY_PILLARS, OPTION_IDS, PILLARS } from '@/lib/config/constants';
import { SEED_QUESTIONS } from '@/lib/quiz/seed-questions';
import type { Question } from '@/types/domain';

/** Build the in-memory question bank the selection engine sees in production. */
function pool(): Question[] {
  const now = new Date().toISOString();
  return SEED_QUESTIONS.map((seed, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    code: seed.code,
    pillar: seed.pillar,
    difficulty: seed.difficulty,
    question_text: seed.question_text,
    options: seed.options,
    correct_option_id: seed.correct_option_id,
    explanation: seed.explanation,
    active: seed.active,
    review_status: seed.review_status,
    created_at: now,
    updated_at: now,
  }));
}

const RUNS = 300;

describe('the seed bank itself', () => {
  const bank = pool();

  it('holds exactly 120 questions', () => {
    expect(bank).toHaveLength(120);
  });

  it('has a unique code for every question', () => {
    expect(new Set(bank.map((question) => question.code)).size).toBe(120);
  });

  it('has no exact duplicate question text', () => {
    expect(new Set(bank.map((question) => question.question_text)).size).toBe(120);
  });

  it('matches the stated difficulty distribution of 40 easy / 60 medium / 20 hard', () => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const question of bank) counts[question.difficulty] += 1;
    expect(counts).toEqual({ easy: 40, medium: 60, hard: 20 });
  });

  it('holds 24 questions in each of the five pillars', () => {
    for (const pillar of PILLARS) {
      expect(bank.filter((question) => question.pillar === pillar)).toHaveLength(24);
    }
  });

  it('balances difficulty within every pillar', () => {
    for (const pillar of PILLARS) {
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const question of bank.filter((entry) => entry.pillar === pillar)) counts[question.difficulty] += 1;
      expect(counts).toEqual({ easy: 8, medium: 12, hard: 4 });
    }
  });

  it('gives every question four distinct options with ids a–d', () => {
    for (const question of bank) {
      expect(question.options).toHaveLength(4);
      expect(question.options.map((option) => option.id)).toEqual([...OPTION_IDS]);
      expect(new Set(question.options.map((option) => option.text)).size).toBe(4);
    }
  });

  it('always points correct_option_id at an option that exists', () => {
    for (const question of bank) {
      expect(question.options.some((option) => option.id === question.correct_option_id)).toBe(true);
    }
  });

  it('does not make the correct answer systematically the longest option', () => {
    const longest = bank.filter((question) => {
      const correct = question.options.find((option) => option.id === question.correct_option_id);
      if (!correct) return false;
      return question.options.every((option) => option.text.length <= correct.text.length);
    });
    // Chance alone would put this near 25%. The guard is against a giveaway pattern, not exact parity.
    expect(longest.length / bank.length).toBeLessThan(0.4);
  });

  it('spreads the correct answer across all four option ids', () => {
    const counts = new Map<string, number>();
    for (const question of bank) {
      counts.set(question.correct_option_id, (counts.get(question.correct_option_id) ?? 0) + 1);
    }
    for (const id of OPTION_IDS) {
      expect(counts.get(id) ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps question text concise', () => {
    for (const question of bank) {
      expect(question.question_text.split(/\s+/).length).toBeLessThanOrEqual(35);
    }
  });

  it('keeps every option concise', () => {
    for (const question of bank) {
      for (const option of question.options) {
        expect(option.text.split(/\s+/).length).toBeLessThanOrEqual(15);
      }
    }
  });

  it('gives every question an admin explanation', () => {
    for (const question of bank) {
      expect(question.explanation.length).toBeGreaterThan(20);
    }
  });

  it('seeds every question active and approved, so the bank is servable out of the box', () => {
    expect(bank.every((question) => question.active)).toBe(true);
    expect(bank.every((question) => question.review_status === 'approved')).toBe(true);
  });
});

describe('blueprints', () => {
  it('uses 2 easy / 4 medium / 1 hard for a seven-question attempt', () => {
    expect(getBlueprint(7)).toEqual({ easy: 2, medium: 4, hard: 1 });
  });

  it('has every blueprint sum to its own attempt size', () => {
    for (const [size, blueprint] of Object.entries(DIFFICULTY_BLUEPRINTS)) {
      const total = blueprint.easy + blueprint.medium + blueprint.hard;
      expect(total).toBe(Number(size));
    }
  });

  it('refuses an attempt size with no defined blueprint', () => {
    expect(() => getBlueprint(4)).toThrow(SelectionError);
    expect(() => getBlueprint(20)).toThrow(SelectionError);
  });
});

describe('attempt selection', () => {
  const bank = pool();

  it('always returns exactly the requested number of questions', () => {
    for (let run = 0; run < RUNS; run += 1) {
      expect(selectAttemptQuestions(bank, 7)).toHaveLength(7);
    }
  });

  it('always matches the difficulty blueprint', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const selected = selectAttemptQuestions(bank, 7);
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const entry of selected) counts[entry.question.difficulty] += 1;
      expect(counts).toEqual({ easy: 2, medium: 4, hard: 1 });
    }
  });

  it('never repeats a question within one attempt', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const selected = selectAttemptQuestions(bank, 7);
      expect(new Set(selected.map((entry) => entry.question.id)).size).toBe(7);
    }
  });

  it('always covers the three mandatory pillars', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const pillars = new Set(selectAttemptQuestions(bank, 7).map((entry) => entry.question.pillar));
      for (const required of MANDATORY_PILLARS) {
        expect(pillars.has(required)).toBe(true);
      }
    }
  });

  it('keeps at most two questions from any one pillar when the pool allows', () => {
    for (let run = 0; run < RUNS; run += 1) {
      const counts = new Map<string, number>();
      for (const entry of selectAttemptQuestions(bank, 7)) {
        counts.set(entry.question.pillar, (counts.get(entry.question.pillar) ?? 0) + 1);
      }
      for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('assigns display_order as a contiguous 0-based sequence', () => {
    const selected = selectAttemptQuestions(bank, 7);
    expect(selected.map((entry) => entry.display_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives each question a full four-option order with no duplicates', () => {
    for (const entry of selectAttemptQuestions(bank, 7)) {
      expect(entry.option_order).toHaveLength(4);
      expect(new Set(entry.option_order).size).toBe(4);
      expect([...entry.option_order].sort()).toEqual([...OPTION_IDS]);
    }
  });

  it('actually varies which questions are served across attempts', () => {
    const firstCodes = new Set<string>();
    for (let run = 0; run < 40; run += 1) {
      const selected = selectAttemptQuestions(bank, 7);
      firstCodes.add(selected.map((entry) => entry.question.code).sort().join(','));
    }
    // Identical sets 40 times running would mean the randomness is broken.
    expect(firstCodes.size).toBeGreaterThan(20);
  });

  it('actually varies the option order across attempts', () => {
    const orders = new Set<string>();
    for (let run = 0; run < 60; run += 1) {
      const selected = selectAttemptQuestions(bank, 7);
      const first = selected[0];
      if (first) orders.add(first.option_order.join(''));
    }
    expect(orders.size).toBeGreaterThan(3);
  });

  it('ignores inactive and draft questions', () => {
    const restricted = bank.map((question, index) => ({
      ...question,
      active: index % 2 === 0,
      review_status: index % 3 === 0 ? ('draft' as const) : question.review_status,
    }));
    const serveable = new Set(eligibleQuestions(restricted).map((question) => question.id));

    for (let run = 0; run < 50; run += 1) {
      for (const entry of selectAttemptQuestions(restricted, 7)) {
        expect(serveable.has(entry.question.id)).toBe(true);
      }
    }
  });

  it('fails loudly when the pool cannot fill the blueprint', () => {
    const tiny = bank.filter((question) => question.difficulty === 'easy').slice(0, 3);
    expect(() => selectAttemptQuestions(tiny, 7)).toThrow(SelectionError);
  });

  it('supports every declared attempt size', () => {
    for (const size of Object.keys(DIFFICULTY_BLUEPRINTS).map(Number)) {
      expect(selectAttemptQuestions(bank, size)).toHaveLength(size);
    }
  });
});

describe('participant projection', () => {
  const bank = pool();

  it('never includes the correct answer or the explanation', () => {
    for (const entry of selectAttemptQuestions(bank, 7)) {
      const projected = toParticipantQuestion(entry);
      const serialised = JSON.stringify(projected);

      // The key must be absent, and the explanation text must not appear anywhere in the payload.
      // (A naive search for the word "explanation" would false-positive on question text that uses it.)
      expect(serialised).not.toContain('correct_option_id');
      expect(serialised).not.toContain(entry.question.explanation);
      expect(Object.keys(projected).sort()).toEqual(['display_order', 'options', 'question_id', 'question_text']);
    }
  });

  it('presents the options in the stored shuffled order', () => {
    for (const entry of selectAttemptQuestions(bank, 7)) {
      const projected = toParticipantQuestion(entry);
      expect(projected.options.map((option) => option.id)).toEqual(entry.option_order);
    }
  });

  it('keeps all four options and their text intact', () => {
    for (const entry of selectAttemptQuestions(bank, 7)) {
      const projected = toParticipantQuestion(entry);
      expect(projected.options).toHaveLength(4);
      const originalTexts = new Set(entry.question.options.map((option) => option.text));
      for (const option of projected.options) expect(originalTexts.has(option.text)).toBe(true);
    }
  });
});

describe('shuffle', () => {
  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const output = shuffle(input);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4];
    shuffle(input);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('produces different orderings over repeated runs', () => {
    const seen = new Set<string>();
    for (let run = 0; run < 60; run += 1) seen.add(shuffle([1, 2, 3, 4, 5]).join(''));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('is a no-op on an empty or single-element list', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });
});

describe('pool health diagnostics', () => {
  it('reports the full seed bank as healthy', () => {
    const health = describePoolHealth(pool(), 7);
    expect(health.ok).toBe(true);
    expect(health.messages).toEqual([]);
    expect(health.counts).toEqual({ easy: 40, medium: 60, hard: 20 });
  });

  it('explains what is missing when the pool is too thin', () => {
    const thin = pool().filter((question) => question.difficulty !== 'hard');
    const health = describePoolHealth(thin, 7);
    expect(health.ok).toBe(false);
    expect(health.messages.join(' ')).toContain('hard');
  });

  it('flags an unsupported attempt size rather than silently coping', () => {
    const health = describePoolHealth(pool(), 4);
    expect(health.ok).toBe(false);
    expect(health.messages.join(' ')).toContain('blueprint');
  });

  it('flags a missing mandatory pillar', () => {
    const missing = pool().filter((question) => question.pillar !== 'responsible_ai');
    const health = describePoolHealth(missing, 7);
    expect(health.ok).toBe(false);
    expect(health.messages.join(' ')).toContain('responsible_ai');
  });
});
