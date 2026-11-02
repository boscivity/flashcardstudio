// Typed-answer grading: forgiving about case, accents, punctuation, articles and
// small typos, and aware of alternatives ("color / colour", "(to) run").

export function normalize(text, { accents = false } = {}) {
  let t = String(text ?? '').normalize('NFKC').toLowerCase();
  if (!accents) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
  t = t.replace(/[‘’`´]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/[\-‐‑–—_\\]/g, ' ')
    .replace(/[.,!?;:"'()[\]{}…¡¿*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/^(the|a|an|to) (?=\S)/, '');
}

// All acceptable spellings of the expected answer.
export function variants(expected) {
  const base = String(expected ?? '').trim();
  const out = new Set([base]);
  const parts = base.length <= 80 ? base.split(/\s*(?:;|\s\/\s|\/|\s+or\s+|\|)\s*/i) : [];
  if (parts.length > 1) parts.filter(Boolean).forEach(p => out.add(p));
  for (const v of [...out]) {
    if (/\(.*\)/.test(v)) {
      out.add(v.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
      out.add(v.replace(/[()]/g, ''));
    }
  }
  return [...out].filter(Boolean);
}

// Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps).
export function editDistance(a, b, limit = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const n = a.length, m = b.length;
  let prev2 = new Array(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

const tolerance = len => len <= 3 ? 0 : len <= 7 ? 1 : len <= 14 ? 2 : Math.min(6, Math.round(len * 0.15));

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'and', 'or', 'is', 'are', 'for', 'on', 'by', 'with', 'that', 'it', 'as', 'at', 'be']);
const keywords = s => s.split(' ').filter(w => w.length > 1 && !STOP.has(w));

/**
 * Grades a typed answer.
 * Returns { verdict: 'correct' | 'close' | 'wrong' | 'empty', distance }.
 */
export function gradeAnswer(input, expected, { accents = false } = {}) {
  const typed = normalize(input, { accents });
  if (!typed) return { verdict: 'empty', distance: Infinity };
  let best = Infinity;
  for (const v of variants(expected)) {
    const target = normalize(v, { accents });
    if (!target) continue;
    if (typed === target || typed.replace(/ /g, '') === target.replace(/ /g, '')) return { verdict: 'correct', distance: 0 };
    const tol = tolerance(target.length);
    const d = editDistance(typed.slice(0, 400), target.slice(0, 400), tol);
    if (d <= tol) best = Math.min(best, d);
    // Long answers: accept when nearly all key words are present.
    const want = keywords(target);
    if (want.length >= 4) {
      const have = new Set(keywords(typed));
      const hit = want.filter(w => have.has(w) || [...have].some(h => h.length > 3 && editDistance(h, w, 1) <= 1)).length;
      if (hit / want.length >= 0.85) best = Math.min(best, 1);
    }
  }
  return Number.isFinite(best) ? { verdict: 'close', distance: best } : { verdict: 'wrong', distance: Infinity };
}

/**
 * Character diff of `typed` against `expected` for display.
 * Returns [{ type: 'same' | 'extra' | 'missing', text }]; null when too long to be useful.
 */
export function diffChars(typed, expected) {
  const a = String(typed), b = String(expected);
  if (!a || a.length > 140 || b.length > 140) return null;
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const eq = (x, y) => x.toLowerCase() === y.toLowerCase();
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (type, ch) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += ch; else out.push({ type, text: ch });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { push('same', b[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('extra', a[i++]);
    else push('missing', b[j++]);
  }
  while (i < n) push('extra', a[i++]);
  while (j < m) push('missing', b[j++]);
  return out;
}

// Progressive hint: reveals the first `level` letters of each word.
export function hintMask(answer, level) {
  return String(answer).replace(/\p{L}[\p{L}\p{M}']*|\p{N}+/gu, word =>
    word.slice(0, level) + word.slice(level).replace(/[\p{L}\p{N}]/gu, '_'));
}
