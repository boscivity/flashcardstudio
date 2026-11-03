// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewAll, schedule, State, Rating, retrievability, intervalDays, DAY } from '../assets/js/fsrs.js?v=2.0.2';
import { gradeAnswer, normalize, variants, diffChars, hintMask, editDistance } from '../assets/js/answer.js?v=2.0.2';
import { parseCsv, toCsv, parseTable, parsePairs } from '../assets/js/csv.js?v=2.0.2';
import { planSession, chooseMode, pickDistractors, renderTemplate, isDue, cardStatus, deckStats, autoAnswerSide, listedChoices, mcChoices } from '../assets/js/session.js?v=2.0.2';

const MIN = 60000;
const T0 = Date.UTC(2026, 0, 10, 15);

test('new card learning steps follow Anki defaults', () => {
  const p = previewAll(undefined, T0);
  assert.equal(p[1].st, State.Learning);
  assert.equal(p[1].due - T0, 1 * MIN);
  assert.equal(p[2].due - T0, 5.5 * MIN);
  assert.equal(p[3].due - T0, 10 * MIN);
  assert.equal(p[3].step, 1);
  assert.equal(p[4].st, State.Review);
  assert.ok(p[4].due - T0 >= 10 * DAY, 'easy graduates with a long interval');
});

test('Good twice graduates a new card to review with a multi-day interval', () => {
  const a = schedule(undefined, Rating.Good, T0);
  const b = schedule(a, Rating.Good, T0 + 10 * MIN);
  assert.equal(b.st, State.Review);
  const days = (b.due - (T0 + 10 * MIN)) / DAY;
  assert.ok(days >= 2 && days <= 8, `first interval ${days}d`);
});

test('intervals grow with successful reviews and shrink after a lapse', () => {
  let s = schedule(undefined, Rating.Good, T0);
  let now = T0 + 10 * MIN;
  s = schedule(s, Rating.Good, now);
  const ivls = [];
  for (let i = 0; i < 5; i++) {
    now = s.due;
    const prevDue = s.due;
    s = schedule(s, Rating.Good, now);
    ivls.push((s.due - prevDue) / DAY);
  }
  for (let i = 1; i < ivls.length; i++) assert.ok(ivls[i] > ivls[i - 1], `intervals increase: ${ivls}`);
  const before = s.s;
  const lapse = schedule(s, Rating.Again, s.due);
  assert.equal(lapse.st, State.Relearning);
  assert.equal(lapse.lapses, 1);
  assert.ok(lapse.s < before, 'stability drops after forgetting');
  assert.equal(lapse.due - s.due, 10 * MIN);
  const relearned = schedule(lapse, Rating.Good, s.due + 10 * MIN);
  assert.equal(relearned.st, State.Review);
});

test('review intervals are ordered Hard <= Good < Easy', () => {
  let s = schedule(undefined, Rating.Good, T0);
  s = schedule(s, Rating.Good, T0 + 10 * MIN);
  const now = s.due + 2 * DAY;
  const p = previewAll(s, now);
  assert.ok(p[2].due <= p[3].due && p[3].due < p[4].due);
});

test('retrievability and interval agree at the target retention', () => {
  assert.equal(intervalDays(10, 0.9), 10);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(intervalDays(10, 0.95) < intervalDays(10, 0.9));
});

test('typed answers forgive case, accents, punctuation, articles and typos', () => {
  assert.equal(gradeAnswer('oxidation', 'Oxidation').verdict, 'correct');
  assert.equal(gradeAnswer('  The Mitochondria. ', 'mitochondria').verdict, 'correct');
  assert.equal(gradeAnswer('pequeno', 'pequeño').verdict, 'correct');
  assert.equal(gradeAnswer('pequeno', 'pequeño', { accents: true }).verdict, 'close');
  assert.equal(gradeAnswer('oxidaton', 'Oxidation').verdict, 'close');
  assert.equal(gradeAnswer('reduction', 'Oxidation').verdict, 'wrong');
  assert.equal(gradeAnswer('', 'Oxidation').verdict, 'empty');
  assert.equal(gradeAnswer('large', 'big / large').verdict, 'correct');
  assert.equal(gradeAnswer('eat', 'to eat').verdict, 'correct');
  assert.equal(gradeAnswer('run', '(to) run').verdict, 'correct');
  assert.equal(gradeAnswer('ion', 'Anion').verdict, 'wrong');
  assert.equal(gradeAnswer('Brasilia', 'Brasília').verdict, 'correct');
  assert.equal(gradeAnswer('cat', 'car').verdict, 'wrong', 'short words need an exact match');
  assert.equal(gradeAnswer('<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>').verdict, 'correct');
});

