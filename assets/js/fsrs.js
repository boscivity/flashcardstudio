// FSRS-5 spaced repetition scheduler with Anki-style learning steps.
// Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// Card memory state is stored on each card as `srs`:
//   s: stability (days)      d: difficulty (1-10)     st: State
//   due/last: epoch ms       reps/lapses: counts      step: learning step index

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
export const DAY = 86400000;
const MINUTE = 60000;
const LEARNING_STEPS = [1, 10];
const RELEARNING_STEPS = [10];
const MAX_INTERVAL = 36500;

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });
export const State = Object.freeze({ New: 0, Learning: 1, Review: 2, Relearning: 3 });

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / stability, DECAY);
}

export function intervalDays(stability, retention = 0.9) {
  const days = stability / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL);
}

const initStability = g => Math.max(W[g - 1], 0.1);
const initDifficulty = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d, g) {
  const damped = d + (-W[6] * (g - 3)) * (10 - d) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === Rating.Hard ? W[15] : 1;
  const easy = g === Rating.Easy ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}

function forgetStability(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  return Math.min(sf, s / Math.exp(W[17] * W[18]));
}

const shortTermStability = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

export function isValidSrs(srs) {
  return !!srs && typeof srs === 'object' && Number.isFinite(srs.s) && srs.s > 0 &&
    Number.isFinite(srs.d) && Number.isFinite(srs.due) && Number.isFinite(srs.last) &&
    [1, 2, 3].includes(srs.st);
}

/**
 * Returns the next memory state for each rating: { 1: srs, 2: srs, 3: srs, 4: srs }.
 * `prev` is the card's current srs (or undefined for a new card).
 */
export function previewAll(prev, now = Date.now(), retention = 0.9) {
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = step(prev, g, now, retention);
  // Keep review intervals ordered: Hard <= Good < Easy.
  if (out[2].st === State.Review && out[3].st === State.Review && out[4].st === State.Review) {
    const ivl = g => Math.round((out[g].due - now) / DAY);
    const hard = Math.min(ivl(2), ivl(3));
    const good = Math.max(ivl(3), hard + 1);
    const easy = Math.max(ivl(4), good + 1);
    out[2].due = now + hard * DAY;
    out[3].due = now + good * DAY;
    out[4].due = now + Math.min(easy, MAX_INTERVAL) * DAY;
  }
  return out;
}

export const schedule = (prev, rating, now = Date.now(), retention = 0.9) => previewAll(prev, now, retention)[rating];

function step(prev, g, now, retention) {
  const next = { s: 0, d: 0, st: State.Learning, step: 0, due: now, last: now, reps: 1, lapses: 0 };
  if (!isValidSrs(prev)) {
    next.s = initStability(g);
    next.d = initDifficulty(g);
    return learningStep(next, LEARNING_STEPS, 0, g, now, retention);
  }
  next.reps = (prev.reps || 0) + 1;
  next.lapses = prev.lapses || 0;
  const elapsed = Math.max(0, (now - prev.last) / DAY);
  const r = retrievability(elapsed, prev.s);
  const sameDay = elapsed < 1;
  next.d = nextDifficulty(prev.d, g);

  if (prev.st === State.Learning || prev.st === State.Relearning) {
    next.s = sameDay ? shortTermStability(prev.s, g)
      : g === Rating.Again ? forgetStability(prev.d, prev.s, r) : recallStability(prev.d, prev.s, r, g);
    next.st = prev.st;
    return learningStep(next, prev.st === State.Learning ? LEARNING_STEPS : RELEARNING_STEPS, prev.step ?? 0, g, now, retention);
  }

  // Review state
  if (g === Rating.Again) {
    next.lapses += 1;
    next.s = sameDay ? shortTermStability(prev.s, g) : forgetStability(prev.d, prev.s, r);
    next.st = State.Relearning;
    next.step = 0;
    next.due = now + RELEARNING_STEPS[0] * MINUTE;
    return next;
  }
  next.s = sameDay ? Math.max(prev.s, shortTermStability(prev.s, g)) : recallStability(prev.d, prev.s, r, g);
  next.st = State.Review;
  next.due = now + intervalDays(next.s, retention) * DAY;
  return next;
}

// A new card sits on step 0, like Anki: Good moves it to the next step, Easy graduates it.
function learningStep(next, steps, currentStep, g, now, retention) {
  const graduate = () => {
    next.st = State.Review;
    next.step = 0;
    next.due = now + intervalDays(next.s, retention) * DAY;
    return next;
  };
  if (g === Rating.Again) {
    next.step = 0;
    next.due = now + steps[0] * MINUTE;
  } else if (g === Rating.Hard) {
    const i = Math.min(Math.max(0, currentStep), steps.length - 1);
    next.step = i;
    const delay = i > 0 ? steps[i] : steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5;
    next.due = now + delay * MINUTE;
  } else if (g === Rating.Good) {
    const i = currentStep + 1;
    if (i >= steps.length) return graduate();
    next.step = i;
    next.due = now + steps[i] * MINUTE;
  } else {
    return graduate();
  }
  return next;
}
