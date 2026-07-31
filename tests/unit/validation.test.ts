import { describe, expect, it } from 'vitest';
import {
  adminLoginSchema,
  disqualifySchema,
  registerSchema,
  settingsUpdateSchema,
  submitSchema,
} from '@/lib/validation/schemas';
import { parseCsv, parseCsvBoolean, parseCsvToObjects, toCsv } from '@/lib/utils/csv';
import { parseQuestionCsv, questionCsvTemplate } from '@/lib/quiz/question-import';
import { DEFAULT_SETTINGS } from '@/lib/config/constants';

const VALID_REGISTRATION = {
  full_name: 'Ananya Sharma',
  email: 'ananya@example.invalid',
  phone: '9876543210',
  phone_country: 'IN',
  company_name: 'Northwind Analytics',
  designation: 'Head of People',
  public_leaderboard_opt_in: false,
  marketing_opt_in: false,
  accepted_rules: true as const,
};

describe('registration schema', () => {
  it('accepts a complete registration', () => {
    expect(registerSchema.safeParse(VALID_REGISTRATION).success).toBe(true);
  });

  it('defaults both consent checkboxes to false', () => {
    const parsed = registerSchema.parse({
      full_name: 'Ananya Sharma',
      email: 'ananya@example.invalid',
      phone: '9876543210',
      company_name: 'Northwind Analytics',
      designation: 'Head of People',
      accepted_rules: true,
    });
    expect(parsed.public_leaderboard_opt_in).toBe(false);
    expect(parsed.marketing_opt_in).toBe(false);
  });

  it('requires the rules acknowledgement', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTRATION, accepted_rules: false });
    expect(result.success).toBe(false);
  });

  it('rejects a name that is too short', () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, full_name: 'A' }).success).toBe(false);
  });

  it('rejects a name made only of digits', () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, full_name: '12345' }).success).toBe(false);
  });

  it('trims whitespace around the name', () => {
    const parsed = registerSchema.parse({ ...VALID_REGISTRATION, full_name: '  Ananya Sharma  ' });
    expect(parsed.full_name).toBe('Ananya Sharma');
  });

  it('rejects an unknown country code shape', () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, phone_country: 'india' }).success).toBe(false);
  });

  describe('company and designation', () => {
    it('rejects a registration with no company at all', () => {
      const { company_name: _omitted, ...withoutCompany } = VALID_REGISTRATION;
      expect(registerSchema.safeParse(withoutCompany).success).toBe(false);
    });

    it('accepts a registration with no designation at all — it is optional', () => {
      const { designation: _omitted, ...withoutDesignation } = VALID_REGISTRATION;
      const result = registerSchema.safeParse(withoutDesignation);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.designation).toBeNull();
    });

    it('accepts an explicit null designation', () => {
      const parsed = registerSchema.parse({ ...VALID_REGISTRATION, designation: null });
      expect(parsed.designation).toBeNull();
    });

    it('rejects an empty company', () => {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: '' }).success).toBe(false);
    });

    it('normalises an empty designation to null rather than an empty string', () => {
      const parsed = registerSchema.parse({ ...VALID_REGISTRATION, designation: '' });
      expect(parsed.designation).toBeNull();
    });

    it('rejects a whitespace-only company', () => {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: '     ' }).success).toBe(false);
    });

    it('normalises a whitespace-only designation to null', () => {
      const parsed = registerSchema.parse({ ...VALID_REGISTRATION, designation: '\t \n ' });
      expect(parsed.designation).toBeNull();
    });

    it('still rejects a designation that was typed but is too short', () => {
      // Optional means "may be omitted", not "may be nonsense". One character is a typo, not a refusal.
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: 'H' }).success).toBe(false);
    });

    it('enforces the company length boundaries', () => {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: 'A' }).success).toBe(false);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: 'AB' }).success).toBe(true);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: 'A'.repeat(120) }).success).toBe(true);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: 'A'.repeat(121) }).success).toBe(false);
    });

    it('enforces the designation length boundaries when a value is supplied', () => {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: 'A' }).success).toBe(false);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: 'AB' }).success).toBe(true);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: 'A'.repeat(100) }).success).toBe(true);
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: 'A'.repeat(101) }).success).toBe(false);
    });

    it('measures length after trimming, so padding cannot smuggle an over-long value through', () => {
      const padded = `  ${'A'.repeat(120)}  `;
      const parsed = registerSchema.parse({ ...VALID_REGISTRATION, company_name: padded });
      expect(parsed.company_name).toHaveLength(120);
    });

    it('trims both fields', () => {
      const parsed = registerSchema.parse({
        ...VALID_REGISTRATION,
        company_name: '  Northwind Analytics  ',
        designation: '  Head of People  ',
      });
      expect(parsed.company_name).toBe('Northwind Analytics');
      expect(parsed.designation).toBe('Head of People');
    });

    it('accepts real-world names with punctuation, digits and non-Latin scripts', () => {
      for (const company of ["L'Oréal India", 'Tata Consultancy Services (TCS)', 'AT&T', '3M India', 'पीपल मैटर्स']) {
        expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: company }).success).toBe(true);
      }
      for (const title of ['VP, People & Culture', 'Head of L&D', 'Sr. Manager — Talent', 'सलाहकार']) {
        expect(registerSchema.safeParse({ ...VALID_REGISTRATION, designation: title }).success).toBe(true);
      }
    });

    it('rejects a company made only of punctuation', () => {
      expect(registerSchema.safeParse({ ...VALID_REGISTRATION, company_name: '---' }).success).toBe(false);
    });
  });
});

