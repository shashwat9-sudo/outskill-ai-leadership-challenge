import { z } from 'zod';
import {
  ATTEMPT_STATUSES,
  DIFFICULTIES,
  DIFFICULTY_BLUEPRINTS,
  OPTION_IDS,
  PILLARS,
  QUIZ_STATES,
  REVIEW_STATUSES,
  SETTINGS_BOUNDS,
} from '@/lib/config/constants';
import { NAME_MAX_LENGTH } from '@/lib/utils/identity';

/**
 * Every request body and query string is parsed here before it reaches any business logic.
 * Zod messages are written for a visitor at a booth, not for a developer reading a stack trace.
 */

export const registerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Please enter your full name.')
    .max(NAME_MAX_LENGTH, 'That name is too long.')
    .refine((value) => /\p{L}/u.test(value), 'Please enter your full name.'),
  email: z.string().trim().min(6, 'Please enter your email address.').max(254, 'That email address is too long.'),
  phone: z.string().trim().min(4, 'Please enter your phone number.').max(32, 'That phone number is too long.'),
  phone_country: z
    .string()
    .trim()
    .length(2, 'Select a country.')
    .regex(/^[A-Z]{2}$/, 'Select a country.')
    .optional(),
  public_leaderboard_opt_in: z.boolean().default(false),
  marketing_opt_in: z.boolean().default(false),
  accepted_rules: z.literal(true, { message: 'Please accept the challenge rules and privacy notice.' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const startSchema = z.object({
  participant_token: z.string().min(10, 'Your session expired. Please register again.'),
});

export const answerSchema = z.object({
  question_id: z.string().uuid(),
  selected_option_id: z.enum(OPTION_IDS).nullable(),
  answered_offset_ms: z.number().int().min(0).max(10 * 60 * 1000).nullable(),
});

export const submitSchema = z.object({
  attempt_token: z.string().min(10),
  answers: z.array(answerSchema).max(20),
  /**
   * Client-side idempotency key. Two identical retries over flaky venue Wi-Fi must not create two
   * attempts; the server also enforces this from the attempt row, this is belt and braces.
   */
  client_submission_id: z.string().uuid().optional(),
});

export const resumeSchema = z.object({
  attempt_token: z.string().min(10),
});

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/* ---------------------------------------------------------------------------------------------- */
/* Admin                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Enter the admin username.').max(200),
  password: z.string().min(1, 'Enter the admin password.').max(200),
});

/**
 * Anonymisation is irreversible, so it asks for two independent things: the shared admin password
 * again, and an exactly-typed confirmation phrase.
 */
export const anonymiseSchema = z.object({
  password: z.string().min(1, 'Enter the admin password to confirm.').max(200),
  confirmation: z.string().min(1, 'Type the confirmation phrase.').max(200),
});

export const quizStateSchema = z.object({
  quiz_state: z.enum(QUIZ_STATES),
  /** Locking and unlocking are dangerous, so the UI must echo back an explicit confirmation phrase. */
  confirmation: z.string().optional(),
});

const isoDateTime = z.string().min(4).refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date and time.');

export const settingsUpdateSchema = z
  .object({
    quiz_title: z.string().trim().min(3).max(120),
    hook_text: z.string().trim().min(3).max(200),
    supporting_line: z.string().trim().min(3).max(200),
    event_name: z.string().trim().min(3).max(160),
    event_location: z.string().trim().min(2).max(160),
    event_start_at: isoDateTime,
    event_end_at: isoDateTime,
    winner_announcement_at: isoDateTime,
    quiz_duration_seconds: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.quizDurationSeconds.min)
      .max(SETTINGS_BOUNDS.quizDurationSeconds.max),
    questions_per_attempt: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.questionsPerAttempt.min)
      .max(SETTINGS_BOUNDS.questionsPerAttempt.max)
      .refine(
        (value) => Object.prototype.hasOwnProperty.call(DIFFICULTY_BLUEPRINTS, value),
        `Only these question counts have a defined difficulty mix: ${Object.keys(DIFFICULTY_BLUEPRINTS).join(', ')}.`,
      ),
    leaderboard_size: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.leaderboardSize.min)
      .max(SETTINGS_BOUNDS.leaderboardSize.max),
    result_auto_reset_seconds: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.resultAutoResetSeconds.min)
      .max(SETTINGS_BOUNDS.resultAutoResetSeconds.max),
    leaderboard_refresh_seconds: z
      .number()
      .int()
      .min(SETTINGS_BOUNDS.leaderboardRefreshSeconds.min)
      .max(SETTINGS_BOUNDS.leaderboardRefreshSeconds.max),
    prize_first: z.string().trim().min(1).max(200),
    prize_second: z.string().trim().min(1).max(200),
    prize_third: z.string().trim().min(1).max(200),
    spin_cta_text: z.string().trim().min(3).max(200),
    qr_caption: z.string().trim().min(3).max(120),
    privacy_contact_text: z.string().trim().min(3).max(500),
    privacy_notice_text: z.string().trim().min(20).max(6000),
    rules_text: z.string().trim().min(20).max(6000),
  })
  .refine(
    (value) => Date.parse(value.event_end_at) > Date.parse(value.event_start_at),
    { message: 'The event end time must be after the start time.', path: ['event_end_at'] },
  )
  .refine(
    (value) => Date.parse(value.winner_announcement_at) >= Date.parse(value.event_start_at),
    { message: 'The winner announcement cannot be before the event starts.', path: ['winner_announcement_at'] },
  );

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const attemptActionSchema = z.object({
  attempt_id: z.string().uuid(),
});

export const disqualifySchema = z.object({
  attempt_id: z.string().uuid(),
  reason: z.string().trim().min(5, 'Enter a reason of at least 5 characters.').max(500),
});

export const participantResetSchema = z.object({
  participant_id: z.string().uuid(),
  reason: z.string().trim().min(5, 'Enter a reason of at least 5 characters.').max(500),
});

export const participantSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const attemptSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(ATTEMPT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const optionTextSchema = z.string().trim().min(1, 'Every option needs text.').max(160, 'Keep options short.');

export const questionWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens and underscores only.'),
  pillar: z.enum(PILLARS),
  difficulty: z.enum(DIFFICULTIES),
  question_text: z.string().trim().min(10, 'The question is too short.').max(400),
  option_a: optionTextSchema,
  option_b: optionTextSchema,
  option_c: optionTextSchema,
  option_d: optionTextSchema,
  correct_option: z.enum(OPTION_IDS),
  explanation: z.string().trim().min(10, 'Add a short explanation for admins.').max(600),
  active: z.boolean(),
  review_status: z.enum(REVIEW_STATUSES),
});

export type QuestionWriteInput = z.infer<typeof questionWriteSchema>;

export const questionFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  pillar: z.enum(PILLARS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  active: z.enum(['true', 'false']).optional(),
  review_status: z.enum(REVIEW_STATUSES).optional(),
});

export const questionImportSchema = z.object({
  csv: z.string().min(10, 'Paste or upload a CSV file first.').max(1_000_000),
  /** When false the import is parsed and reported on, but nothing is written. */
  commit: z.boolean().default(false),
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
