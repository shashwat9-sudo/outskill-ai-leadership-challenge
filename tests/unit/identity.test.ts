import { describe, expect, it } from 'vitest';
import {
  buildPublicName,
  isValidEmail,
  isValidName,
  normaliseEmail,
  normaliseName,
  normalisePhone,
} from '@/lib/utils/identity';

describe('email normalisation', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  Ananya.Sharma@Company.COM ')).toBe('ananya.sharma@company.com');
  });

  it('does not strip dots or plus tags, so two real people are never merged', () => {
    expect(normaliseEmail('a.b+techhr@company.com')).toBe('a.b+techhr@company.com');
  });

  it('makes duplicate detection case-insensitive', () => {
    expect(normaliseEmail('ROHIT@x.com')).toBe(normaliseEmail('rohit@x.com'));
  });

  it.each([
    'ananya@company.com',
    'a.b+tag@sub.domain.co.in',
    "o'brien@company.io",
  ])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    '',
    'no-at-sign.com',
    'two@@at.com',
    'trailing@dot.',
    'spaced address@company.com',
    'a@b',
    'double@dots..com',
  ])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('name validation', () => {
  it('accepts a normal name', () => {
    expect(isValidName('Ananya Sharma')).toBe(true);
  });

  it('accepts non-Latin scripts', () => {
    expect(isValidName('अनन्या शर्मा')).toBe(true);
  });

  it('rejects a name that is too short', () => {
    expect(isValidName('A')).toBe(false);
  });

  it('rejects a name that is too long', () => {
    expect(isValidName('a'.repeat(81))).toBe(false);
  });

  it('rejects digits and symbols alone', () => {
    expect(isValidName('12345')).toBe(false);
  });

  it('collapses internal whitespace', () => {
    expect(normaliseName('  Ananya   Sharma ')).toBe('Ananya Sharma');
  });
});

describe('phone normalisation', () => {
  it('normalises an Indian mobile typed without a country code', () => {
    const result = normalisePhone('98765 43210', 'IN');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+919876543210');
  });

  it('accepts the same number written several ways and produces one E.164 value', () => {
    const variants = ['9876543210', '098765 43210', '+91 98765 43210', '+91-98765-43210'];
    const normalised = variants.map((value) => {
      const result = normalisePhone(value, 'IN');
      return result.ok ? result.e164 : 'invalid';
    });
    expect(new Set(normalised).size).toBe(1);
    expect(normalised[0]).toBe('+919876543210');
  });

  it('accepts an international number when it carries its own prefix', () => {
    const result = normalisePhone('+971 50 123 4567', 'IN');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+971501234567');
  });

  it('uses the supplied default country for a local number', () => {
    const result = normalisePhone('7911 123456', 'GB');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+447911123456');
  });

  it.each(['', '   ', '123', 'not a phone', '+9199'])('rejects %s', (value) => {
    expect(normalisePhone(value, 'IN').ok).toBe(false);
  });
});

describe('public name masking', () => {
  it('shows first name and surname initial when the participant opted in', () => {
    expect(buildPublicName('Ananya Sharma', true, 184)).toBe('Ananya S.');
  });

  it('uses the final part as the surname for multi-part names', () => {
    expect(buildPublicName('Siddharth Vikram Rao', true, 12)).toBe('Siddharth R.');
  });

  it('handles a single-word name without inventing an initial', () => {
    expect(buildPublicName('Madonna', true, 12)).toBe('Madonna');
  });

  it('never reveals a full surname', () => {
    expect(buildPublicName('Ananya Sharma', true, 184)).not.toContain('Sharma');
  });

  it('falls back to an anonymous label when the participant did not opt in', () => {
    expect(buildPublicName('Ananya Sharma', false, 184)).toBe('Anonymous Leader 184');
  });

  it('does not leak any part of the name when opted out', () => {
    const masked = buildPublicName('Ananya Sharma', false, 184);
    expect(masked).not.toContain('Ananya');
    expect(masked).not.toContain('Sharma');
  });

  it('distinguishes two anonymous entries by their public number', () => {
    expect(buildPublicName('A B', false, 101)).not.toBe(buildPublicName('C D', false, 102));
  });

  it('upper-cases the initial regardless of how the name was typed', () => {
    expect(buildPublicName('rohit menon', true, 3)).toBe('rohit M.');
  });
});
