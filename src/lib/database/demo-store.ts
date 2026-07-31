import { randomUUID } from 'node:crypto';
import {
  ANONYMISED_NAME,
  DEFAULT_SETTINGS,
  PILLARS,
  type AttemptStatus,
  type OptionId,
  type Pillar,
  type QuizState,
} from '@/lib/config/constants';
import { SEED_QUESTIONS } from '@/lib/quiz/seed-questions';
import { compareAttempts, findWinners } from '@/lib/quiz/ranking';
import { buildPublicName } from '@/lib/utils/identity';
import type { QuestionWriteInput } from '@/lib/validation/schemas';
import type {
  AdminAttemptRow,
  AdminAuditEntry,
  AdminParticipantRow,
  AppSettings,
  Attempt,
  AttemptAnswer,
  AttemptQuestion,
  DashboardMetrics,
  EditableSettings,
  EventStats,
  LeaderboardRow,
  Participant,
  Question,
} from '@/types/domain';
import { bucketByHour, toAdminAttemptRow } from '@/lib/database/supabase-store';
import {
  StoreError,
  type AuditInput,
  type DataStore,
  type FinaliseAnswerInput,
  type FinaliseAttemptResult,
  type ParticipantExportRow,
  type QuestionFilter,
  type RegisterParticipantInput,
  type RegisterParticipantResult,
  type ServedQuestion,
  type StartAttemptQuestion,
  type StartAttemptResult,
} from '@/lib/database/store';

/**
 * In-memory store used only when DEMO_MODE is on.
 *
 * It exists so the whole interface can be reviewed before a Supabase project exists. It holds
 * obviously fake participants ("Demo Participant …", @example.invalid addresses) and resets whenever
 * the server restarts. It is never reachable from a production deployment — see `isDemoMode()`.
 */

const DEMO_LEADER_NAMES = [
  'Ananya Sharma',
  'Rohit Menon',
  'Kavita Iyer',
  'Farhan Qureshi',
  'Meera Nair',
  'Siddharth Rao',
  'Priya Deshmukh',
  'Arjun Kulkarni',
  'Neha Bhatia',
  'Vikram Chandra',
  'Sanjana Reddy',
  'Imran Sheikh',
];

/** Obviously fictional employers and titles, so demo data can never be mistaken for real leads. */
const DEMO_COMPANIES = [
  'Northwind Analytics',
  'Example Retail Group',
  'Sample Health Systems',
  'Placeholder Logistics',
  'Demo Financial Services',
];

const DEMO_DESIGNATIONS = [
  'Head of People',
  'HR Business Partner',
  'Director, Talent',
  'Chief People Officer',
  'L&D Manager',
];

type DemoState = {
  settings: AppSettings;
  questions: Question[];
  participants: Participant[];
  attempts: Attempt[];
  attemptQuestions: AttemptQuestion[];
  attemptAnswers: AttemptAnswer[];
  audit: AdminAuditEntry[];
  rateEvents: { action: string; ipHash: string; at: number }[];
  publicNumberSeq: number;
};

/**
 * The demo state lives on `globalThis`, not in a module-level variable.
 *
 * Next.js bundles server components and route handlers separately, so a plain module-scoped variable
 * produces one copy of the data per bundle: an admin API call would mutate a different store from the
 * one a page render reads, and the two would silently disagree. A single global keeps demo mode
 * behaving like a real shared database within the process.
 */
const DEMO_STATE_KEY = Symbol.for('outskill.demoStore.v1');

type DemoGlobal = typeof globalThis & { [DEMO_STATE_KEY]?: DemoState };

function nowIso(): string {
  return new Date().toISOString();
}

