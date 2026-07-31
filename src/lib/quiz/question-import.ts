import { parseCsvBoolean, parseCsvToObjects, toCsv } from '@/lib/utils/csv';
import { questionWriteSchema, type QuestionWriteInput } from '@/lib/validation/schemas';

/** The CSV contract for bulk question management. Order matters for the downloadable template. */
export const QUESTION_CSV_COLUMNS = [
  'code',
  'pillar',
  'difficulty',
  'question_text',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_option',
  'explanation',
  'active',
  'review_status',
] as const;

export type QuestionImportRowError = {
  /** 1-based row number as seen in a spreadsheet, i.e. the header is row 1. */
  row: number;
  code: string;
  errors: string[];
};

export type QuestionImportReport = {
  valid: QuestionWriteInput[];
  errors: QuestionImportRowError[];
  duplicateCodesInFile: string[];
};

/**
 * Parse and validate a question CSV.
 *
 * Nothing is written by this function. Invalid rows are reported individually with their row number so
 * an organiser can fix a spreadsheet, and an invalid row never becomes an active question.
 */
export function parseQuestionCsv(csv: string): QuestionImportReport {
  const { headers, rows } = parseCsvToObjects(csv);

  const missingColumns = QUESTION_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          code: '',
          errors: [`The file is missing required column(s): ${missingColumns.join(', ')}.`],
        },
      ],
      duplicateCodesInFile: [],
    };
  }

  const valid: QuestionWriteInput[] = [];
  const errors: QuestionImportRowError[] = [];
  const seenCodes = new Set<string>();
  const duplicateCodesInFile: string[] = [];

  rows.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for the header row, +1 because spreadsheets are 1-based.
    const code = (record.code ?? '').trim();

    // A completely blank line at the end of a spreadsheet is not an error.
    if (Object.values(record).every((value) => value === '')) return;

    const candidate = {
      code,
      pillar: (record.pillar ?? '').trim().toLowerCase(),
      difficulty: (record.difficulty ?? '').trim().toLowerCase(),
      question_text: (record.question_text ?? '').trim(),
      option_a: (record.option_a ?? '').trim(),
      option_b: (record.option_b ?? '').trim(),
      option_c: (record.option_c ?? '').trim(),
      option_d: (record.option_d ?? '').trim(),
      correct_option: (record.correct_option ?? '').trim().toLowerCase(),
      explanation: (record.explanation ?? '').trim(),
      active: parseCsvBoolean(record.active ?? '', true),
      review_status: (record.review_status ?? '').trim().toLowerCase() || 'draft',
    };

    const parsed = questionWriteSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        code,
        errors: parsed.error.issues.map((issue) =>
          issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
        ),
      });
      return;
    }

    if (seenCodes.has(parsed.data.code)) {
      duplicateCodesInFile.push(parsed.data.code);
      errors.push({
        row: rowNumber,
        code: parsed.data.code,
        errors: [`Code "${parsed.data.code}" appears more than once in this file.`],
      });
      return;
    }

    // Four identical options make a question unanswerable; catch it before an organiser publishes it.
    const optionTexts = [parsed.data.option_a, parsed.data.option_b, parsed.data.option_c, parsed.data.option_d];
    if (new Set(optionTexts.map((text) => text.toLowerCase())).size !== optionTexts.length) {
      errors.push({ row: rowNumber, code: parsed.data.code, errors: ['The four options must all be different.'] });
      return;
    }

    seenCodes.add(parsed.data.code);
    valid.push(parsed.data);
  });

  return { valid, errors, duplicateCodesInFile };
}

/** The downloadable template, pre-filled with one worked example so the format is unambiguous. */
export function questionCsvTemplate(): string {
  return toCsv(QUESTION_CSV_COLUMNS, [
    [
      'BJ-99',
      'business_judgment',
      'medium',
      'Your team proposes an AI pilot with no agreed success measure. What should you require first?',
      'A named business outcome and how it will be measured',
      'A larger pilot budget',
      'A longer pilot timeline',
      'A comparison of three vendors',
      'a',
      'Without an agreed measure a pilot cannot be judged, scaled or stopped.',
      'true',
      'draft',
    ],
  ]);
}
