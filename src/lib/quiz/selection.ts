import { randomInt } from 'node:crypto';
import {
  DIFFICULTIES,
  DIFFICULTY_BLUEPRINTS,
  MANDATORY_PILLARS,
  MAX_QUESTIONS_PER_PILLAR,
  OPTION_IDS,
  PILLARS,
  SERVEABLE_REVIEW_STATUSES,
  type Difficulty,
  type OptionId,
  type Pillar,
} from '@/lib/config/constants';
import type { ParticipantQuestion, Question } from '@/types/domain';

/**
 * Fair question selection.
 *
 * Two participants standing next to each other must get comparably hard challenges, otherwise the
 * leaderboard is not a contest. That is why selection is blueprint-driven (a fixed difficulty mix and
 * guaranteed pillar coverage) rather than a plain random draw over the whole bank.
 */

export class SelectionError extends Error {
  readonly code: 'no_blueprint' | 'insufficient_pool';

  constructor(code: 'no_blueprint' | 'insufficient_pool', message: string) {
    super(message);
    this.name = 'SelectionError';
    this.code = code;
  }
}

/** Random integer in [0, max). Injectable so tests can be deterministic; defaults to CSPRNG. */
export type RandomInt = (max: number) => number;

const secureRandomInt: RandomInt = (max) => (max <= 1 ? 0 : randomInt(max));

/** Fisher–Yates. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: readonly T[], rand: RandomInt = secureRandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    const a = result[i];
    const b = result[j];
    /* istanbul ignore next -- indices are always in range; this satisfies noUncheckedIndexedAccess */
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

export function getBlueprint(questionsPerAttempt: number): Record<Difficulty, number> {
  const blueprint = DIFFICULTY_BLUEPRINTS[questionsPerAttempt];
  if (!blueprint) {
    throw new SelectionError(
      'no_blueprint',
      `No difficulty blueprint defined for ${questionsPerAttempt} questions per attempt. ` +
        `Supported sizes: ${Object.keys(DIFFICULTY_BLUEPRINTS).join(', ')}.`,
    );
  }
  return blueprint;
}

/** Questions eligible to be served: active and human-reviewed. */
export function eligibleQuestions(pool: readonly Question[]): Question[] {
  return pool.filter((question) => question.active && SERVEABLE_REVIEW_STATUSES.includes(question.review_status));
}

export type SelectedQuestion = {
  question: Question;
  display_order: number;
  /** The order the four options are shown in for this attempt. */
  option_order: OptionId[];
};

/**
 * Choose the question set for one attempt.
 *
 * Algorithm:
 *  1. Fill the difficulty blueprint (e.g. 2 easy / 4 medium / 1 hard), preferring candidates that keep
 *     each pillar at or below MAX_QUESTIONS_PER_PILLAR.
 *  2. Repair mandatory pillar coverage by swapping in a question from a missing pillar, replacing a
 *     same-difficulty question drawn from the most over-represented pillar.
 *  3. Shuffle question order and, independently, each question's option order.
 */
