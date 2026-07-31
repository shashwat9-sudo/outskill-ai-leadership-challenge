import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseSecretKey, getSupabaseUrl } from '@/lib/config/env';
import {
  ANONYMISED_NAME,
  DEFAULT_SETTINGS,
  type AttemptStatus,
  type OptionId,
  type QuizState,
} from '@/lib/config/constants';
import { buildPublicName } from '@/lib/utils/identity';
import { findWinners } from '@/lib/quiz/ranking';
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
 * Production data access.
 *
 * The Supabase secret key is read here and nowhere else. This module is marked `server-only`, so an
 * accidental import from a client component is a build error rather than a leaked key.
 */

let cachedClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'outskill-ai-leadership-challenge' } },
  });
  return cachedClient;
}

/** Postgres error codes we translate into a caller-actionable StoreError. */
const NOT_FOUND_CODES = new Set(['P0002', 'PGRST116']);
const UNIQUE_VIOLATION = '23505';

function fail(context: string, error: { message: string; code?: string } | null): never {
  if (error && NOT_FOUND_CODES.has(error.code ?? '')) {
    throw new StoreError('not_found', `${context}: not found.`);
  }
  if (error?.code === UNIQUE_VIOLATION) {
    throw new StoreError('conflict', `${context}: that record already exists.`);
  }
  throw new StoreError('unavailable', `${context}: ${error?.message ?? 'database unavailable'}`);
}

/* --------------------------------------------------------------------------------------------- */
/* Row shapes returned by Supabase (snake_case, straight from Postgres)                            */
/* --------------------------------------------------------------------------------------------- */

type QuestionRow = Omit<Question, 'options'> & { options: { id: OptionId; text: string }[] };
type LeaderboardViewRow = {
  rank: number;
  attempt_id: string;
  participant_id: string;
  correct_count: number;
  elapsed_ms: number;
  submitted_at: string;
  verified: boolean;
  public_number: number;
  full_name: string;
  public_leaderboard_opt_in: boolean;
};

function toQuestion(row: QuestionRow): Question {
  return { ...row, options: row.options };
}

/**
 * Call a Postgres function and read back its rows.
 *
 * The project deliberately does not check in generated Supabase types — the schema lives in
 * `supabase/migrations/` and generated types would be a second source of truth to keep in sync. That
 * leaves `rpc()` untyped, so the shape is asserted here, in one place, next to the SQL it mirrors.
 */