describe('submit schema', () => {
  const token = 'a'.repeat(40);
  const questionId = '00000000-0000-4000-8000-000000000001';

  it('accepts a normal submission', () => {
    const result = submitSchema.safeParse({
      attempt_token: token,
      answers: [{ question_id: questionId, selected_option_id: 'a', answered_offset_ms: 1200 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null selection for an unanswered question', () => {
    const result = submitSchema.safeParse({
      attempt_token: token,
      answers: [{ question_id: questionId, selected_option_id: null, answered_offset_ms: null }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an option id outside a–d', () => {
    const result = submitSchema.safeParse({
      attempt_token: token,
      answers: [{ question_id: questionId, selected_option_id: 'e', answered_offset_ms: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized answer array', () => {
    const answers = Array.from({ length: 25 }, () => ({
      question_id: questionId,
      selected_option_id: 'a' as const,
      answered_offset_ms: 0,
    }));
    expect(submitSchema.safeParse({ attempt_token: token, answers }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    const result = submitSchema.safeParse({
      attempt_token: token,
      answers: [{ question_id: questionId, selected_option_id: 'a', answered_offset_ms: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('carries no score, rank or timing field the client could set', () => {
    const parsed = submitSchema.parse({ attempt_token: token, answers: [] });
    expect(Object.keys(parsed).sort()).toEqual(['answers', 'attempt_token']);
  });
});

describe('settings schema', () => {
  const base = {
    ...DEFAULT_SETTINGS,
    quiz_state: undefined,
  };
  const { quiz_state: _ignored, ...valid } = base;

  it('accepts the seeded defaults', () => {
    expect(settingsUpdateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a question count with no defined difficulty blueprint', () => {
    const result = settingsUpdateSchema.safeParse({ ...valid, questions_per_attempt: 4 });
    expect(result.success).toBe(false);
  });

  it('accepts every supported question count', () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      expect(settingsUpdateSchema.safeParse({ ...valid, questions_per_attempt: count }).success).toBe(true);
    }
  });

  it('rejects a duration outside the supported range', () => {
    expect(settingsUpdateSchema.safeParse({ ...valid, quiz_duration_seconds: 5 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ ...valid, quiz_duration_seconds: 600 }).success).toBe(false);
  });

  it('rejects an event that ends before it starts', () => {
    const result = settingsUpdateSchema.safeParse({
      ...valid,
      event_start_at: '2026-08-07T09:00:00+05:30',
      event_end_at: '2026-08-06T09:00:00+05:30',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a winner announcement before the event starts', () => {
    const result = settingsUpdateSchema.safeParse({
      ...valid,
      winner_announcement_at: '2026-08-01T09:00:00+05:30',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty prize description', () => {
    expect(settingsUpdateSchema.safeParse({ ...valid, prize_first: '' }).success).toBe(false);
  });
});

describe('admin schemas', () => {
  it('requires both a username and a password', () => {
    expect(adminLoginSchema.safeParse({ username: 'outskill-admin', password: '' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ username: '', password: 'something' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ password: 'something' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ username: 'outskill-admin' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ username: 'outskill-admin', password: 'something' }).success).toBe(true);
  });

  it('requires a meaningful disqualification reason', () => {
    const attemptId = '00000000-0000-4000-8000-000000000001';
    expect(disqualifySchema.safeParse({ attempt_id: attemptId, reason: 'no' }).success).toBe(false);
    expect(disqualifySchema.safeParse({ attempt_id: attemptId, reason: 'Duplicate entry' }).success).toBe(true);
  });
});

describe('CSV writer and reader', () => {
  it('quotes fields containing commas, quotes and newlines', () => {
    const csv = toCsv(['a', 'b'], [['plain', 'has,comma'], ['has"quote', 'has\nnewline']]);
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has""quote"');
    expect(csv).toContain('"has\nnewline"');
  });

  it('starts with a BOM so Excel renders non-ASCII names correctly', () => {
    expect(toCsv(['name'], [['अनन्या']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('round-trips through the parser', () => {
    const csv = toCsv(['name', 'note'], [['Ananya, S', 'said "hello"']]);
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(['Ananya, S', 'said "hello"']);
  });

  it('normalises header names to snake_case', () => {
    const { headers } = parseCsvToObjects('Question Text,Correct Option\nhello,a\n');
    expect(headers).toEqual(['question_text', 'correct_option']);
  });

  it('interprets the spellings a spreadsheet produces for booleans', () => {
    expect(parseCsvBoolean('TRUE', false)).toBe(true);
    expect(parseCsvBoolean('yes', false)).toBe(true);
    expect(parseCsvBoolean('0', true)).toBe(false);
    expect(parseCsvBoolean('', true)).toBe(true);
    expect(parseCsvBoolean('maybe', false)).toBe(false);
  });
});

describe('question CSV import', () => {
  it('accepts the downloadable template', () => {
    const report = parseQuestionCsv(questionCsvTemplate());
    expect(report.errors).toEqual([]);
    expect(report.valid).toHaveLength(1);
  });

  it('reports a missing column instead of importing rubbish', () => {
    const report = parseQuestionCsv('code,pillar\nBJ-1,business_judgment\n');
    expect(report.valid).toHaveLength(0);
    expect(report.errors[0]?.errors[0]).toContain('missing required column');
  });

  it('reports the spreadsheet row number for an invalid row', () => {
    const csv = questionCsvTemplate().replace('medium', 'impossible');
    const report = parseQuestionCsv(csv);
    expect(report.errors[0]?.row).toBe(2);
    expect(report.valid).toHaveLength(0);
  });

  it('rejects a duplicate code within the same file', () => {
    const template = questionCsvTemplate();
    const dataRow = template.trimEnd().split('\r\n')[1] ?? '';
    const report = parseQuestionCsv(`${template}${dataRow}\r\n`);
    expect(report.duplicateCodesInFile).toContain('BJ-99');
    expect(report.valid).toHaveLength(1);
  });

  it('rejects a row where two options are identical', () => {
    const csv = questionCsvTemplate().replace('A larger pilot budget', 'A comparison of three vendors');
    const report = parseQuestionCsv(csv);
    expect(report.valid).toHaveLength(0);
    expect(report.errors[0]?.errors[0]).toContain('must all be different');
  });

  it('imports valid rows even when other rows are rejected', () => {
    const template = questionCsvTemplate();
    const header = template.trimEnd().split('\r\n')[0] ?? '';
    const goodRow = template.trimEnd().split('\r\n')[1] ?? '';
    const badRow = goodRow.replace('BJ-99', 'BJ-98').replace('medium', 'nonsense');

    const report = parseQuestionCsv(`${header}\r\n${goodRow}\r\n${badRow}\r\n`);
    expect(report.valid).toHaveLength(1);
    expect(report.errors).toHaveLength(1);
  });

  it('ignores a trailing blank line', () => {
    const report = parseQuestionCsv(`${questionCsvTemplate()}\r\n`);
    expect(report.errors).toEqual([]);
  });
});
