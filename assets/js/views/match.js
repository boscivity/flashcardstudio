// Match game: pair terms with definitions against the clock.
import { html, render, icon, shuffle, fmtDuration, confetti } from '../ui.js?v=2.0.0';
import * as store from '../store.js?v=2.0.0';
import { cardSides, cardHasContent } from '../session.js?v=2.0.0';

const PAIRS = 6;
const PENALTY = 1000;
const bestKey = id => `fcs:v2:match:${id}`;

export function matchView({ root, params }) {
  const deckId = decodeURIComponent(params[0]);
  const deck = store.getDeck(deckId);
  const backHref = `#/deck/${encodeURIComponent(deckId)}`;
  if (!deck) {
    render(root, html`<div class="page"><div class="empty"><h2>Deck not found</h2><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`);
    return () => {};
  }
  const cards = deck.cards.filter(c => cardHasContent(deck, c));
  let tiles = [], selected = null, matched = 0, start = 0, penalty = 0, timer = null, phase = 'intro', busy = false;
  const best = () => { try { return Number(localStorage.getItem(bestKey(deckId))) || 0; } catch { return 0; } };

  function setup() {
    // Prefer shorter cards so tiles stay readable.
    const ranked = shuffle(cards).sort((a, b) => (cardSides(deck, a).back.length > 140) - (cardSides(deck, b).back.length > 140));
    const picked = ranked.slice(0, Math.min(PAIRS, cards.length));
    tiles = shuffle(picked.flatMap(card => {
      const s = cardSides(deck, card);
      return [{ id: card.id, side: 'front', text: s.front }, { id: card.id, side: 'back', text: s.back }];
    })).map((t, i) => ({ ...t, key: i, done: false }));
    selected = null;
    matched = 0;
    penalty = 0;
    start = performance.now();
    phase = 'play';
    clearInterval(timer);
    timer = setInterval(tick, 100);
  }

  const elapsed = () => performance.now() - start + penalty;
  const tick = () => { const el = root.querySelector('[data-clock]'); if (el) el.textContent = (elapsed() / 1000).toFixed(1); };

  function draw() {
    if (phase === 'intro') {
      const b = best();
      render(root, html`
        <div class="page narrow"><div class="done">
          <div class="done__badge">${icon('grid')}</div>
          <h1>Match</h1>
          <p class="muted">Tap a term, then its matching definition. Wrong matches add a second. Clear the board as fast as you can.</p>
          ${b ? html`<p>Your best: <strong>${(b / 1000).toFixed(1)}s</strong></p>` : ''}
          <div class="done__actions">
            ${cards.length >= 2 ? html`<button type="button" class="btn btn-primary btn-lg" data-action="start">${icon('play')} Start game</button>` : html`<p class="muted">Add at least two cards to play.</p>`}
            <a class="btn btn-lg btn-ghost" href="${backHref}">Back</a>
          </div>
        </div></div>`);
      root.querySelector('[data-action="start"]')?.focus();
      return;
    }
    if (phase === 'done') {
      const time = elapsed();
      const prev = best();
      const record = !prev || time < prev;
      if (record) { try { localStorage.setItem(bestKey(deckId), String(Math.round(time))); } catch { /* ignore */ } }
      render(root, html`
        <div class="page narrow"><div class="done">
          <div class="done__badge done__badge--party">${icon('trophy')}</div>
          <h1>${(time / 1000).toFixed(1)}s</h1>
          <p class="muted">${record ? (prev ? 'New personal best!' : 'First time on the board — nice.') : `Your best is ${(prev / 1000).toFixed(1)}s.`}${penalty ? ` Includes ${fmtDuration(penalty)} of penalties.` : ''}</p>
          <div class="done__actions">
            <button type="button" class="btn btn-primary btn-lg" data-action="start">${icon('undo')} Play again</button>
            <a class="btn btn-lg btn-ghost" href="${backHref}">Done</a>
          </div>
        </div></div>`);
      if (record) confetti();
      root.querySelector('[data-action="start"]')?.focus();
      return;
    }
    render(root, html`
      <div class="study">
        <header class="study__bar">
          <a class="btn btn-icon btn-ghost" href="${backHref}" aria-label="Quit game">${icon('x')}</a>
          <span class="match-clock">${icon('clock')} <span data-clock>0.0</span>s</span>
          <span class="study__count">${matched}/${tiles.length / 2}</span>
        </header>
        <main class="match-board" role="group" aria-label="Match tiles">
          ${tiles.map(t => html`<button type="button" class="tile ${t.done ? 'is-done' : ''} ${selected === t.key ? 'is-selected' : ''} ${t.text.length > 90 ? 'tile--long' : ''}" data-tile="${t.key}" ${t.done ? 'disabled aria-hidden="true"' : ''}>${t.text}</button>`)}
        </main>
      </div>`);
    tick();
  }

  function pick(key) {
    if (busy || phase !== 'play') return;
    const tile = tiles[key];
    if (!tile || tile.done) return;
    if (selected === null || selected === key) {
      selected = selected === null ? key : null;
      draw();
      root.querySelector(`[data-tile="${key}"]`)?.focus();
      return;
    }
    const first = tiles[selected];
    if (first.id === tile.id && first.side !== tile.side) {
      first.done = tile.done = true;
      matched++;
      selected = null;
      if (matched === tiles.length / 2) { clearInterval(timer); phase = 'done'; }
      draw();
      root.querySelector('.tile:not([disabled])')?.focus();
    } else {
      penalty += PENALTY;
      busy = true;
      const a = root.querySelector(`[data-tile="${selected}"]`), b = root.querySelector(`[data-tile="${key}"]`);
      a?.classList.add('is-wrong'); b?.classList.add('is-wrong');
      setTimeout(() => { busy = false; selected = null; draw(); root.querySelector(`[data-tile="${key}"]`)?.focus(); }, 450);
    }
  }

  const onClick = event => {
    const tile = event.target.closest('[data-tile]');
    if (tile) return pick(Number(tile.dataset.tile));
    if (event.target.closest('[data-action="start"]')) { setup(); draw(); root.querySelector('.tile')?.focus(); }
  };

  document.body.classList.add('focus-mode');
  root.addEventListener('click', onClick);
  draw();
  return () => {
    clearInterval(timer);
    document.body.classList.remove('focus-mode');
    root.removeEventListener('click', onClick);
  };
}
