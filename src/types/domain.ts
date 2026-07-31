import type {
  AttemptStatus,
  Difficulty,
  OptionId,
  Pillar,
  QuizState,
  ReviewStatus,
} from '@/lib/config/constants';

export type QuestionOption = {
  id: OptionId;
  text: string;
};

/** Full question record. Only ever exists server-side or in the admin UI. */
export type Question = {
  id: string;
  code: string;
  pillar: Pillar;
  difficulty: Difficulty;
  question_text: string;
  options: QuestionOption[];
  correct_option_id: OptionId;
  explanation: string;
  active: boolean;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

/** The safe shape sent to a participant's browser: no correct answer, no explanation. */
export type ParticipantQuestion = {
  question_id: string;
  display_order: number;
  question_text: string;
  options: QuestionOption[];
};

export type Participant = {
  id: string;
  full_name: string;
  email: string;
  email_normalized: string;
  phone_original: string;
  phone_e164: string;
  /**
   * Lead fields, captured for Outskill's event follow-up and never shown publicly.
   *
   * Nullable because production holds registrations taken before these fields existed. Every new
   * registration requires both — enforced by `registerSchema` and again by `register_participant_v2`.
   */
  company_name: string | null;
  designation: string | null;
  public_leaderboard_opt_in: boolean;
  marketing_opt_in: boolean;
  accepted_rules_at: string;
  created_at: string;
  updated_at: string;
};

export type Attempt = {
  id: string;
  participant_id: string;
  status: AttemptStatus;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  correct_count: number | null;
  elapsed_ms: number | null;
  verified_at: string | null;
  verified_by: string | null;
  disqualified_at: string | null;
  disqualified_by: string | null;
  disqualification_reason: string | null;
  invalidated_at: string | null;
  replacement_for_attempt_id: string | null;
  public_number: number;
  created_at: string;
  updated_at: string;
};

export type AttemptQuestion = {
  attempt_id: string;
  question_id: string;
  display_order: number;
  option_order: OptionId[];
  created_at: string;
};

export type AttemptAnswer = {
  attempt_id: string;
  question_id: string;
  selected_option_id: OptionId | null;
  answered_offset_ms: number | null;
  is_correct: boolean;
  created_at: string;
};

export type AppSettings = {
  id: string;
  quiz_title: string;
  hook_text: string;
  supporting_line: string;
  event_name: string;
  event_location: string;
  event_start_at: string;
  event_end_at: string;
  winner_announcement_at: string;
  quiz_state: QuizState;
  quiz_duration_seconds: number;
  questions_per_attempt: number;
  leaderboard_size: number;
  result_auto_reset_seconds: number;
  leaderboard_refresh_seconds: number;
  prize_first: string;
  prize_second: string;
  prize_third: string;
  spin_cta_text: string;
  qr_caption: string;
  privacy_contact_text: string;
  privacy_notice_text: string;
  rules_text: string;
  updated_at: string;
};

/** Settings fields an admin may change. Everything else is derived or immutable. */
export type EditableSettings = Omit<AppSettings, 'id' | 'updated_at'>;

/** One ranked row, as produced by the authoritative SQL ranking. */
export type LeaderboardRow = {
  rank: number;
  attempt_id: string;
  participant_id: string;
  correct_count: number;
  elapsed_ms: number;
  submitted_at: string;
  verified: boolean;
  public_leaderboard_opt_in: boolean;
  full_name: string;
  public_number: number;
};

/** The public projection of a leaderboard row: masked name only, never any contact detail. */
export type PublicLeaderboardEntry = {
  rank: number;
  display_name: string;
  correct_count: number;
  elapsed_ms: number;
  verified: boolean;
  score_label: string;
};

export type EventStats = {
  total_challengers: number;
  total_completed: number;
  average_score: number | null;
  best_score: number | null;
  fastest_perfect_ms: number | null;
  toughest_pillar: Pillar | null;
  toughest_pillar_accuracy: number | null;
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  actor_label: string;
  created_at: string;
};

export type AdminAttemptRow = LeaderboardRow & {
  email: string;
  phone_e164: string;
  status: AttemptStatus;
  marketing_opt_in: boolean;
  disqualified_at: string | null;
  disqualification_reason: string | null;
  verified_at: string | null;
};

export type AdminParticipantRow = {
  participant: Participant;
  latest_attempt: Attempt | null;
  rank: number | null;
};

export type DashboardMetrics = {
  quiz_state: QuizState;
  total_registrations: number;
  total_completed: number;
  completion_rate: number;
  average_score: number | null;
  perfect_scores: number;
  verified_top_entries: number;
  pending_top_verifications: number;
  attempts_over_time: { bucket: string; count: number }[];
  recent_submissions: { attempt_id: string; correct_count: number; elapsed_ms: number; submitted_at: string; display_name: string }[];
  provisional_winner: LeaderboardRow | null;
  verified_winner: LeaderboardRow | null;
};
