/**
 * Date and duration formatting.
 *
 * Everything an organiser reads is rendered in the event timezone (Asia/Kolkata by default), not the
 * viewer's. A booth laptop set to another timezone must not show a different Day 2 cut-off.
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function timezone(): string {
  return process.env.EVENT_TIMEZONE?.trim() || process.env.NEXT_PUBLIC_EVENT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

/**
 * "2026-08-06 17:04:33" in the event timezone — the format used in CSV exports.
 *
 * Sortable rather than pretty, because these columns are read in Excel next to the UTC ones. Returns
 * an empty string for a missing timestamp so a spreadsheet cell stays blank instead of saying "—".
 */
export function formatExportTimestamp(iso: string | null | undefined, tz: string = timezone()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** "6 August 2026, 5:00 pm" */
export function formatEventDateTime(iso: string, tz: string = timezone()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(date);
}

/** "6 August 2026" */
export function formatEventDay(iso: string, tz: string = timezone()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(date);
}

/** "5:04 pm" — used in dense admin tables where the date is implied by context. */
export function formatEventTime(iso: string, tz: string = timezone()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(date);
}

/** "6 Aug, 5:04 pm" */
export function formatShortDateTime(iso: string, tz: string = timezone()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(date);
}

/** Convert an ISO timestamp to the `datetime-local` input format, in the event timezone. */
export function toDateTimeLocalValue(iso: string, tz: string = timezone()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

/**
 * Turn a `datetime-local` value back into an ISO instant, interpreting it in the event timezone.
 * Without this, an organiser in Delhi editing "17:00" on a laptop set to UTC would store 22:30 IST.
 */
export function fromDateTimeLocalValue(value: string, tz: string = timezone()): string {
  if (!value) return '';
  const naive = new Date(`${value}:00Z`);
  if (Number.isNaN(naive.getTime())) return '';

  // Measure the zone's offset at that moment, then shift the naive instant by it.
  const zoned = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = zoned.getTime() - utc.getTime();

  return new Date(naive.getTime() - offsetMs).toISOString();
}
