/**
 * Structured server logging.
 *
 * This is the only sanctioned way to write to stdout. It exists so that one rule can be enforced in
 * one place: **no personal data ever reaches the logs.** Names, email addresses, phone numbers,
 * submitted answers, raw IP addresses and secrets must never be passed in. Identify people by their
 * UUID, which is meaningless without database access.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Event names used across the app, so log searches are predictable on event day. */
export type LogEvent =
  | 'registration.accepted'
  | 'registration.blocked_duplicate'
  | 'registration.blocked_locked'
  | 'registration.rate_limited'
  | 'attempt.started'
  | 'attempt.resumed'
  | 'attempt.submitted'
  | 'attempt.timed_out'
  | 'attempt.duplicate_submit'
  | 'attempt.verified'
  | 'attempt.verification_removed'
  | 'attempt.disqualified'
  | 'attempt.restored'
  | 'participant.reset'
  | 'quiz.started'
  | 'quiz.paused'
  | 'quiz.locked'
  | 'quiz.unlocked'
  | 'settings.updated'
  | 'question.created'
  | 'question.updated'
  | 'question.archived'
  | 'questions.imported'
  | 'csv.exported'
  | 'participants.anonymised'
  | 'retention.anonymise_rejected'
  | 'admin.login_succeeded'
  | 'admin.login_failed'
  | 'admin.logout'
  | 'admin.rate_limited'
  | 'api.error'
  | 'store.unavailable';

/** Keys that must never appear in a log line, guarded at runtime as well as by convention. */
const FORBIDDEN_KEYS = new Set([
  'name',
  'fullname',
  'full_name',
  'email',
  'email_normalized',
  'phone',
  'phone_e164',
  'phone_original',
  'password',
  'answers',
  'selected_option_id',
  'correct_option_id',
  'ip',
  'ipaddress',
  'ip_address',
  'token',
  'secret',
  'authorization',
  'cookie',
]);

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function sanitise(fields: LogFields): LogFields {
  const clean: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      clean[key] = '[redacted]';
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

function emit(level: LogLevel, event: LogEvent, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitise(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug(event: LogEvent, fields: LogFields = {}): void {
    if (process.env.NODE_ENV === 'production') return;
    emit('debug', event, fields);
  },
  info(event: LogEvent, fields: LogFields = {}): void {
    emit('info', event, fields);
  },
  warn(event: LogEvent, fields: LogFields = {}): void {
    emit('warn', event, fields);
  },
  error(event: LogEvent, fields: LogFields = {}): void {
    emit('error', event, fields);
  },
};

/** Short correlation id surfaced to visitors on error screens so staff can find the log line. */
export function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