function seedState(): DemoState {
  const createdAt = nowIso();

  const questions: Question[] = SEED_QUESTIONS.map((seed) => ({
    id: randomUUID(),
    code: seed.code,
    pillar: seed.pillar,
    difficulty: seed.difficulty,
    question_text: seed.question_text,
    options: seed.options,
    correct_option_id: seed.correct_option_id,
    explanation: seed.explanation,
    active: seed.active,
    review_status: seed.review_status,
    created_at: createdAt,
    updated_at: createdAt,
  }));

  const fresh: DemoState = {
    settings: { id: 'singleton', ...DEFAULT_SETTINGS, updated_at: createdAt },
    questions,
    participants: [],
    attempts: [],
    attemptQuestions: [],
    attemptAnswers: [],
    audit: [],
    rateEvents: [],
    publicNumberSeq: 100,
  };

  // A pre-populated leaderboard so the display and LED screens have something to show.
  DEMO_LEADER_NAMES.forEach((name, index) => {
    const participantId = randomUUID();
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
    const submittedAt = new Date(Date.now() - (index + 1) * 7 * 60_000).toISOString();

    fresh.participants.push({
      id: participantId,
      full_name: name,
      email: `${slug}@example.invalid`,
      email_normalized: `${slug}@example.invalid`,
      phone_original: `98${String(10_000_000 + index * 137).slice(0, 8)}`,
      phone_e164: `+9198${String(10_000_000 + index * 137).slice(0, 8)}`,
      // Every fifth row has no company: it stands in for a registration taken before these fields
      // existed. Every third has no designation, standing in for someone who left the optional field
      // blank. Both make the em-dash rendering visible without touching real data.
      company_name: index % 5 === 4 ? null : (DEMO_COMPANIES[index % DEMO_COMPANIES.length] ?? null),
      designation: index % 3 === 2 ? null : (DEMO_DESIGNATIONS[index % DEMO_DESIGNATIONS.length] ?? null),
      public_leaderboard_opt_in: index % 3 !== 2,
      marketing_opt_in: index % 2 === 0,
      accepted_rules_at: submittedAt,
      created_at: submittedAt,
      updated_at: submittedAt,
    });

    fresh.publicNumberSeq += 1;
    fresh.attempts.push({
      id: randomUUID(),
      participant_id: participantId,
      status: 'submitted',
      started_at: submittedAt,
      deadline_at: submittedAt,
      submitted_at: submittedAt,
      correct_count: Math.max(3, 7 - Math.floor(index / 2)),
      elapsed_ms: 28_400 + index * 2_150,
      verified_at: index < 3 ? submittedAt : null,
      verified_by: index < 3 ? 'demo-admin' : null,
      disqualified_at: null,
      disqualified_by: null,
      disqualification_reason: null,
      invalidated_at: null,
      replacement_for_attempt_id: null,
      public_number: fresh.publicNumberSeq,
      created_at: submittedAt,
      updated_at: submittedAt,
    });
  });

  return fresh;
}

function store(): DemoState {
  const scope = globalThis as DemoGlobal;
  scope[DEMO_STATE_KEY] ??= seedState();
  return scope[DEMO_STATE_KEY];
}

/** Exposed for tests: drop all demo data and re-seed. */
export function resetDemoStore(): void {
  delete (globalThis as DemoGlobal)[DEMO_STATE_KEY];
}

