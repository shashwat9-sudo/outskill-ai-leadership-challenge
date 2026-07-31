/**
 * Minimal, dependency-free CSV reader/writer.
 *
 * Written by hand rather than pulled from a package because the surface we need is tiny and the
 * failure mode we care about — a booth laptop opening the export in Excel — is mostly about quoting
 * and BOM handling, which a general parser does not solve for us anyway.
 */

/** Escape one field: quote it whenever it contains a delimiter, quote, or newline. */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Build a CSV document.
 * A UTF-8 BOM is prepended so Excel on Windows renders Indian names and the ₹ sign correctly.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Parse a CSV document into rows of raw string cells. Handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    // Ignore a trailing blank line produced by a final newline.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Parse into objects keyed by the header row, with the header names normalised to snake_case. */
export function parseCsvToObjects(input: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(input);
  const headerRow = raw[0];
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((header) => header.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = raw.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      record[header] = (cells[columnIndex] ?? '').trim();
    });
    return record;
  });

  return { headers, rows };
}

/** Accept the handful of spellings a spreadsheet will produce for a yes/no column. */
export function parseCsvBoolean(value: string, fallback: boolean): boolean {
  const normalised = value.trim().toLowerCase();
  if (normalised === '') return fallback;
  if (['true', 'yes', 'y', '1', 'active'].includes(normalised)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(normalised)) return false;
  return fallback;
}
