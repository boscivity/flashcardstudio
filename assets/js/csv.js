// CSV parsing/writing and "term - definition" bulk text parsing.

export function parseCsv(text, delimiter = ',') {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const escapeCell = value => {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = rows => rows.map(r => r.map(escapeCell).join(',')).join('\r\n');

/**
 * Turns a CSV/TSV file into { columns, rows } where rows are objects keyed by column.
 * Like earlier versions (and our own exports), the first row is the header when it has
 * short, unique, non-empty names; otherwise columns default to Term / Definition / Hint.
 */
export function parseTable(text) {
  const firstLine = String(text).replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = parseCsv(text, delimiter);
  if (!rows.length) throw new Error('That file is empty.');
  const width = Math.max(...rows.map(r => r.length));
  const header = rows[0].map(c => c.trim());
  const looksLikeHeader = rows.length > 1 && header.length === width && header.every(h => h && h.length <= 40) &&
    new Set(header).size === header.length;
  const columns = looksLikeHeader
    ? header
    : Array.from({ length: width }, (_, i) => ['Term', 'Definition', 'Hint'][i] || `Field ${i + 1}`);
  const body = looksLikeHeader ? rows.slice(1) : rows;
  return {
    columns,
    rows: body.map(r => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])))
  };
}

const SEPARATORS = [
  ['\t', /\t/],
  [' | ', /\s*\|\s*/],
  [' — ', /\s+[—–]\s+/],
  [' - ', /\s+-\s+/],
  [': ', /:\s+/],
  [' = ', /\s*=\s*/],
  [', ', /,\s*/]
];

/** Detects the term/definition separator used in pasted text. */
export function detectSeparator(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return SEPARATORS[0];
  let best = null, bestScore = 0;
  for (const sep of SEPARATORS) {
    const score = lines.filter(l => sep[1].test(l)).length / lines.length;
    if (score > bestScore + 0.001) { best = sep; bestScore = score; }
    if (score === 1) break;
  }
  return best || SEPARATORS[0];
}

/** Parses "term<sep>definition" lines. Returns { pairs, skipped, separator }. */
export function parsePairs(text, separator) {
  const sep = separator || detectSeparator(text);
  const pairs = [];
  let skipped = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = sep[1].exec(line);
    if (!m) { skipped++; continue; }
    const term = line.slice(0, m.index).trim();
    const definition = line.slice(m.index + m[0].length).trim();
    if (!term || !definition) { skipped++; continue; }
    pairs.push([term, definition]);
  }
  return { pairs, skipped, separator: sep[0] };
}