async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<{ rows: T[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await client().rpc(name, args);
  if (error) return { rows: [], error };
  if (data === null || data === undefined) return { rows: [], error: null };
  return { rows: (Array.isArray(data) ? data : [data]) as T[], error: null };
}

function questionValues(input: QuestionWriteInput) {
  return {
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
  };
}

export class SupabaseStore implements DataStore {
  readonly kind = 'supabase' as const;

  /* ----- settings ----- */

  async getSettings(): Promise<AppSettings> {
    const { data, error } = await client().from('app_settings').select('*').eq('id', 'singleton').maybeSingle();
    if (error) fail('Read settings', error);
    if (!data) {
      throw new StoreError(
        'not_found',
        'The app_settings row is missing. Run supabase/seed.sql against your project.',
      );
    }
    return data as AppSettings;
  }

  async updateSettings(input: EditableSettings): Promise<AppSettings> {
    // quiz_state changes go through setQuizState so they are always audited.
    const { quiz_state: _ignored, ...editable } = input;
    const { data, error } = await client()
      .from('app_settings')
      .update(editable)
      .eq('id', 'singleton')
      .select('*')
      .single();
    if (error) fail('Update settings', error);
    return data as AppSettings;
  }

  async setQuizState(state: QuizState, actor: string): Promise<QuizState> {
    const { rows, error } = await callRpc<QuizState>('set_quiz_state', { p_state: state, p_actor: actor });
    if (error) fail('Change quiz state', error);
    return rows[0] ?? state;
  }

  /* ----- questions ----- */

  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    let query = client().from('questions').select('*').order('code', { ascending: true });

    if (filter.pillar) query = query.eq('pillar', filter.pillar);
    if (filter.difficulty) query = query.eq('difficulty', filter.difficulty);
    if (filter.review_status) query = query.eq('review_status', filter.review_status);
    if (filter.active !== undefined) query = query.eq('active', filter.active);
    if (filter.q) {
      const term = `%${filter.q.replace(/[%_]/g, '')}%`;
      query = query.or(`code.ilike.${term},question_text.ilike.${term}`);
    }

    const { data, error } = await query.returns<QuestionRow[]>();
    if (error) fail('List questions', error);
    return (data ?? []).map(toQuestion);
  }

  async getServeableQuestions(): Promise<Question[]> {
    const { data, error } = await client()
      .from('questions')
      .select('*')
      .eq('active', true)
      .in('review_status', ['reviewed', 'approved'])
      .returns<QuestionRow[]>();
    if (error) fail('Load question pool', error);
    return (data ?? []).map(toQuestion);
  }

  async getQuestion(id: string): Promise<Question | null> {
    const { data, error } = await client().from('questions').select('*').eq('id', id).maybeSingle();
    if (error) fail('Read question', error);
    return data ? toQuestion(data as QuestionRow) : null;
  }

  async createQuestion(input: QuestionWriteInput): Promise<Question> {
    const { data, error } = await client().from('questions').insert(questionValues(input)).select('*').single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new StoreError('duplicate_code', `A question with the code "${input.code}" already exists.`);
      }
      fail('Create question', error);
    }
    return toQuestion(data as QuestionRow);
  }

  async updateQuestion(id: string, input: QuestionWriteInput): Promise<Question> {
    const { data, error } = await client()
      .from('questions')
      .update(questionValues(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) fail('Update question', error);
    return toQuestion(data as QuestionRow);
  }

  async importQuestions(inputs: readonly QuestionWriteInput[]): Promise<{ inserted: number; updated: number }> {
    if (inputs.length === 0) return { inserted: 0, updated: 0 };

    const codes = inputs.map((input) => input.code);
    const { data: existing, error: existingError } = await client()
      .from('questions')
      .select('code')
      .in('code', codes)
      .returns<{ code: string }[]>();
    if (existingError) fail('Check existing question codes', existingError);

    const existingCodes = new Set((existing ?? []).map((row) => row.code));

    const { error } = await client()
      .from('questions')
      .upsert(inputs.map(questionValues), { onConflict: 'code' });
    if (error) fail('Import questions', error);

    return {
      inserted: inputs.filter((input) => !existingCodes.has(input.code)).length,
      updated: inputs.filter((input) => existingCodes.has(input.code)).length,
    };
  }

  /* ----- participants and attempts ----- */

  async registerParticipant(input: RegisterParticipantInput): Promise<RegisterParticipantResult> {
    const { rows, error } = await callRpc<{ participant_id: string | null; duplicate: boolean }>(
      'register_participant_v2',
      {
        p_full_name: input.full_name,
        p_email: input.email,
        p_email_normalized: input.email_normalized,
        p_phone_original: input.phone_original,
        p_phone_e164: input.phone_e164,
        p_public_opt_in: input.public_leaderboard_opt_in,
        p_marketing_opt_in: input.marketing_opt_in,
        p_company_name: input.company_name,
        p_designation: input.designation,
      },
    );
    if (error) fail('Register participant', error);

    const row = rows[0];
    if (!row) throw new StoreError('unavailable', 'Register participant: no result returned.');
    return { participantId: row.participant_id, duplicate: row.duplicate };
  }

  async getParticipant(id: string): Promise<Participant | null> {
    const { data, error } = await client().from('participants').select('*').eq('id', id).maybeSingle();
    if (error) fail('Read participant', error);
    return (data as Participant | null) ?? null;
  }

  async getLiveAttempt(participantId: string): Promise<Attempt | null> {
    const { data, error } = await client()
      .from('attempts')
      .select('*')
      .eq('participant_id', participantId)
      .in('status', ['registered', 'in_progress', 'submitted', 'timed_out'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail('Read attempt', error);
    return (data as Attempt | null) ?? null;
  }

  async startAttempt(
    participantId: string,
    durationSeconds: number,
    questions: readonly StartAttemptQuestion[],
  ): Promise<StartAttemptResult> {
    const { rows, error } = await callRpc<{
      attempt_id: string;
      started_at: string;
      deadline_at: string;
      already_started: boolean;
      status: AttemptStatus;
    }>('start_attempt', {
      p_participant_id: participantId,
      p_duration_seconds: durationSeconds,
      p_questions: questions,
    });
    if (error) fail('Start attempt', error);

    const row = rows[0];
    if (!row) throw new StoreError('invalid_state', 'Start attempt: no live attempt for this participant.');
    return {
      attemptId: row.attempt_id,
      startedAt: row.started_at,
      deadlineAt: row.deadline_at,
      alreadyStarted: row.already_started,
      status: row.status,
    };
  }

  async getAttempt(attemptId: string): Promise<Attempt | null> {
    const { data, error } = await client().from('attempts').select('*').eq('id', attemptId).maybeSingle();
    if (error) fail('Read attempt', error);
    return (data as Attempt | null) ?? null;
  }

  async getServedQuestions(attemptId: string): Promise<ServedQuestion[]> {
    const { data, error } = await client()
      .from('attempt_questions')
      .select('display_order, option_order, questions(*)')
      .eq('attempt_id', attemptId)
      .order('display_order', { ascending: true })
      .returns<{ display_order: number; option_order: OptionId[]; questions: QuestionRow }[]>();
    if (error) fail('Read attempt questions', error);

    return (data ?? []).map((row) => ({
      question: toQuestion(row.questions),
      display_order: row.display_order,
      option_order: row.option_order,
    }));
  }

  async getAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
    const { data, error } = await client().from('attempt_answers').select('*').eq('attempt_id', attemptId);
    if (error) fail('Read attempt answers', error);
    return (data ?? []) as AttemptAnswer[];
  }

  async finaliseAttempt(
    attemptId: string,
    answers: readonly FinaliseAnswerInput[],
    elapsedMs: number,
    timedOut: boolean,
  ): Promise<FinaliseAttemptResult> {
    const { rows, error } = await callRpc<{
      attempt_id: string;
      status: AttemptStatus;
      correct_count: number;
      elapsed_ms: number;
      submitted_at: string;
      already_final: boolean;
    }>('finalise_attempt', {
      p_attempt_id: attemptId,
      p_answers: answers,
      p_elapsed_ms: elapsedMs,
      p_timed_out: timedOut,
    });
    if (error) {
      if (error.message.includes('attempt_not_startable')) {
        throw new StoreError('invalid_state', 'This challenge is no longer open for submission.');
      }
      fail('Submit attempt', error);
    }

    const row = rows[0];
    if (!row) throw new StoreError('not_found', 'Submit attempt: attempt not found.');
    return {
      attemptId: row.attempt_id,
      status: row.status,
      correctCount: row.correct_count,
      elapsedMs: row.elapsed_ms,
      submittedAt: row.submitted_at,
      alreadyFinal: row.already_final,
    };
  }

  /* ----- leaderboard and stats ----- */

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    const { data, error } = await client()
      .from('leaderboard_view')
      .select('*')
      .order('rank', { ascending: true })
      .limit(limit)
      .returns<LeaderboardViewRow[]>();
    if (error) fail('Read leaderboard', error);
    return (data ?? []) as LeaderboardRow[];
  }

  async getRank(attemptId: string): Promise<number | null> {
    const { data, error } = await client()
      .from('leaderboard_view')
      .select('rank')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    if (error) fail('Read rank', error);
    return (data as { rank: number } | null)?.rank ?? null;
  }

  async getStats(): Promise<EventStats> {
    const { rows, error } = await callRpc<{
      total_challengers: number;
      total_completed: number;
      average_score: number | null;
      best_score: number | null;
      fastest_perfect_ms: number | null;
      toughest_pillar: EventStats['toughest_pillar'];
      toughest_pillar_accuracy: number | null;
    }>('event_stats', {});
    if (error) fail('Read stats', error);

    const row = rows[0];
    return {
      total_challengers: Number(row?.total_challengers ?? 0),
      total_completed: Number(row?.total_completed ?? 0),
      average_score: row?.average_score !== null && row?.average_score !== undefined ? Number(row.average_score) : null,
      best_score: row?.best_score ?? null,
      fastest_perfect_ms: row?.fastest_perfect_ms ?? null,
      toughest_pillar: row?.toughest_pillar ?? null,
      toughest_pillar_accuracy:
        row?.toughest_pillar_accuracy !== null && row?.toughest_pillar_accuracy !== undefined
          ? Number(row.toughest_pillar_accuracy)
          : null,
    };
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const settings = await this.getSettings();
    const stats = await this.getStats();
    const board = await this.getLeaderboard(Math.max(settings.leaderboard_size, 10));

    const { count: registrations, error: registrationsError } = await client()
      .from('participants')
      .select('id', { count: 'exact', head: true });
    if (registrationsError) fail('Count registrations', registrationsError);

    const { data: recentRows, error: recentError } = await client()
      .from('leaderboard_view')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(10)
      .returns<LeaderboardViewRow[]>();
    if (recentError) fail('Read recent submissions', recentError);

    const { data: perfectRows, error: perfectError } = await client()
      .from('attempts')
      .select('id')
      .eq('status', 'submitted')
      .is('disqualified_at', null)
      .eq('correct_count', settings.questions_per_attempt)
      .returns<{ id: string }[]>();
    if (perfectError) fail('Count perfect scores', perfectError);

    const { data: buckets, error: bucketsError } = await client()
      .from('attempts')
      .select('submitted_at')
      .eq('status', 'submitted')
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true })
      .returns<{ submitted_at: string }[]>();
    if (bucketsError) fail('Read attempts over time', bucketsError);

    const topSlice = board.slice(0, settings.leaderboard_size);
    const winners = findWinners(board);

    return {
      quiz_state: settings.quiz_state,
      total_registrations: registrations ?? 0,
      total_completed: stats.total_completed,
      completion_rate: registrations ? stats.total_completed / registrations : 0,
      average_score: stats.average_score,
      perfect_scores: (perfectRows ?? []).length,
      verified_top_entries: topSlice.filter((row) => row.verified).length,
      pending_top_verifications: topSlice.filter((row) => !row.verified).length,
      attempts_over_time: bucketByHour((buckets ?? []).map((row) => row.submitted_at)),
      recent_submissions: (recentRows ?? []).map((row) => ({
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
    let request = client().from('participants').select('*').order('created_at', { ascending: false }).limit(limit);

    if (query) {
      const term = `%${query.replace(/[%_]/g, '')}%`;
      const clauses = [
        `full_name.ilike.${term}`,
        `email_normalized.ilike.${term}`,
        `phone_e164.ilike.${term}`,
        `company_name.ilike.${term}`,
        `designation.ilike.${term}`,
      ];
      // A UUID search must be an equality test; ilike against a uuid column is a type error.
      if (/^[0-9a-f-]{36}$/i.test(query)) clauses.push(`id.eq.${query}`);
      request = request.or(clauses.join(','));
    }

    const { data, error } = await request.returns<Participant[]>();
    if (error) fail('Search participants', error);

    const participants = data ?? [];
    if (participants.length === 0) return [];

    const ids = participants.map((participant) => participant.id);
    const { data: attempts, error: attemptsError } = await client()
      .from('attempts')
      .select('*')
      .in('participant_id', ids)
      .order('created_at', { ascending: false })
      .returns<Attempt[]>();
    if (attemptsError) fail('Read participant attempts', attemptsError);

    const { data: ranks, error: ranksError } = await client()
      .from('leaderboard_view')
      .select('participant_id, rank')
      .in('participant_id', ids)
      .returns<{ participant_id: string; rank: number }[]>();
    if (ranksError) fail('Read participant ranks', ranksError);

    const latestByParticipant = new Map<string, Attempt>();
    for (const attempt of attempts ?? []) {
      if (!latestByParticipant.has(attempt.participant_id)) latestByParticipant.set(attempt.participant_id, attempt);
    }
    const rankByParticipant = new Map((ranks ?? []).map((row) => [row.participant_id, row.rank]));

    return participants.map((participant) => ({
      participant,
      latest_attempt: latestByParticipant.get(participant.id) ?? null,
      rank: rankByParticipant.get(participant.id) ?? null,
    }));
  }

  async searchAttempts(
    query: string | undefined,
    status: AttemptStatus | undefined,
    limit: number,
  ): Promise<AdminAttemptRow[]> {
    let request = client()
      .from('attempts')
      .select('*, participants!inner(*)')
      .order('correct_count', { ascending: false, nullsFirst: false })
      .order('elapsed_ms', { ascending: true, nullsFirst: false })
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (status) request = request.eq('status', status);
    if (query) {
      const term = `%${query.replace(/[%_]/g, '')}%`;
      request = request.or(
        `full_name.ilike.${term},email_normalized.ilike.${term},phone_e164.ilike.${term}`,
        { referencedTable: 'participants' },
      );
    }

    const { data, error } = await request.returns<(Attempt & { participants: Participant })[]>();
    if (error) fail('Search attempts', error);

    const ranks = await this.getLeaderboard(1000);
    const rankByAttempt = new Map(ranks.map((row) => [row.attempt_id, row.rank]));

    return (data ?? []).map((row) => toAdminAttemptRow(row, row.participants, rankByAttempt.get(row.id) ?? 0));
  }

  async setVerification(attemptId: string, verified: boolean, actor: string): Promise<Attempt> {
    const { data, error } = await client()
      .from('attempts')
      .update(
        verified
          ? { verified_at: new Date().toISOString(), verified_by: actor }
          : { verified_at: null, verified_by: null },
      )
      .eq('id', attemptId)
      .select('*')
      .single();
    if (error) fail('Update verification', error);
    return data as Attempt;
  }

  async disqualifyAttempt(attemptId: string, reason: string, actor: string): Promise<Attempt> {
    const { data, error } = await client()
      .from('attempts')
      .update({
        status: 'disqualified',
        disqualified_at: new Date().toISOString(),
        disqualified_by: actor,
        disqualification_reason: reason,
      })
      .eq('id', attemptId)
      .select('*')
      .single();
    if (error) fail('Disqualify attempt', error);
    return data as Attempt;
  }

  async restoreAttempt(attemptId: string, actor: string): Promise<Attempt> {
    const current = await this.getAttempt(attemptId);
    if (!current) throw new StoreError('not_found', 'That attempt no longer exists.');
    if (current.status !== 'disqualified') {
      throw new StoreError('invalid_state', 'Only a disqualified attempt can be restored.');
    }

    // A restored attempt returns to whichever finished state its data supports; the check constraints
    // in the schema will reject any other combination.
    const restoredStatus: AttemptStatus = current.submitted_at ? 'submitted' : 'registered';
    const { data, error } = await client()
      .from('attempts')
      .update({
        status: restoredStatus,
        disqualified_at: null,
        disqualified_by: null,
        disqualification_reason: null,
      })
      .eq('id', attemptId)
      .select('*')
      .single();
    if (error) fail('Restore attempt', error);

    await this.recordAudit({
      action: 'attempt.restored',
      target_type: 'attempt',
      target_id: attemptId,
      detail: { restored_to: restoredStatus },
      actor_label: actor,
    });
    return data as Attempt;
  }

  async resetParticipant(
    participantId: string,
    reason: string,
  ): Promise<{ newAttemptId: string; invalidatedAttemptId: string | null }> {
    const { rows, error } = await callRpc<{ new_attempt_id: string; invalidated_attempt_id: string | null }>(
      'reset_participant',
      { p_participant_id: participantId, p_reason: reason },
    );
    if (error) fail('Reset participant', error);

    const row = rows[0];
    if (!row) throw new StoreError('not_found', 'That participant no longer exists.');
    return { newAttemptId: row.new_attempt_id, invalidatedAttemptId: row.invalidated_attempt_id };
  }

  /* ----- audit and abuse control ----- */

  async recordAudit(entry: AuditInput): Promise<void> {
    const { error } = await client().from('admin_audit_log').insert({
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id ?? null,
      detail: entry.detail ?? null,
      actor_label: entry.actor_label ?? 'event-admin',
    });
    if (error) fail('Write audit log', error);
  }

  async listAudit(limit: number, targetId?: string): Promise<AdminAuditEntry[]> {
    let request = client()
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (targetId) request = request.eq('target_id', targetId);

    const { data, error } = await request.returns<AdminAuditEntry[]>();
    if (error) fail('Read audit log', error);
    return data ?? [];
  }

  async recordRateEvent(action: string, ipHash: string): Promise<void> {
    const { error } = await client().from('rate_limit_events').insert({ action, ip_hash: ipHash });
    // Abuse bookkeeping must never take down the participant journey; log-and-continue is deliberate.
    if (error && error.code !== UNIQUE_VIOLATION) return;
  }

  async countRateEvents(action: string, ipHash: string, windowSeconds: number): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await client()
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('action', action)
      .eq('ip_hash', ipHash)
      .gte('created_at', since);
    if (error) return 0;
    return count ?? 0;
  }

  /* ----- exports ----- */

  async exportParticipants(): Promise<ParticipantExportRow[]> {
    const { data, error } = await client()
      .from('participants')
      .select('*, attempts(*, attempt_answers(selected_option_id))')
      .order('created_at', { ascending: true })
      .returns<
        (Participant & { attempts: (Attempt & { attempt_answers: { selected_option_id: string | null }[] })[] })[]
      >();
    if (error) fail('Export participants', error);

    return (data ?? []).map((row) => {
      const { attempts, ...participant } = row;
      const latest = [...attempts].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
      return {
        ...participant,
        attempt_id: latest?.id ?? null,
        attempt_status: latest?.status ?? null,
        correct_count: latest?.correct_count ?? null,
        questions_attempted:
          latest?.attempt_answers?.filter((answer) => answer.selected_option_id !== null).length ?? 0,
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
    const { data, error } = await client()
      .from('participants')
      .select('id, full_name')
      .order('created_at', { ascending: true })
      .returns<{ id: string; full_name: string }[]>();
    if (error) fail('Load participants for anonymisation', error);

    const rows = data ?? [];
    const pending = rows.filter((row) => row.full_name !== ANONYMISED_NAME);
    let anonymised = 0;

    // Updated one row at a time rather than in a single statement: both the email and the phone
    // carry unique indexes, so each replacement has to be distinct, and the phone column has an
    // E.164 format check the placeholder must satisfy.
    for (const [index, row] of pending.entries()) {
      const token = `${index + 1}-${row.id.slice(0, 8)}`;
      const { error: updateError } = await client()
        .from('participants')
        .update({
          full_name: ANONYMISED_NAME,
          email: `anonymised.${token}@invalid`,
          email_normalized: `anonymised.${token}@invalid`,
          phone_original: '',
          phone_e164: `+1${String(900_000_000 + index + 1)}`,
          // Company and job title are re-identifying in combination, so anonymisation clears them
          // alongside the name, email and phone.
          company_name: null,
          designation: null,
          public_leaderboard_opt_in: false,
          marketing_opt_in: false,
        })
        .eq('id', row.id);
      if (updateError) fail('Anonymise participant', updateError);
      anonymised += 1;
    }

    return { anonymised, alreadyAnonymised: rows.length - pending.length };
  }

  async countAnonymisedParticipants(): Promise<{ total: number; anonymised: number }> {
    const [total, anonymised] = await Promise.all([
      client().from('participants').select('id', { count: 'exact', head: true }),
      client().from('participants').select('id', { count: 'exact', head: true }).eq('full_name', ANONYMISED_NAME),
    ]);
    if (total.error) fail('Count participants', total.error);
    if (anonymised.error) fail('Count anonymised participants', anonymised.error);

    return { total: total.count ?? 0, anonymised: anonymised.count ?? 0 };
  }
}

/** Shared shaping so the admin table and the CSV export can never disagree about a column. */
export function toAdminAttemptRow(attempt: Attempt, participant: Participant, rank: number): AdminAttemptRow {
  return {
    rank,
    attempt_id: attempt.id,
    participant_id: participant.id,
    correct_count: attempt.correct_count ?? 0,
    elapsed_ms: attempt.elapsed_ms ?? 0,
    submitted_at: attempt.submitted_at ?? '',
    verified: attempt.verified_at != null,
    public_leaderboard_opt_in: participant.public_leaderboard_opt_in,
    full_name: participant.full_name,
    public_number: attempt.public_number,
    email: participant.email,
    phone_e164: participant.phone_e164,
    status: attempt.status,
    marketing_opt_in: participant.marketing_opt_in,
    disqualified_at: attempt.disqualified_at,
    disqualification_reason: attempt.disqualification_reason,
    verified_at: attempt.verified_at,
  };
}

/** Group submission timestamps into hourly buckets for the dashboard chart. */
export function bucketByHour(timestamps: readonly string[]): { bucket: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) continue;
    const bucket = `${parsed.toISOString().slice(0, 13)}:00:00Z`;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((left, right) => left.bucket.localeCompare(right.bucket));
}

/** Defaults used when seeding a brand-new project, kept beside the store that writes them. */
export const SEED_SETTINGS = DEFAULT_SETTINGS;