export function selectAttemptQuestions(
  pool: readonly Question[],
  questionsPerAttempt: number,
  rand: RandomInt = secureRandomInt,
): SelectedQuestion[] {
  const blueprint = getBlueprint(questionsPerAttempt);
  const available = eligibleQuestions(pool);

  const byDifficulty = new Map<Difficulty, Question[]>();
  for (const difficulty of DIFFICULTIES) {
    byDifficulty.set(
      difficulty,
      shuffle(
        available.filter((question) => question.difficulty === difficulty),
        rand,
      ),
    );
  }

  for (const difficulty of DIFFICULTIES) {
    const need = blueprint[difficulty];
    const have = byDifficulty.get(difficulty)?.length ?? 0;
    if (have < need) {
      throw new SelectionError(
        'insufficient_pool',
        `Not enough active, reviewed ${difficulty} questions: need ${need}, have ${have}. ` +
          'Activate more questions in the admin question manager.',
      );
    }
  }

  const chosen: Question[] = [];
  const pillarCounts = new Map<Pillar, number>();

  const countFor = (pillar: Pillar): number => pillarCounts.get(pillar) ?? 0;
  const take = (question: Question): void => {
    chosen.push(question);
    pillarCounts.set(question.pillar, countFor(question.pillar) + 1);
  };

  for (const difficulty of DIFFICULTIES) {
    const need = blueprint[difficulty];
    const candidates = byDifficulty.get(difficulty) ?? [];
    let taken = 0;

    // First pass respects the soft per-pillar cap.
    for (const candidate of candidates) {
      if (taken === need) break;
      if (countFor(candidate.pillar) >= MAX_QUESTIONS_PER_PILLAR) continue;
      take(candidate);
      taken += 1;
    }

    // Second pass ignores the cap, because filling the blueprint matters more than pillar spread.
    if (taken < need) {
      const alreadyChosen = new Set(chosen.map((question) => question.id));
      for (const candidate of candidates) {
        if (taken === need) break;
        if (alreadyChosen.has(candidate.id)) continue;
        take(candidate);
        taken += 1;
      }
    }
  }

  const repaired = ensureMandatoryPillars(chosen, byDifficulty, rand);

  const ordered = shuffle(repaired, rand);
  return ordered.map((question, index) => ({
    question,
    display_order: index,
    option_order: shuffle(OPTION_IDS, rand),
  }));
}

/**
 * Guarantee at least one question from each mandatory pillar, without disturbing the difficulty mix:
 * every swap replaces a question with another of the same difficulty.
 */
function ensureMandatoryPillars(
  chosen: Question[],
  byDifficulty: Map<Difficulty, Question[]>,
  rand: RandomInt,
): Question[] {
  const result = [...chosen];

  for (const required of MANDATORY_PILLARS) {
    if (result.some((question) => question.pillar === required)) continue;

    const chosenIds = new Set(result.map((question) => question.id));

    // Prefer replacing a question from whichever pillar is currently most over-represented.
    const counts = new Map<Pillar, number>();
    for (const question of result) counts.set(question.pillar, (counts.get(question.pillar) ?? 0) + 1);

    const replaceableIndexes = result
      .map((question, index) => ({ index, question, count: counts.get(question.pillar) ?? 0 }))
      .filter((entry) => !MANDATORY_PILLARS.includes(entry.question.pillar) || (counts.get(entry.question.pillar) ?? 0) > 1)
      .sort((left, right) => right.count - left.count);

    let swapped = false;
    for (const entry of replaceableIndexes) {
      const candidates = (byDifficulty.get(entry.question.difficulty) ?? []).filter(
        (question) => question.pillar === required && !chosenIds.has(question.id),
      );
      const replacement = candidates[rand(candidates.length)] ?? candidates[0];
      if (!replacement) continue;
      result[entry.index] = replacement;
      swapped = true;
      break;
    }

    // If no same-difficulty substitute exists the pool is too thin for the guarantee; the blueprint
    // still holds, which is the more important property, and the admin pool warning surfaces it.
    if (!swapped) continue;
  }

  return result;
}

/**
 * Strip everything a participant must not see.
 *
 * This is the single mapper between a stored question and what crosses the network to the browser.
 * `correct_option_id` and `explanation` are simply not present on the returned object.
 */
export function toParticipantQuestion(selected: SelectedQuestion): ParticipantQuestion {
  const byId = new Map(selected.question.options.map((option) => [option.id, option]));
  const options = selected.option_order
    .map((id) => byId.get(id))
    .filter((option): option is { id: OptionId; text: string } => option !== undefined);

  return {
    question_id: selected.question.id,
    display_order: selected.display_order,
    question_text: selected.question.question_text,
    options,
  };
}

export type QuestionBankSummary = {
  total: number;
  active: number;
  approved: number;
  /** Active *and* approved — the pool an attempt is actually drawn from. */
  servable: number;
  by_pillar: Record<Pillar, number>;
  by_difficulty: Record<Difficulty, number>;
  warnings: string[];
};

