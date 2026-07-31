/**
 * Every tunable number in the product lives here or in `app_settings`.
 * Values here are hard defaults and hard limits; values an organiser may change at the event live in
 * `app_settings` and are seeded from the DEFAULT_SETTINGS object below.
 */

/** Visible challenge duration, in seconds. */
export const DEFAULT_QUIZ_DURATION_SECONDS = 130;

/** Questions served per attempt. */
export const DEFAULT_QUESTIONS_PER_ATTEMPT = 7;

/** Public leaderboard size. Both the public board and the TV display show the top five. */
export const DEFAULT_LEADERBOARD_SIZE = 5;

/**
 * Seconds the result and answer-review screen stays up on a kiosk tablet before it resets itself for
 * the next participant. Staff can also reset immediately with the visible "Done" button.
 */
export const DEFAULT_RESULT_AUTO_RESET_SECONDS = 40;

/** Polling interval for the public leaderboard, in seconds. */
export const DEFAULT_LEADERBOARD_REFRESH_SECONDS = 10;

/**
 * Network grace period after the visible deadline. A submission arriving inside this window is still
 * accepted and recorded as a full-duration run; anything later is timed out.
 */
export const SUBMISSION_GRACE_MS = 3_000;

/** Elapsed time recorded when a submission lands inside the grace window (i.e. the full duration). */
export const GRACE_ELAPSED_MS = DEFAULT_QUIZ_DURATION_SECONDS * 1_000;

/** Admin session cookie lifetime. */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const ADMIN_SESSION_COOKIE = 'oskl_admin_session';

/** Participant token lifetime — long enough to walk from the registration screen to the tablet. */
export const PARTICIPANT_TOKEN_TTL_SECONDS = 30 * 60;

/** Attempt token lifetime — the run plus generous slack for a slow retry over bad venue Wi-Fi. */
export const ATTEMPT_TOKEN_TTL_SECONDS = 15 * 60;

/** LED display scene rotation, in milliseconds. */
export const DISPLAY_SCENE_DURATION_MS = 11_000;

/** Remaining seconds at which the challenge timer switches to its urgency treatment. */
export const URGENT_THRESHOLD_SECONDS = 15;

/**
 * Data retention.
 *
 * Participant details are kept for seven days after the event ends and are then anonymised by an
 * administrator. Nothing expires or deletes itself: the deadline is surfaced in the admin UI and a
 * human runs the anonymisation, after the lead export, with two separate confirmations.
 */
export const RETENTION_DAYS = 7;

/** Replaces a participant's name once anonymised; also the marker for "already anonymised". */
export const ANONYMISED_NAME = 'Anonymised Participant';

/** Typed by the operator to confirm the irreversible anonymisation. */
export const ANONYMISE_CONFIRMATION = 'ANONYMISE PARTICIPANT DATA';

/** Session storage key holding an in-flight attempt so a refresh can resume it. */
export const ATTEMPT_STORAGE_KEY = 'oskl.attempt.v1';
/** Session storage key holding the participant token between registration and start. */
export const PARTICIPANT_STORAGE_KEY = 'oskl.participant.v1';
/** Local storage key holding the last result on a personal (non-kiosk) device. */
export const RESULT_STORAGE_KEY = 'oskl.result.v1';

/**
 * Abuse thresholds. Deliberately generous: ~10,000 attendees share the venue Wi-Fi, so a single
 * hashed IP legitimately produces a lot of traffic. These catch obvious automation, not busy humans.
 */
