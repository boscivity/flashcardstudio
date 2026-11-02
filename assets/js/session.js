// Deck helpers and study-session planning. Pure functions, no DOM.
import { State, isValidSrs, DAY } from './fsrs.js?v=2.0.0';

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

/** Picks up to 3 distractors from `pool` (answer strings), preferring similar lengths. */
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
  const ranked = shuffle(unique, rng).sort((a, b) => Math.abs(a.length - len) - Math.abs(b.length - len));
  return shuffle(ranked.slice(0, Math.max(count * 3, 8)), rng).slice(0, count);
}