function questionFromInput(input: QuestionWriteInput, existing?: Question): Question {
  const timestamp = nowIso();
  return {
    id: existing?.id ?? randomUUID(),
    code: input.code,
    pillar: input.pillar,
    difficulty: input.difficulty,
    question_text: input.question_text,
    options: [
      { id: 'a', text: input.option_a },
      { id: 'b', text: input.option_b },
      { id: 'c', text: input.option_c },
      { id: 'd', text: input.option_d },
    ],
    correct_option_id: input.correct_option,
    explanation: input.explanation,
    active: input.active,
    review_status: input.review_status,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

export class DemoStore implements DataStore {
  readonly kind = 'demo' as const;

  /* ----- settings ----- */

  async getSettings(): Promise<AppSettings> {
    return { ...store().settings };
  }

  async updateSettings(input: EditableSettings): Promise<AppSettings> {
    const current = store();
    const { quiz_state: _ignored, ...editable } = input;
    current.settings = { ...current.settings, ...editable, updated_at: nowIso() };
    return { ...current.settings };
  }

  async setQuizState(quizState: QuizState, actor: string): Promise<QuizState> {
    const current = store();
    const previous = current.settings.quiz_state;
    current.settings = { ...current.settings, quiz_state: quizState, updated_at: nowIso() };
    await this.recordAudit({
      action: 'quiz.state_changed',
      target_type: 'app_settings',
      detail: { from: previous, to: quizState },
      actor_label: actor,
    });
    return quizState;
  }

  /* ----- questions ----- */

  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    const term = filter.q?.toLowerCase();
    return store()
      .questions.filter((question) => {
        if (filter.pillar && question.pillar !== filter.pillar) return false;
        if (filter.difficulty && question.difficulty !== filter.difficulty) return false;
        if (filter.review_status && question.review_status !== filter.review_status) return false;
        if (filter.active !== undefined && question.active !== filter.active) return false;
        if (term) {
          const haystack = `${question.code} ${question.question_text}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((question) => ({ ...question }));
  }

  async getServeableQuestions(): Promise<Question[]> {
    return store()
      .questions.filter((question) => question.active && question.review_status !== 'draft')
      .map((question) => ({ ...question }));
  }

  async getQuestion(id: string): Promise<Question | null> {
    return store().questions.find((question) => question.id === id) ?? null;
  }

  async createQuestion(input: QuestionWriteInput): Promise<Question> {
    const current = store();
    if (current.questions.some((question) => question.code === input.code)) {
      throw new StoreError('duplicate_code', `A question with the code "${input.code}" already exists.`);
    }
    const question = questionFromInput(input);
    current.questions.push(question);
    return { ...question };
  }

  async updateQuestion(id: string, input: QuestionWriteInput): Promise<Question> {
    const current = store();
    const index = current.questions.findIndex((question) => question.id === id);
    const existing = current.questions[index];
    if (index === -1 || !existing) throw new StoreError('not_found', 'That question no longer exists.');

    const updated = questionFromInput(input, existing);
    current.questions[index] = updated;
    return { ...updated };
  }

  async importQuestions(inputs: readonly QuestionWriteInput[]): Promise<{ inserted: number; updated: number }> {
    const current = store();
    let inserted = 0;
    let updated = 0;

    for (const input of inputs) {
      const index = current.questions.findIndex((question) => question.code === input.code);
      const existing = current.questions[index];
      if (index >= 0 && existing) {
        current.questions[index] = questionFromInput(input, existing);
        updated += 1;
      } else {
        current.questions.push(questionFromInput(input));
        inserted += 1;
      }
    }

    return { inserted, updated };
  }

  /* ----- participants and attempts ----- */

  async registerParticipant(input: RegisterParticipantInput): Promise<RegisterParticipantResult> {
    const current = store();
    const existing = current.participants.find(
      (participant) =>
        participant.email_normalized === input.email_normalized || participant.phone_e164 === input.phone_e164,
    );
    if (existing) return { participantId: existing.id, duplicate: true };

    const timestamp = nowIso();
    const participant: Participant = {
      id: randomUUID(),
      full_name: input.full_name,
      email: input.email,
      email_normalized: input.email_normalized,
      phone_original: input.phone_original,
      phone_e164: input.phone_e164,
      company_name: input.company_name,
      designation: input.designation,
      public_leaderboard_opt_in: input.public_leaderboard_opt_in,
      marketing_opt_in: input.marketing_opt_in,
      accepted_rules_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };
    current.participants.push(participant);

    current.publicNumberSeq += 1;
    current.attempts.push({
      id: randomUUID(),
      participant_id: participant.id,
      status: 'registered',
      started_at: null,
      deadline_at: null,
      submitted_at: null,
      correct_count: null,
      elapsed_ms: null,
      verified_at: null,
      verified_by: null,
      disqualified_at: null,
      disqualified_by: null,
      disqualification_reason: null,
      invalidated_at: null,
      replacement_for_attempt_id: null,
      public_number: current.publicNumberSeq,
      created_at: timestamp,
      updated_at: timestamp,
    });

    return { participantId: participant.id, duplicate: false };
  }

  async getParticipant(id: string): Promise<Participant | null> {
    return store().participants.find((participant) => participant.id === id) ?? null;
  }

  async getLiveAttempt(participantId: string): Promise<Attempt | null> {
    const live: AttemptStatus[] = ['registered', 'in_progress', 'submitted', 'timed_out'];
    return (
      store()
        .attempts.filter((attempt) => attempt.participant_id === participantId && live.includes(attempt.status))
        .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
    );
  }

  async startAttempt(
    participantId: string,
    durationSeconds: number,
    questions: readonly StartAttemptQuestion[],
  ): Promise<StartAttemptResult> {
    const current = store();
    const attempt = await this.getLiveAttempt(participantId);
    if (!attempt) throw new StoreError('invalid_state', 'No live attempt for this participant.');

    if (attempt.status !== 'registered') {
      return {
        attemptId: attempt.id,
        startedAt: attempt.started_at ?? nowIso(),
        deadlineAt: attempt.deadline_at ?? nowIso(),
        alreadyStarted: true,
        status: attempt.status,
      };
    }

    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    attempt.status = 'in_progress';
    attempt.started_at = startedAt.toISOString();
    attempt.deadline_at = deadlineAt.toISOString();
    attempt.updated_at = nowIso();

    for (const question of questions) {
      current.attemptQuestions.push({
        attempt_id: attempt.id,
        question_id: question.question_id,
        display_order: question.display_order,
        option_order: question.option_order,
        created_at: nowIso(),
      });
    }

    return {
      attemptId: attempt.id,
      startedAt: attempt.started_at,
      deadlineAt: attempt.deadline_at,
      alreadyStarted: false,
      status: attempt.status,
    };
  }

  async getAttempt(attemptId: string): Promise<Attempt | null> {
    return store().attempts.find((attempt) => attempt.id === attemptId) ?? null;
  }

  async getServedQuestions(attemptId: string): Promise<ServedQuestion[]> {
    const current = store();
    return current.attemptQuestions
      .filter((row) => row.attempt_id === attemptId)
      .sort((left, right) => left.display_order - right.display_order)
      .flatMap((row) => {
        const question = current.questions.find((candidate) => candidate.id === row.question_id);
        if (!question) return [];
        return [{ question: { ...question }, display_order: row.display_order, option_order: row.option_order }];
      });
  }

  async getAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
    return store().attemptAnswers.filter((answer) => answer.attempt_id === attemptId);
  }

  async finaliseAttempt(
    attemptId: string,
    answers: readonly FinaliseAnswerInput[],
    elapsedMs: number,
    timedOut: boolean,
  ): Promise<FinaliseAttemptResult> {
    const current = store();
    const attempt = current.attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) throw new StoreError('not_found', 'That challenge no longer exists.');

    if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
      return {
        attemptId: attempt.id,
        status: attempt.status,
        correctCount: attempt.correct_count ?? 0,
        elapsedMs: attempt.elapsed_ms ?? 0,
        submittedAt: attempt.submitted_at ?? nowIso(),
        alreadyFinal: true,
      };
    }

    if (attempt.status !== 'in_progress') {
      throw new StoreError('invalid_state', 'This challenge is no longer open for submission.');
    }

    const served = current.attemptQuestions.filter((row) => row.attempt_id === attemptId);
    const servedIds = new Set(served.map((row) => row.question_id));

    for (const answer of answers) {
      if (!servedIds.has(answer.question_id)) continue;
      if (current.attemptAnswers.some((row) => row.attempt_id === attemptId && row.question_id === answer.question_id)) {
        continue;
      }
      const question = current.questions.find((candidate) => candidate.id === answer.question_id);
      current.attemptAnswers.push({
        attempt_id: attemptId,
        question_id: answer.question_id,
        selected_option_id: answer.selected_option_id,
        answered_offset_ms: answer.answered_offset_ms,
        is_correct: answer.selected_option_id !== null && answer.selected_option_id === question?.correct_option_id,
        created_at: nowIso(),
      });
    }

    const correctCount = current.attemptAnswers.filter(
      (answer) => answer.attempt_id === attemptId && answer.is_correct,
    ).length;

    attempt.status = timedOut ? 'timed_out' : 'submitted';
    attempt.submitted_at = nowIso();
    attempt.correct_count = correctCount;
    attempt.elapsed_ms = elapsedMs;
    attempt.updated_at = nowIso();

    return {
      attemptId: attempt.id,
      status: attempt.status,
      correctCount,
      elapsedMs,
      submittedAt: attempt.submitted_at,
      alreadyFinal: false,
    };
  }

  /* ----- leaderboard and stats ----- */

  private rankedRows(): LeaderboardRow[] {
    const current = store();
    return current.attempts
      .filter((attempt) => attempt.status === 'submitted' && !attempt.disqualified_at && !attempt.invalidated_at)
      .flatMap((attempt) => {
        const participant = current.participants.find((candidate) => candidate.id === attempt.participant_id);
        if (!participant || attempt.correct_count === null || attempt.elapsed_ms === null || !attempt.submitted_at) {
          return [];
        }
        return [
          {
            rank: 0,
            attempt_id: attempt.id,
            participant_id: participant.id,
            correct_count: attempt.correct_count,
            elapsed_ms: attempt.elapsed_ms,
            submitted_at: attempt.submitted_at,
            verified: attempt.verified_at != null,
            public_leaderboard_opt_in: participant.public_leaderboard_opt_in,
            full_name: participant.full_name,
            public_number: attempt.public_number,
          },
        ];
      })
      .sort(compareAttempts)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    return this.rankedRows().slice(0, limit);
  }

  async getRank(attemptId: string): Promise<number | null> {
    return this.rankedRows().find((row) => row.attempt_id === attemptId)?.rank ?? null;
  }

  async getStats(): Promise<EventStats> {
    const current = store();
    const ranked = this.rankedRows();
    const perAttempt = current.settings.questions_per_attempt;

    const perfect = ranked.filter((row) => row.correct_count === perAttempt);
    const accuracyByPillar = new Map<Pillar, { correct: number; total: number }>();
    for (const answer of current.attemptAnswers) {
      const question = current.questions.find((candidate) => candidate.id === answer.question_id);
      if (!question) continue;
      const bucket = accuracyByPillar.get(question.pillar) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (answer.is_correct) bucket.correct += 1;
      accuracyByPillar.set(question.pillar, bucket);
    }

    // Same minimum-sample guard as the SQL implementation, so demo and production agree.
    const scored = PILLARS.map((pillar) => {
      const bucket = accuracyByPillar.get(pillar);
      if (!bucket || bucket.total < 10) return null;
      return { pillar, accuracy: bucket.correct / bucket.total };
    }).filter((entry): entry is { pillar: Pillar; accuracy: number } => entry !== null);
    scored.sort((left, right) => left.accuracy - right.accuracy || left.pillar.localeCompare(right.pillar));
    const toughest = scored[0] ?? null;

    return {
      total_challengers: current.participants.length,
      total_completed: ranked.length,
      average_score:
        ranked.length > 0
          ? Number((ranked.reduce((sum, row) => sum + row.correct_count, 0) / ranked.length).toFixed(2))
          : null,
      best_score: ranked.length > 0 ? Math.max(...ranked.map((row) => row.correct_count)) : null,
      fastest_perfect_ms: perfect.length > 0 ? Math.min(...perfect.map((row) => row.elapsed_ms)) : null,
      toughest_pillar: toughest?.pillar ?? null,
      toughest_pillar_accuracy: toughest ? Number(toughest.accuracy.toFixed(3)) : null,
    };
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const current = store();
    const settings = current.settings;
    const stats = await this.getStats();
    const ranked = this.rankedRows();
    const topSlice = ranked.slice(0, settings.leaderboard_size);
    const winners = findWinners(ranked);

    return {
      quiz_state: settings.quiz_state,
      total_registrations: current.participants.length,
      total_completed: ranked.length,
      completion_rate: current.participants.length > 0 ? ranked.length / current.participants.length : 0,
      average_score: stats.average_score,
      perfect_scores: ranked.filter((row) => row.correct_count === settings.questions_per_attempt).length,
      verified_top_entries: topSlice.filter((row) => row.verified).length,
      pending_top_verifications: topSlice.filter((row) => !row.verified).length,
      attempts_over_time: bucketByHour(ranked.map((row) => row.submitted_at)),
      recent_submissions: [...ranked]
        .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))
        .slice(0, 10)
        .map((row) => ({
          attempt_id: row.attempt_id,
          correct_count: row.correct_count,
          elapsed_ms: row.elapsed_ms,
          submitted_at: row.submitted_at,
          display_name: buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number),
        })),
      provisional_winner: winners.provisional,
      verified_winner: winners.verified,
    };
  }

  /* ----- admin operations ----- */

  async searchParticipants(query: string | undefined, limit: number): Promise<AdminParticipantRow[]> {
    const current = store();
    const term = query?.toLowerCase().trim();
    const ranked = this.rankedRows();

    return current.participants
      .filter((participant) => {
        if (!term) return true;
        const haystack = [
          participant.full_name,
          participant.email_normalized,
          participant.phone_e164,
          participant.company_name ?? '',
          participant.designation ?? '',
          participant.id,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, limit)
      .map((participant) => {
        const latest =
          current.attempts
            .filter((attempt) => attempt.participant_id === participant.id)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
        return {
          participant,
          latest_attempt: latest,
          rank: ranked.find((row) => row.participant_id === participant.id)?.rank ?? null,
        };
      });
  }

  async searchAttempts(
    query: string | undefined,
    status: AttemptStatus | undefined,
    limit: number,
  ): Promise<AdminAttemptRow[]> {
    const current = store();
    const term = query?.toLowerCase().trim();
    const rankByAttempt = new Map(this.rankedRows().map((row) => [row.attempt_id, row.rank]));

    return current.attempts
      .flatMap((attempt) => {
        const participant = current.participants.find((candidate) => candidate.id === attempt.participant_id);
        if (!participant) return [];
        if (status && attempt.status !== status) return [];
        if (term) {
          const haystack =
            `${participant.full_name} ${participant.email_normalized} ${participant.phone_e164}`.toLowerCase();
          if (!haystack.includes(term)) return [];
        }
        return [toAdminAttemptRow(attempt, participant, rankByAttempt.get(attempt.id) ?? 0)];
      })
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          if (left.rank === 0) return 1;
          if (right.rank === 0) return -1;
          return left.rank - right.rank;
        }
        return right.submitted_at.localeCompare(left.submitted_at);
      })
      .slice(0, limit);
  }

  async setVerification(attemptId: string, verified: boolean, actor: string): Promise<Attempt> {
    const attempt = store().attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) throw new StoreError('not_found', 'That attempt no longer exists.');
    attempt.verified_at = verified ? nowIso() : null;
    attempt.verified_by = verified ? actor : null;
    attempt.updated_at = nowIso();
    return { ...attempt };
  }

  async disqualifyAttempt(attemptId: string, reason: string, actor: string): Promise<Attempt> {
    const attempt = store().attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) throw new StoreError('not_found', 'That attempt no longer exists.');
    attempt.status = 'disqualified';
    attempt.disqualified_at = nowIso();
    attempt.disqualified_by = actor;
    attempt.disqualification_reason = reason;
    attempt.updated_at = nowIso();
    return { ...attempt };
  }

  async restoreAttempt(attemptId: string, actor: string): Promise<Attempt> {
    const attempt = store().attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) throw new StoreError('not_found', 'That attempt no longer exists.');
    if (attempt.status !== 'disqualified') {
      throw new StoreError('invalid_state', 'Only a disqualified attempt can be restored.');
    }

    attempt.status = attempt.submitted_at ? 'submitted' : 'registered';
    attempt.disqualified_at = null;
    attempt.disqualified_by = null;
    attempt.disqualification_reason = null;
    attempt.updated_at = nowIso();

    await this.recordAudit({
      action: 'attempt.restored',
      target_type: 'attempt',
      target_id: attemptId,
      detail: { restored_to: attempt.status },
      actor_label: actor,
    });
    return { ...attempt };
  }

  async resetParticipant(
    participantId: string,
    reason: string,
  ): Promise<{ newAttemptId: string; invalidatedAttemptId: string | null }> {
    const current = store();
    const existing = await this.getLiveAttempt(participantId);
    if (existing) {
      existing.status = 'invalidated';
      existing.invalidated_at = nowIso();
      existing.updated_at = nowIso();
    }

    current.publicNumberSeq += 1;
    const timestamp = nowIso();
    const replacement: Attempt = {
      id: randomUUID(),
      participant_id: participantId,
      status: 'registered',
      started_at: null,
      deadline_at: null,
      submitted_at: null,
      correct_count: null,
      elapsed_ms: null,
      verified_at: null,
      verified_by: null,
      disqualified_at: null,
      disqualified_by: null,
      disqualification_reason: null,
      invalidated_at: null,
      replacement_for_attempt_id: existing?.id ?? null,
      public_number: current.publicNumberSeq,
      created_at: timestamp,
      updated_at: timestamp,
    };
    current.attempts.push(replacement);

    await this.recordAudit({
      action: 'participant.reset',
      target_type: 'participant',
      target_id: participantId,
      detail: { reason, invalidated_attempt_id: existing?.id ?? null, new_attempt_id: replacement.id },
    });

    return { newAttemptId: replacement.id, invalidatedAttemptId: existing?.id ?? null };
  }

  /* ----- audit and abuse control ----- */

  async recordAudit(entry: AuditInput): Promise<void> {
    store().audit.unshift({
      id: randomUUID(),
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id ?? null,
      detail: entry.detail ?? null,
      actor_label: entry.actor_label ?? 'event-admin',
      created_at: nowIso(),
    });
  }

  async listAudit(limit: number, targetId?: string): Promise<AdminAuditEntry[]> {
    return store()
      .audit.filter((entry) => !targetId || entry.target_id === targetId)
      .slice(0, limit);
  }

  async recordRateEvent(action: string, ipHash: string): Promise<void> {
    store().rateEvents.push({ action, ipHash, at: Date.now() });
  }

  async countRateEvents(action: string, ipHash: string, windowSeconds: number): Promise<number> {
    const cutoff = Date.now() - windowSeconds * 1000;
    const current = store();
    current.rateEvents = current.rateEvents.filter((event) => event.at >= Date.now() - 60 * 60 * 1000);
    return current.rateEvents.filter(
      (event) => event.action === action && event.ipHash === ipHash && event.at >= cutoff,
    ).length;
  }

  /* ----- exports ----- */

  async exportParticipants(): Promise<ParticipantExportRow[]> {
    const current = store();
    return current.participants.map((participant) => {
      const latest =
        current.attempts
          .filter((attempt) => attempt.participant_id === participant.id)
          .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
      return {
        ...participant,
        attempt_id: latest?.id ?? null,
        attempt_status: latest?.status ?? null,
        correct_count: latest?.correct_count ?? null,
        questions_attempted: latest
          ? current.attemptAnswers.filter(
              (answer) => answer.attempt_id === latest.id && answer.selected_option_id !== null,
            ).length
          : 0,
        elapsed_ms: latest?.elapsed_ms ?? null,
        submitted_at: latest?.submitted_at ?? null,
        verified: latest?.verified_at != null,
        verified_at: latest?.verified_at ?? null,
        disqualified: latest?.disqualified_at != null,
        disqualified_at: latest?.disqualified_at ?? null,
        disqualification_reason: latest?.disqualification_reason ?? null,
      };
    });
  }

  async exportAttempts(): Promise<AdminAttemptRow[]> {
    return this.searchAttempts(undefined, undefined, 5000);
  }

  async anonymiseParticipants(): Promise<{ anonymised: number; alreadyAnonymised: number }> {
    const current = store();
    const timestamp = nowIso();
    let anonymised = 0;
    let alreadyAnonymised = 0;

    current.participants.forEach((participant, index) => {
      if (participant.full_name === ANONYMISED_NAME) {
        alreadyAnonymised += 1;
        return;
      }

      // Placeholders must stay unique: both email and phone carry unique indexes in Postgres, and the
      // phone column has a format check, so the substitute still has to look like an E.164 number.
      participant.full_name = ANONYMISED_NAME;
      participant.email = `anonymised.${index + 1}@invalid`;
      participant.email_normalized = `anonymised.${index + 1}@invalid`;
      participant.phone_original = '';
      participant.phone_e164 = `+1${String(900_000_000 + index + 1)}`;
      // Company and job title are re-identifying in combination, so they go too.
      participant.company_name = null;
      participant.designation = null;
      // Consent flags no longer describe a person anyone can contact, and leaving the leaderboard
      // opt-in on would keep publishing a name that is now meaningless.
      participant.public_leaderboard_opt_in = false;
      participant.marketing_opt_in = false;
      participant.updated_at = timestamp;
      anonymised += 1;
    });

    return { anonymised, alreadyAnonymised };
  }

  async countAnonymisedParticipants(): Promise<{ total: number; anonymised: number }> {
    const current = store();
    return {
      total: current.participants.length,
      anonymised: current.participants.filter((participant) => participant.full_name === ANONYMISED_NAME).length,
    };
  }
}

/** Demo option ids, re-exported so the seed data stays type-checked against the real union. */
export type { OptionId };