test('long answers accept nearly-complete key words', () => {
  const def = 'Movement of particles from an area of higher to lower concentration';
  assert.equal(gradeAnswer('movement of particles from higher to lower concentration area', def).verdict, 'close');
  assert.equal(gradeAnswer('water moving', def).verdict, 'wrong');
});

test('helpers: normalize, variants, diff, hint mask, edit distance', () => {
  assert.equal(normalize('Self-Esteem!'), 'self esteem');
  assert.deepEqual(variants('color / colour').sort(), ['color', 'color / colour', 'colour'].sort());
  const d = diffChars('oxidaton', 'Oxidation');
  assert.deepEqual(d.map(x => x.type), ['same', 'missing', 'same']);
  assert.equal(hintMask('Covalent bond', 1), 'C_______ b___');
  assert.equal(editDistance('teh', 'the'), 1);
});

test('CSV round-trips quotes, commas and newlines', () => {
  const rows = [['Term', 'Definition'], ['a, b', 'say "hi"\nnext line'], ['plain', '']];
  assert.deepEqual(parseCsv(toCsv(rows)), [rows[0], rows[1], ['plain', '']]);
  const t = parseTable('﻿Term,Definition,Hint\r\nOsmosis,"Water, moving",H2O\r\n');
  assert.deepEqual(t.columns, ['Term', 'Definition', 'Hint']);
  assert.equal(t.rows[0].Definition, 'Water, moving');
  const tsv = parseTable('Spanish\tEnglish\nhola\thello\n');
  assert.deepEqual(tsv.columns, ['Spanish', 'English']);
});

