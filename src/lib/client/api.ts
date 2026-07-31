'use client';

import type { OptionId, Pillar, QuizState } from '@/lib/config/constants';

/**
 * Typed browser-side client for the public API.
 *
 * Everything the participant journey needs goes through here, so retry policy, error shaping and
 * "are we online" live in one place rather than inside components.
 */

export type ApiError = {
  code: string;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
  status: number;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (isSuccess<T>(payload)) return { ok: true, data: payload.data };
    if (isFailure(payload)) {
      return { ok: false, error: { ...payload.error, status: response.status } };
    }

    return {
      ok: false,
      error: {
        code: 'bad_response',
        message: 'We could not read the response from the server. Please try again.',
        requestId: 'client',
        status: response.status,
      },
    };
  } catch {
    // fetch() rejects on a dropped connection, DNS failure or CORS block — all "you are offline" here.
    return {
      ok: false,
      error: {
        code: 'network_error',
        message: 'We could not reach the challenge. Check the connection and try again.',
        requestId: 'client',
        status: 0,
      },
    };
  }
}

function isSuccess<T>(value: unknown): value is { ok: true; data: T } {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true && 'data' in value;
}

function isFailure(value: unknown): value is { ok: false; error: Omit<ApiError, 'status'> } {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false && 'error' in value;
}

/* ---------------------------------------------------------------------------------------------- */
/* Response shapes                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export type RegisterResponse = {
  participant_token: string;
  questions_per_attempt: number;
  quiz_duration_seconds: number;
};

export type ChallengeQuestion = {
  question_id: string;
  display_order: number;
  question_text: string;
  options: { id: OptionId; text: string }[];
};

export type StartResponse = {
  attempt_token: string;
  started_at: string;
  deadline_at: string;
  server_now: string;
  duration_seconds: number;
  questions: ChallengeQuestion[];
  resumed: boolean;
};

export type SubmitResponse = {
  correct_count: number;
  total_questions: number;
  elapsed_ms: number;
  score_label: string;
  rank: number | null;
  timed_out: boolean;
  in_top_n: boolean;
  top_n: number;
  verified: boolean;
  spin_cta_text: string;
  result_review_seconds: number;
  /**
   * Per-question review shown on the tablet after submission. Deliberately carries no
   * `correct_option_id` and no unselected option text — see `src/lib/quiz/review.ts`.
   */
  review: {
    question_number: number;
    question_text: string;
    selected_option_text: string | null;
    answered: boolean;
    is_correct: boolean;
    principle: string;
  }[];
};

export type ResumeResponse =
  | ({ state: 'in_progress' } & Omit<StartResponse, 'attempt_token' | 'resumed'>)
  | ({ state: 'completed' } & SubmitResponse);

export type PublicLeaderboardResponse = {
  entries: {
    rank: number;
    display_name: string;
    correct_count: number;
    elapsed_ms: number;
    verified: boolean;
    score_label: string;
  }[];
  leaderboard_size: number;
  questions_per_attempt: number;
  refresh_seconds: number;
  winner_announcement_at: string;
  quiz_state: QuizState;
};

export type PublicStatsResponse = {
  total_challengers: number;
  total_completed: number;
  average_score: number | null;
  best_score: number | null;
  fastest_perfect_ms: number | null;
  toughest_pillar: Pillar | null;
  toughest_pillar_label: string | null;
  toughest_pillar_accuracy: number | null;
  questions_per_attempt: number;
  quiz_state: QuizState;
  prize_first: string;
  winner_announcement_at: string;
};

export type SubmittedAnswerPayload = {
  question_id: string;
  selected_option_id: OptionId | null;
  answered_offset_ms: number | null;
};
