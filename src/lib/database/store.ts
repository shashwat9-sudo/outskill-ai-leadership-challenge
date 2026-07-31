import type { AttemptStatus, Difficulty, OptionId, Pillar, QuizState, ReviewStatus } from '@/lib/config/constants';
import type { QuestionWriteInput } from '@/lib/validation/schemas';
import type {
  AdminAttemptRow,
  AdminAuditEntry,
  AdminParticipantRow,
  AppSettings,
  Attempt,
  AttemptAnswer,
  DashboardMetrics,
  EditableSettings,
  EventStats,
  LeaderboardRow,
  Participant,
  Question,
} from '@/types/domain';

/**
 * The one seam between the application and its storage.
 *
 * Route handlers depend on this interface only. `SupabaseStore` is the production implementation;
 * `DemoStore` is an in-memory stand-in used for previews and E2E. Keeping demo mode behind a single
 * interface — instead of `if (demo)` branches inside route handlers — is what makes it impossible for
 * demo behaviour to leak into a production code path.
 */

export type RegisterParticipantInput = {
  full_name: string;
  email: string;
  email_normalized: string;
  phone_original: string;
  phone_e164: string;
  public_leaderboard_opt_in: boolean;
  marketing_opt_in: boolean;
};

export type RegisterParticipantResult = {
  participantId: string | null;
  duplicate: boolean;
};

export type StartAttemptQuestion = {
  question_id: string;
  display_order: number;
  option_order: OptionId[];
};

export type StartAttemptResult = {
  attemptId: string;
  startedAt: string;
  deadlineAt: string;
  alreadyStarted: boolean;
  status: AttemptStatus;
};

export type FinaliseAnswerInput = {
  question_id: string;
  selected_option_id: OptionId | null;
  answered_offset_ms: number | null;
};

export type FinaliseAttemptResult = {
  attemptId: string;
  status: AttemptStatus;
  correctCount: number;
  elapsedMs: number;
  submittedAt: string;
  alreadyFinal: boolean;
};

export type ServedQuestion = {
  question: Question;
  display_order: number;
  option_order: OptionId[];
};

export type QuestionFilter = {
  q?: string;
  pillar?: Pillar;
  difficulty?: Difficulty;
  active?: boolean;
  review_status?: ReviewStatus;
};

export type AuditInput = {
  action: string;
  target_type: string;
  target_id?: string | null;
  detail?: Record<string, unknown> | null;
  actor_label?: string;
};

export type ParticipantExportRow = Participant & {
  attempt_id: string | null;
  attempt_status: AttemptStatus | null;
  correct_count: number | null;
  /** How many of the served questions the participant actually answered. */
  questions_attempted: number;
  elapsed_ms: number | null;
  submitted_at: string | null;
  verified: boolean;
  verified_at: string | null;
  disqualified: boolean;
  disqualified_at: string | null;
  disqualification_reason: string | null;
};

/** Raised when a store operation fails for a reason the caller can act on. */
export class StoreError extends Error {
  readonly code:
    | 'not_found'
    | 'conflict'
    | 'unavailable'
    | 'invalid_state'
    | 'duplicate_code';

  constructor(code: StoreError['code'], message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

export interface DataStore {
  readonly kind: 'supabase' | 'demo';

  /* ----- settings ----- */
  getSettings(): Promise<AppSettings>;
  updateSettings(input: EditableSettings): Promise<AppSettings>;
  setQuizState(state: QuizState, actor: string): Promise<QuizState>;

  /* ----- questions ----- */
  listQuestions(filter?: QuestionFilter): Promise<Question[]>;
  getServeableQuestions(): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | null>;
  createQuestion(input: QuestionWriteInput): Promise<Question>;
  updateQuestion(id: string, input: QuestionWriteInput): Promise<Question>;
  /** Upsert by `code` — used by CSV import. Returns how many rows were new vs replaced. */
  importQuestions(inputs: readonly QuestionWriteInput[]): Promise<{ inserted: number; updated: number }>;

  /* ----- participants and attempts ----- */
  registerParticipant(input: RegisterParticipantInput): Promise<RegisterParticipantResult>;
  getParticipant(id: string): Promise<Participant | null>;
  getLiveAttempt(participantId: string): Promise<Attempt | null>;
  startAttempt(
    participantId: string,
    durationSeconds: number,
    questions: readonly StartAttemptQuestion[],
  ): Promise<StartAttemptResult>;
  getAttempt(attemptId: string): Promise<Attempt | null>;
  getServedQuestions(attemptId: string): Promise<ServedQuestion[]>;
  getAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]>;
  finaliseAttempt(
    attemptId: string,
    answers: readonly FinaliseAnswerInput[],
    elapsedMs: number,
    timedOut: boolean,
  ): Promise<FinaliseAttemptResult>;

  /* ----- leaderboard and stats ----- */
  getLeaderboard(limit: number): Promise<LeaderboardRow[]>;
  getRank(attemptId: string): Promise<number | null>;
  getStats(): Promise<EventStats>;
  getDashboardMetrics(): Promise<DashboardMetrics>;

  /* ----- admin operations ----- */
  searchParticipants(query: string | undefined, limit: number): Promise<AdminParticipantRow[]>;
  searchAttempts(
    query: string | undefined,
    status: AttemptStatus | undefined,
    limit: number,
  ): Promise<AdminAttemptRow[]>;
  setVerification(attemptId: string, verified: boolean, actor: string): Promise<Attempt>;
  disqualifyAttempt(attemptId: string, reason: string, actor: string): Promise<Attempt>;
  restoreAttempt(attemptId: string, actor: string): Promise<Attempt>;
  resetParticipant(participantId: string, reason: string): Promise<{ newAttemptId: string; invalidatedAttemptId: string | null }>;

  /* ----- audit and abuse control ----- */
  recordAudit(entry: AuditInput): Promise<void>;
  listAudit(limit: number, targetId?: string): Promise<AdminAuditEntry[]>;
  recordRateEvent(action: string, ipHash: string): Promise<void>;
  countRateEvents(action: string, ipHash: string, windowSeconds: number): Promise<number>;

  /* ----- exports ----- */
  exportParticipants(): Promise<ParticipantExportRow[]>;
  exportAttempts(): Promise<AdminAttemptRow[]>;

  /* ----- retention ----- */
  /**
   * Irreversibly replace every participant's name, email and phone with a placeholder.
   *
   * Attempts, scores, times and ranks are left intact, so the leaderboard and the aggregate event
   * statistics still work afterwards — what is destroyed is the link to a person. Never called on a
   * schedule: an administrator runs it from the admin UI once the lead export is complete.
   */
  anonymiseParticipants(): Promise<{ anonymised: number; alreadyAnonymised: number }>;
  countAnonymisedParticipants(): Promise<{ total: number; anonymised: number }>;
}