export const RATE_LIMITS = {
  /** Registrations allowed from one hashed IP in the window. */
  register: { limit: 60, windowSeconds: 5 * 60 },
  /** Attempt starts allowed from one hashed IP in the window. */
  start: { limit: 60, windowSeconds: 5 * 60 },
  /** Submissions allowed from one hashed IP in the window (retries included). */
  submit: { limit: 120, windowSeconds: 5 * 60 },
  /** Failed admin logins from one hashed IP before a lockout window. */
  adminLogin: { limit: 8, windowSeconds: 10 * 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Submit retry policy on the client, in milliseconds. */
export const SUBMIT_RETRY_DELAYS_MS = [800, 2_000, 4_500, 9_000] as const;

/** Bounds enforced when an admin edits settings, so selection and scoring can never silently break. */
export const SETTINGS_BOUNDS = {
  quizDurationSeconds: { min: 30, max: 180 },
  questionsPerAttempt: { min: 5, max: 10 },
  leaderboardSize: { min: 3, max: 50 },
  resultAutoResetSeconds: { min: 10, max: 120 },
  leaderboardRefreshSeconds: { min: 5, max: 60 },
} as const;

export const PILLARS = [
  'business_judgment',
  'responsible_ai',
  'hr_workforce',
  'work_design',
  'adoption_change',
] as const;

export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABELS: Record<Pillar, string> = {
  business_judgment: 'AI Business Judgment',
  responsible_ai: 'Responsible AI & Governance',
  hr_workforce: 'HR & Workforce Applications',
  work_design: 'Human–AI Work Design',
  adoption_change: 'AI Adoption & Change',
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const REVIEW_STATUSES = ['draft', 'reviewed', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Only these review statuses may be served to participants. */
export const SERVEABLE_REVIEW_STATUSES: readonly ReviewStatus[] = ['reviewed', 'approved'];

/** Pillars every attempt must contain at least one of. */
export const MANDATORY_PILLARS: readonly Pillar[] = ['hr_workforce', 'responsible_ai', 'business_judgment'];

/** Soft cap on questions drawn from a single pillar within one attempt. */
export const MAX_QUESTIONS_PER_PILLAR = 2;

/**
 * Difficulty blueprints per attempt size. A settings change to an unlisted size is rejected, which is
 * what keeps "2 easy / 4 medium / 1 hard" from being silently broken by a stray configuration edit.
 */
export const DIFFICULTY_BLUEPRINTS: Record<number, Record<Difficulty, number>> = {
  5: { easy: 2, medium: 2, hard: 1 },
  6: { easy: 2, medium: 3, hard: 1 },
  7: { easy: 2, medium: 4, hard: 1 },
  8: { easy: 3, medium: 4, hard: 1 },
  9: { easy: 3, medium: 5, hard: 1 },
  10: { easy: 3, medium: 5, hard: 2 },
};

export const OPTION_IDS = ['a', 'b', 'c', 'd'] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const ATTEMPT_STATUSES = [
  'registered',
  'in_progress',
  'submitted',
  'timed_out',
  'invalidated',
  'disqualified',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const QUIZ_STATES = ['active', 'paused', 'locked'] as const;
export type QuizState = (typeof QUIZ_STATES)[number];

/** Default event configuration, seeded into `app_settings` and used by the demo store. */
export const DEFAULT_SETTINGS = {
  quiz_title: 'The AI Leadership Challenge',
  hook_text: 'Can you make the right AI decisions under pressure?',
  supporting_line: '7 leadership decisions. 130 seconds. One live leaderboard.',
  event_name: 'People Matters TechHR Summit 2026',
  event_location: 'Delhi, India',
  event_start_at: '2026-08-06T09:00:00+05:30',
  event_end_at: '2026-08-07T18:00:00+05:30',
  winner_announcement_at: '2026-08-07T17:00:00+05:30',
  quiz_state: 'active' as QuizState,
  quiz_duration_seconds: DEFAULT_QUIZ_DURATION_SECONDS,
  questions_per_attempt: DEFAULT_QUESTIONS_PER_ATTEMPT,
  leaderboard_size: DEFAULT_LEADERBOARD_SIZE,
  result_auto_reset_seconds: DEFAULT_RESULT_AUTO_RESET_SECONDS,
  leaderboard_refresh_seconds: DEFAULT_LEADERBOARD_REFRESH_SECONDS,
  prize_first: 'iPad + Custom AI Session + Hamper',
  prize_second: 'Custom AI Session + Hamper',
  prize_third: 'Hamper',
  // Shown under the fixed "Show this screen to the Outskill team." line on the result screen, so it
  // should add something rather than repeat the instruction.
  spin_cta_text: 'Ask the team about your spin of the wheel.',
  qr_caption: 'Scan to take the challenge',
  privacy_contact_text: 'Speak to any Outskill team member at the booth, or use the contact address printed on your event pass.',
  privacy_notice_text: [
    'We collect your name, email address and phone number so we can run the challenge, place you on the leaderboard and verify prize winners.',
    'Your name appears on the public leaderboard only if you tick the leaderboard opt-in. Otherwise you appear as an anonymous leader.',
    'We only send follow-up resources if you tick the marketing opt-in, which is separate and optional. Giving us your email address does not on its own sign you up for anything. You can ask us to stop at any time.',
    'We do not send quiz-result emails. Your score and answer review appear on the tablet immediately after you submit, and only there.',
    'We never publish your email address or phone number. They are used to verify prize winners and, where you have opted in, to send follow-up.',
    'Your details are kept for seven days after the event, after which the Outskill team anonymises them once the lead export is complete.',
  ].join('\n\n'),
  rules_text: [
    'One entry per person. Each email address and each phone number may complete the challenge once.',
    'You have 130 seconds to answer 7 workplace AI decisions. Accuracy determines your score; speed breaks a tie.',
    'Once you select an answer you cannot return to the previous question. Unanswered questions count as incorrect.',
    'Ranking order is: more correct answers first, then a faster completion time, then an earlier submission.',
    'Entries in the top 5 must be verified in person at the Outskill desk. Bring your event badge.',
    'Your result and an answer review appear on the tablet straight after you submit. We do not email results.',
    'This is a seven-question challenge for the booth, not a scientific assessment of you or your organisation.',
    'Outskill may disqualify any entry that shows evidence of automation, impersonation or duplicate registration.',
    'The winner is the highest-ranked verified, non-disqualified entry once the Outskill team locks the challenge.',
    'The decision of the Outskill team on verification, disqualification and prize allocation is final.',
  ].join('\n\n'),
} as const;

export type DefaultSettings = typeof DEFAULT_SETTINGS;
