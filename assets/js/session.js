// Deck helpers and study-session planning. Pure functions, no DOM.
import { State, isValidSrs, DAY } from './fsrs.js?v=2.0.2';

const FIELD = /{{\s*([^{}]+?)\s*}}/g;
export const LEARN_AHEAD = 20 * 60000;
const ROLLOVER_HOURS = 4;

export function renderTemplate(template, data) {
  return String(template || '').replace(FIELD, (_, key) => (data?.[key] ?? '')).trim();
}

export function templateFields(template) {
  return [...String(template || '').matchAll(FIELD)].map(m => m[1]);
}

export const sideLabel = (deck, side) => templateFields(deck.templates[side])[0] || (side === 'front' ? 'Term' : 'Definition');

export function cardSides(deck, card) {
  return {
    front: renderTemplate(deck.templates.front, card.data),
    back: renderTemplate(deck.templates.back, card.data),
    hint: renderTemplate(deck.templates.hint, card.data)
  };
}

// Day number with a 4am rollover, so a late-night session counts toward "today".
export function dayIndex(ts) {
  const d = new Date(ts - ROLLOVER_HOURS * 3600000);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY);
}

export const isNew = card => !isValidSrs(card.srs);

export function isDue(card, now = Date.now()) {
  const srs = card.srs;
  if (!isValidSrs(srs)) return false;
  if (srs.st === State.Review) return dayIndex(srs.due) <= dayIndex(now);
  return srs.due <= now + LEARN_AHEAD;
}

export function cardStatus(card) {
  const srs = card.srs;
  if (!isValidSrs(srs)) return 'new';
  if (srs.st !== State.Review || srs.s < 7) return 'learning';
  return srs.s >= 21 ? 'mastered' : 'reviewing';
}

export const STATUS_LABEL = { new: 'New', learning: 'Learning', reviewing: 'Reviewing', mastered: 'Mastered' };

export function deckStats(deck, now = Date.now()) {
  const stats = { total: 0, new: 0, learning: 0, reviewing: 0, mastered: 0, due: 0, nextDue: null };
  for (const card of deck.cards) {
    if (!cardHasContent(deck, card)) continue;
    stats.total++;
    stats[cardStatus(card)]++;
    if (isDue(card, now)) stats.due++;
    else if (isValidSrs(card.srs) && (stats.nextDue === null || card.srs.due < stats.nextDue)) stats.nextDue = card.srs.due;
  }
  return stats;
}

/**
 * The side "Auto" asks for. Vocabulary decks with long definitions ask for the term (shown the
 * definition); question-and-answer decks always ask for the answer.
 */
export function autoAnswerSide(deck) {
  const label = side => templateFields(deck.templates[side])[0] || '';
  if (/question|prompt|problem/i.test(label('front')) || /answer|solution/i.test(label('back'))) return 'back';
  const sample = deck.cards.slice(0, 200);
  const fronts = sample.map(c => renderTemplate(deck.templates.front, c.data)).filter(Boolean);
  if (fronts.filter(f => /\?|_{3,}/.test(f)).length * 3 > fronts.length) return 'back';
  const avg = side => {
    const lens = sample.map(c => renderTemplate(deck.templates[side], c.data).length).filter(Boolean);
    return lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  };
  return avg('back') > 40 && avg('front') < avg('back') ? 'front' : 'back';
}

export function cardHasContent(deck, card) {
  const { front, back } = cardSides(deck, card);
  return !!(front && back);
}

export function isLong(text) {
  const t = String(text || '');
  return t.length > 60 || t.split(/\s+/).length > 8 || t.includes('\n');
}

/**
 * Orders study entries ({ deck, card }) for a session.
 * source: 'due' (scheduled reviews + some new cards), 'all', 'new', or 'ids' (given list).
 */