/**
 * A bank-wide summary for the admin question screen.
 *
 * Deliberately reports on the whole bank rather than the current filter, because the question it
 * answers is "is the bank in a fit state for the event?" — which no filtered view can show. The
 * warnings are the same class of check the seed tests enforce, surfaced to a human who may have been
 * editing questions on the morning of the event.
 */
export function summariseQuestionBank(
  pool: readonly Question[],
  expectedTotal = 120,
): QuestionBankSummary {
  const byPillar = Object.fromEntries(PILLARS.map((pillar) => [pillar, 0])) as Record<Pillar, number>;
  const byDifficulty = { easy: 0, medium: 0, hard: 0 } satisfies Record<Difficulty, number>;

  let active = 0;
  let approved = 0;
  let servable = 0;

  for (const question of pool) {
    byPillar[question.pillar] += 1;
    byDifficulty[question.difficulty] += 1;
    if (question.active) active += 1;
    if (question.review_status === 'approved') approved += 1;
    if (question.active && question.review_status === 'approved') servable += 1;
  }

  const warnings: string[] = [];
  if (pool.length !== expectedTotal) {
    warnings.push(`The bank holds ${pool.length} questions; the event is configured for ${expectedTotal}.`);
  }
  if (servable !== pool.length) {
    warnings.push(`${pool.length - servable} question(s) are not both active and approved, so they will never be served.`);
  }

  const codes = new Set<string>();
  const duplicateCodes = new Set<string>();
  const texts = new Set<string>();
  const duplicateTexts = new Set<string>();
  for (const question of pool) {
    if (codes.has(question.code)) duplicateCodes.add(question.code);
    codes.add(question.code);
    const normalised = question.question_text.trim().toLowerCase();
    if (texts.has(normalised)) duplicateTexts.add(question.code);
    texts.add(normalised);
  }
  if (duplicateCodes.size > 0) warnings.push(`Duplicate question code(s): ${[...duplicateCodes].join(', ')}.`);
  if (duplicateTexts.size > 0) warnings.push(`Duplicate question text on: ${[...duplicateTexts].join(', ')}.`);

  for (const question of pool) {
    if (question.options.length !== 4) {
      warnings.push(`${question.code} does not have exactly four options.`);
    } else if (!question.options.some((option) => option.id === question.correct_option_id)) {
      warnings.push(`${question.code} has no option matching its correct answer.`);
    }
  }

  for (const pillar of MANDATORY_PILLARS) {
    if (byPillar[pillar] === 0) warnings.push(`No questions at all in the required pillar "${pillar}".`);
  }

  return {
    total: pool.length,
    active,
    approved,
    servable,
    by_pillar: byPillar,
    by_difficulty: byDifficulty,
    warnings,
  };
}

/** Diagnostics for the admin dashboard: can the current active pool actually serve an attempt? */
export function describePoolHealth(
  pool: readonly Question[],
  questionsPerAttempt: number,
): { ok: boolean; messages: string[]; counts: Record<Difficulty, number> } {
  const available = eligibleQuestions(pool);
  const counts = { easy: 0, medium: 0, hard: 0 } satisfies Record<Difficulty, number>;
  for (const question of available) counts[question.difficulty] += 1;

  const messages: string[] = [];
  let ok = true;

  let blueprint: Record<Difficulty, number>;
  try {
    blueprint = getBlueprint(questionsPerAttempt);
  } catch (error) {
    return {
      ok: false,
      messages: [error instanceof Error ? error.message : 'Unsupported question count.'],
      counts,
    };
  }

  for (const difficulty of DIFFICULTIES) {
    if (counts[difficulty] < blueprint[difficulty]) {
      ok = false;
      messages.push(
        `Only ${counts[difficulty]} active reviewed ${difficulty} question(s); each attempt needs ${blueprint[difficulty]}.`,
      );
    }
  }

  for (const pillar of MANDATORY_PILLARS) {
    if (!available.some((question) => question.pillar === pillar)) {
      ok = false;
      messages.push(`No active reviewed questions in the required pillar "${pillar}".`);
    }
  }

  return { ok, messages, counts };
}