test('pasted lists split on the most common separator', () => {
  assert.deepEqual(parsePairs('Osmosis - water moves\nDiffusion - particles spread').pairs, [['Osmosis', 'water moves'], ['Diffusion', 'particles spread']]);
  assert.deepEqual(parsePairs('a\tb\nc\td').pairs, [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parsePairs('H2O | water\nNaCl | salt').pairs, [['H2O', 'water'], ['NaCl', 'salt']]);
  const r = parsePairs('good: line\nbad line');
  assert.equal(r.pairs.length, 1);
  assert.equal(r.skipped, 1);
});

const mkDeck = cards => ({ id: 'd1', columns: ['Term', 'Definition'], templates: { front: '{{Term}}', back: '{{Definition}}', hint: '' }, cards });
const card = (id, srs) => ({ id, data: { Term: `t${id}`, Definition: `d${id}` }, ...(srs ? { srs } : {}) });

test('session plan: learning first, due reviews, limited new cards, nothing early', () => {
  const now = T0;
  const learning = { s: 1, d: 5, st: State.Learning, step: 1, due: now + 5 * MIN, last: now - 5 * MIN, reps: 1, lapses: 0 };
  const due = { s: 5, d: 5, st: State.Review, step: 0, due: now - DAY, last: now - 6 * DAY, reps: 3, lapses: 0 };
  const later = { s: 30, d: 5, st: State.Review, step: 0, due: now + 20 * DAY, last: now - 10 * DAY, reps: 5, lapses: 0 };
  const deck = mkDeck([card(1, due), card(2, later), card(3, learning), ...Array.from({ length: 20 }, (_, i) => card(100 + i))]);
  const plan = planSession(deck.cards.map(c => ({ deck, card: c })), { now, newLimit: 5, rng: () => 0.5 });
  assert.equal(plan[0].card.id, 3);
  assert.ok(plan.some(e => e.card.id === 1));
  assert.ok(!plan.some(e => e.card.id === 2));
  assert.equal(plan.filter(e => !e.card.srs).length, 5);
  assert.ok(isDue(deck.cards[0], now) && !isDue(deck.cards[1], now));
  assert.equal(cardStatus(deck.cards[1]), 'mastered');
  const stats = deckStats(deck, now);
  assert.equal(stats.total, 23);
  assert.equal(stats.new, 20);
  assert.equal(stats.due, 2);
});

test('large decks plan quickly', () => {
  const cards = Array.from({ length: 20000 }, (_, i) => card(i, i % 2 ? { s: 3, d: 5, st: State.Review, step: 0, due: T0 - DAY, last: T0 - 4 * DAY, reps: 2, lapses: 0 } : undefined));
  const deck = mkDeck(cards);
  const start = performance.now();
  const plan = planSession(cards.map(c => ({ deck, card: c })), { now: T0, newLimit: 10 });
  assert.ok(performance.now() - start < 500);
  assert.equal(plan.length, 10010);
});

test('auto answer side asks for the answer on Q&A decks', () => {
  const longDef = 'a much longer definition that would be painful to type out word for word';
  const vocab = mkDeck([1, 2, 3].map(i => ({ id: i, data: { Term: `t${i}`, Definition: longDef } })));
  assert.equal(autoAnswerSide(vocab), 'front');
  assert.equal(autoAnswerSide(mkDeck([card(1), card(2)])), 'back');
  const qa = { ...vocab, columns: ['Question', 'Answer'], templates: { front: '{{Question}}', back: '{{Answer}}', hint: '' },
    cards: [{ id: 1, data: { Question: 'Convert °C to K', Answer: 'K = °C + 273.15, so add 273.15 to the Celsius temperature' } }] };
  assert.equal(autoAnswerSide(qa), 'back');
  const asked = mkDeck([1, 2, 3].map(i => ({ id: i, data: { Term: `Why does ${i} happen?`, Definition: longDef } })));
  assert.equal(autoAnswerSide(asked), 'back');
});

test('question modes and distractors', () => {
  assert.equal(chooseMode({ card: card(1), answer: 'short', optionCount: 3 }), 'mc');
  assert.equal(chooseMode({ card: card(1, { s: 3, d: 5, st: State.Review, due: 0, last: 0 }), answer: 'short', optionCount: 3 }), 'type');
  assert.equal(chooseMode({ card: card(1, { s: 3, d: 5, st: State.Review, due: 0, last: 0 }), answer: 'a much longer definition that would be painful to type out word for word', optionCount: 3 }), 'flip');
  assert.equal(chooseMode({ card: card(1), answer: 'x', optionCount: 0 }), 'type');
  assert.equal(chooseMode({ card: card(1), answer: 'x', types: 'flip', optionCount: 3 }), 'flip');
  const d = pickDistractors('Paris', ['Paris', 'paris', 'Rome', 'Berlin', 'Madrid', 'Rome']);
  assert.equal(d.length, 3);
  assert.ok(!d.some(x => x.toLowerCase() === 'paris'));
  assert.equal(new Set(d).size, 3);
});

test('distractors look like the answer', () => {
  const pool = ['bent', '1 g', 'AlI₃', 'CaCl₂', 'Mg₃N₂', 'linear', 'trigonal planar', '45.6 g', 'Fe₂O₃', '3.2 g', '0.5 g', '7 mL'];
  for (let i = 0; i < 20; i++) {
    const formulas = pickDistractors('Na₃X', pool);
    assert.ok(formulas.every(d => ['AlI₃', 'CaCl₂', 'Mg₃N₂', 'Fe₂O₃'].includes(d)), formulas.join());
    const grams = pickDistractors('12.0 g', pool);
    assert.ok(grams.every(d => / g$/.test(d)), grams.join());
  }
});

test('questions that list their own choices use them for multiple choice', () => {
  const q = 'Barium forms Ba₃(X)₂. What forms between sodium and X?\n• NaX\n• Na₂X\n• Na₂X₂\n• Na₃X\n• Na₃X₂';
  const listed = listedChoices(q, 'Na₃X');
  assert.equal(listed.stem, 'Barium forms Ba₃(X)₂. What forms between sodium and X?');
  assert.equal(listed.correct, 'Na₃X');
  assert.equal(listed.choices.length, 5);
  assert.equal(listedChoices('Which ion?\n• P³⁺\n• P\n• P²⁻\n• P³⁻', 'P³-').correct, 'P³⁻');
  assert.equal(listedChoices('Same group?\n• O, S\n• C, N\n• K, Ca', 'O and S').correct, 'O, S');
  assert.equal(listedChoices('Which reacts?\n• Fe(s) + ZnCl₂(aq) → FeCl₂(aq) + Zn(s)\n• Mn(s) + NiCl₂(aq) → MnCl₂(aq) + Ni(s)', 'Mn + NiCl₂ → MnCl₂ + Ni').correct,
    'Mn(s) + NiCl₂(aq) → MnCl₂(aq) + Ni(s)');
  assert.equal(listedChoices('Pick one\n• alpha\n• beta', 'gamma'), null);
  assert.equal(listedChoices('No list here', 'x'), null);

  const mc = mcChoices(q, 'Na₃X', ['bent', '1 g']);
  assert.equal(mc.correct, 'Na₃X');
  assert.deepEqual([...mc.options].sort(), ['NaX', 'Na₂X', 'Na₂X₂', 'Na₃X', 'Na₃X₂']);
  assert.ok(!mc.prompt.includes('•'));
  const plain = mcChoices('Capital of France?', 'Paris', ['Rome', 'Berlin', 'Madrid']);
  assert.equal(plain.correct, 'Paris');
  assert.equal(plain.options.length, 4);
});

test('templates render fields, including names with spaces', () => {
  assert.equal(renderTemplate('{{Spanish word}} ({{ Gender }})', { 'Spanish word': 'casa', Gender: 'f' }), 'casa (f)');
  assert.equal(renderTemplate('{{Missing}}', {}), '');
});