export function planSession(entries, { now = Date.now(), newLimit = 10, source = 'due', ids = null, rng = Math.random } = {}) {
  const usable = entries.filter(e => cardHasContent(e.deck, e.card));
  if (source === 'ids') {
    const wanted = new Set(ids || []);
    return shuffle(usable.filter(e => wanted.has(e.card.id)), rng);
  }
  if (source === 'all') return shuffle(usable, rng);
  if (source === 'new') return usable.filter(e => isNew(e.card)).slice(0, newLimit);

  const learning = [], reviews = [], fresh = [];
  for (const e of usable) {
    if (isNew(e.card)) fresh.push(e);
    else if (isDue(e.card, now)) (e.card.srs.st === State.Review ? reviews : learning).push(e);
  }
  learning.sort((a, b) => a.card.srs.due - b.card.srs.due);
  // Most at-risk reviews first, with a little shuffling among equals.
  const risk = e => (now - e.card.srs.last) / DAY / e.card.srs.s;
  reviews.sort((a, b) => risk(b) - risk(a) || rng() - 0.5);
  const news = fresh.slice(0, Math.max(0, newLimit));
  // Interleave: one new card after every two reviews.
  const mixed = [];
  let r = 0, n = 0;
  while (r < reviews.length || n < news.length) {
    for (let k = 0; k < 2 && r < reviews.length; k++) mixed.push(reviews[r++]);
    if (n < news.length) mixed.push(news[n++]);
  }
  return [...learning, ...mixed];
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Chooses how to ask a card.
 * types: 'smart' | 'typing' | 'mc' | 'flip'. Smart starts new cards with multiple
 * choice, then asks for typed recall; long answers are self-graded.
 */
export function chooseMode({ card, answer, types = 'smart', optionCount = 0, seenThisSession = 0 }) {
  const canMc = optionCount >= 1;
  if (types === 'flip') return 'flip';
  if (types === 'mc') return canMc ? 'mc' : 'flip';
  if (types === 'typing') return 'type';
  const fresh = !isValidSrs(card.srs);
  const learning = !fresh && card.srs.st !== State.Review;
  if (isLong(answer)) return (fresh || (learning && seenThisSession === 0)) && canMc ? 'mc' : 'flip';
  if (fresh && canMc) return 'mc';
  return 'type';
}

// Rough kind of answer (number with its unit, chemical-style formula, short phrase, sentence), so
// distractors look like plausible answers instead of giving the right one away.
function answerShape(text) {
  const t = String(text).normalize('NFKC').trim();
  const num = t.match(/^[~≈<>±+\-−]?\s*\d[\d.,]*(?:\s*[x×]\s*10\S*)?\s*(.*)$/);
  if (num && num[1].split(/\s+/).length <= 3) return { kind: 'number', unit: num[1].toLowerCase().split(/\s+/)[0] || '' };
  const formula = !/\s/.test(t) && /^[A-Z([]/.test(t) && (/\d|[+\-−]$/.test(t) || /^[A-Z][a-z]?$/.test(t) || (t.match(/[A-Z]/g) || []).length > 1);
  if (formula) return { kind: 'formula' };
  return { kind: t.split(/\s+/).length <= 3 ? 'short' : 'long' };
}

/** Picks up to 3 distractors from `pool` (answer strings), preferring the same kind of answer and a similar length. */
export function pickDistractors(answer, pool, rng = Math.random, count = 3) {
  const key = s => String(s).trim().toLowerCase();
  const seen = new Set([key(answer)]);
  const unique = [];
  for (const p of pool) {
    const k = key(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  const len = String(answer).length;
  const want = answerShape(answer);
  const tier = s => {
    const got = answerShape(s);
    return got.kind !== want.kind ? 2 : got.kind === 'number' && got.unit !== want.unit ? 1 : 0;
  };
  // Fill from the most alike answers first; within a tier, pick randomly among the closest lengths.
  const out = [];
  for (const t of [0, 1, 2]) {
    const ranked = shuffle(unique.filter(s => tier(s) === t), rng).sort((a, b) => Math.abs(a.length - len) - Math.abs(b.length - len));
    out.push(...shuffle(ranked.slice(0, Math.max(count * 3, 8)), rng).slice(0, count - out.length));
    if (out.length >= count) break;
  }
  return out;
}

const CHOICE_LINE = /^\s*(?:[•▪◦*]|\(?[a-eA-E][).])\s+(.+)$/;
// Ignores spacing, punctuation, "and", dash style and state symbols like (aq), so "O and S" matches "O, S".
const loose = s => String(s).normalize('NFKC').toLowerCase().replace(/[−–—]/g, '-').replace(/\((?:s|l|g|aq)\)/g, '').replace(/\band\b|[\s,;.·]/g, '');

/**
 * Splits a question that lists its own answer choices ("…?\n• NaX\n• Na₂X") into the question and
 * the choices, and finds which choice is `answer`. Returns null unless exactly one choice matches.
 */
export function listedChoices(prompt, answer) {
  const stem = [], choices = [];
  for (const line of String(prompt || '').split('\n')) {
    const m = line.match(CHOICE_LINE);
    if (m) choices.push(m[1].trim()); else stem.push(line);
  }
  if (choices.length < 2) return null;
  const want = loose(answer);
  const keys = choices.map(loose);
  let hits = keys.flatMap((k, i) => (k === want ? [i] : []));
  if (!hits.length) hits = keys.flatMap((k, i) => (k.length >= 3 && (want.includes(k) || k.includes(want)) ? [i] : []));
  if (hits.length !== 1) return null;
  return { stem: stem.join('\n').trim(), choices, correct: choices[hits[0]] };
}

/**
 * Multiple-choice options for a card: the question's own listed choices when it has them, otherwise
 * the answer plus distractors from `pool`. `prompt` drops the listed choices, since they become buttons.
 */
export function mcChoices(prompt, answer, pool, rng = Math.random) {
  const listed = listedChoices(prompt, answer);
  if (listed) return { prompt: listed.stem, correct: listed.correct, options: shuffle(listed.choices, rng) };
  return { prompt, correct: answer, options: shuffle([answer, ...pickDistractors(answer, pool, rng)], rng) };
}
