import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js';

/** Booth default. International numbers are still accepted when typed with a + prefix. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IN';

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;

/**
 * Canonical email form used for duplicate detection and storage.
 * Lower-cased and trimmed only — we deliberately do NOT strip dots or +tags, because two people at the
 * same company can legitimately differ by a tag and wrongly merging them would lose a lead.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Pragmatic email shape check. Real validation is "can we reach them", which we cannot do at a booth. */
export function isValidEmail(raw: string): boolean {
  const value = normaliseEmail(raw);
  if (value.length < 6 || value.length > 254) return false;
  if (value.includes(' ')) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value);
}

export type PhoneNormalisationResult =
  | { ok: true; e164: string; country: string | undefined }
  | { ok: false; reason: 'empty' | 'unparseable' | 'invalid' };

/**
 * Normalise a typed phone number to E.164 (e.g. "+919812345678").
 * Numbers without a country prefix are interpreted using `defaultCountry` (India at this event).
 */
export function normalisePhone(raw: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): PhoneNormalisationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed) return { ok: false, reason: 'unparseable' };
  if (!parsed.isValid()) return { ok: false, reason: 'invalid' };

  return { ok: true, e164: parsed.number, country: parsed.country };
}

export function isValidName(raw: string): boolean {
  const value = raw.trim();
  if (value.length < NAME_MIN_LENGTH || value.length > NAME_MAX_LENGTH) return false;
  // Must contain at least one letter from any script; digits/symbols alone are not a name.
  return /\p{L}/u.test(value);
}

/** Collapse internal whitespace so "  Ananya   Sharma " stores as "Ananya Sharma". */
export function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Build the name shown publicly.
 *
 * Opted in  -> first name plus surname initial, e.g. "Ananya S."
 * Opted out -> "Anonymous Leader <n>", where n is the attempt's non-sensitive public number.
 *
 * A full surname, an email address or a database id must never appear in the returned string.
 */
export function buildPublicName(fullName: string, optedIn: boolean, publicNumber: number): string {
  if (!optedIn) return `Anonymous Leader ${publicNumber}`;

  const parts = normaliseName(fullName).split(' ').filter(Boolean);
  const first = parts[0];
  if (!first) return `Anonymous Leader ${publicNumber}`;

  const surname = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!surname) return first;

  const initial = [...surname][0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}
