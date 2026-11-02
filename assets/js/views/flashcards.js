// Classic flip-through flashcards with "know it / still learning" sorting.
import { html, render, icon, plural, speak, canSpeak, shuffle, isTypingTarget, confetti } from '../ui.js?v=2.0.1';
import * as store from '../store.js?v=2.0.1';
import { cardSides, cardHasContent, sideLabel } from '../session.js?v=2.0.1';
import { go, setHandoff } from '../nav.js?v=2.0.1';

export function flashcardsView({ root, params, query }) {
  const deckId = decodeURIComponent(params[0]);
  const deck = store.getDeck(deckId);
  const backHref = `#/deck/${encodeURIComponent(deckId)}`;
  if (!deck) {
    render(root, html`<div class="page"><div class="empty"><h2>Deck not found</h2><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`);
    return () => {};
  }
  document.body.classList.add('focus-mode');

  const all = deck.cards.filter(c => cardHasContent(deck, c));
  let order = query.has('starred') ? all.filter(c => c.star) : [...all];
  if (!order.length) order = [...all];
  let index = 0;
  let flipped = false;
  let startBack = false;
  let shuffled = false;
  const known = new Set();
  const learning = new Set();
  let finished = false;

  const current = () => order[index];

  function draw() {
    if (!order.length) {
      render(root, html`<div class="page"><div class="empty"><h2>No cards yet</h2><a class="btn btn-primary" href="#/edit/${encodeURIComponent(deckId)}">Add cards</a></div></div>`);
      return;
    }
    if (finished) return drawSummary();
    const card = current();
    const sides = cardSides(deck, card);
    const frontText = startBack ? sides.back : sides.front;
    const backText = startBack ? sides.front : sides.back;
    render(root, html`
      <div class="study">
        <header class="study__bar">
          <a class="btn btn-icon btn-ghost" href="${backHref}" aria-label="Close flashcards">${icon('x')}</a>
          <div class="study__progress" role="progressbar" aria-label="Position" aria-valuemin="1" aria-valuemax="${order.length}" aria-valuenow="${index + 1}"><span style="width:${((index + 1) / order.length) * 100}%"></span></div>
          <span class="study__count">${index + 1}/${order.length}</span>
          <button type="button" class="btn btn-icon btn-ghost ${shuffled ? 'is-active' : ''}" data-action="shuffle" aria-pressed="${shuffled}" aria-label="Shuffle" title="Shuffle">${icon('shuffle')}</button>
          <button type="button" class="btn btn-icon btn-ghost ${startBack ? 'is-active' : ''}" data-action="side" aria-pressed="${startBack}" aria-label="Show ${sideLabel(deck, 'back')} first" title="Start with ${sideLabel(deck, startBack ? 'front' : 'back')}">${icon('swap')}</button>
        </header>
        <main class="study__stage">
          <div class="flip-wrap">
          <div class="flip ${flipped ? 'is-flipped' : ''}" data-action="flip" role="button" tabindex="0" aria-label="Flip card">
            <div class="flip__inner">
              <section class="flip__face flip__face--front" aria-hidden="${flipped}">
                <span class="flip__label">${startBack ? sideLabel(deck, 'back') : sideLabel(deck, 'front')}</span>
                <p class="flip__text ${frontText.length > 140 ? 'flip__text--long' : ''}">${frontText}</p>
                <span class="flip__tap muted small">Tap or press Space to flip</span>
              </section>
              <section class="flip__face flip__face--back" aria-hidden="${!flipped}">
                <span class="flip__label">${startBack ? sideLabel(deck, 'front') : sideLabel(deck, 'back')}</span>
                <p class="flip__text ${backText.length > 140 ? 'flip__text--long' : ''}">${backText}</p>
                ${sides.hint ? html`<p class="muted small">${icon('bulb')} ${sides.hint}</p>` : ''}
              </section>
            </div>
          </div>
            <div class="flip__tools">
              <button type="button" class="btn btn-icon btn-ghost star ${card.star ? 'is-on' : ''}" data-action="star" aria-pressed="${card.star ? 'true' : 'false'}" aria-label="Star card">${icon('star')}</button>
              ${canSpeak() ? html`<button type="button" class="btn btn-icon btn-ghost" data-action="speak" aria-label="Read aloud">${icon('volume')}</button>` : ''}
            </div>
          </div>
          <div class="flip-nav">
            <button type="button" class="btn btn-lg sort sort--learning" data-action="learning">${icon('x')} Still learning <kbd>1</kbd></button>
            <button type="button" class="btn btn-icon btn-lg" data-action="prev" aria-label="Previous card" ${index === 0 ? 'disabled' : ''}>${icon('left')}</button>
            <button type="button" class="btn btn-icon btn-lg" data-action="next" aria-label="Next card">${icon('right')}</button>
            <button type="button" class="btn btn-lg sort sort--known" data-action="known">${icon('check')} Know it <kbd>2</kbd></button>
          </div>
          <p class="flip-tally muted small">${known.size} known · ${learning.size} still learning</p>
        </main>
        <footer class="study__keys" aria-hidden="true"><span><kbd>Space</kbd> flip</span><span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>1</kbd> still learning</span><span><kbd>2</kbd> know it</span></footer>
      </div>`);
    root.querySelector('.flip')?.focus({ preventScroll: true });
  }

  function drawSummary() {
    const total = known.size + learning.size;
    render(root, html`
      <div class="page"><div class="done">
        <div class="done__badge done__badge--party">${icon('trophy')}</div>
        <h1>You went through every card</h1>
        <dl class="done__stats">
          <div><dt>${icon('check')} Know it</dt><dd>${known.size}</dd></div>
          <div><dt>${icon('flip')} Still learning</dt><dd>${learning.size}</dd></div>
          <div><dt>${icon('cards')} Unsorted</dt><dd>${Math.max(0, order.length - total)}</dd></div>
        </dl>
        <div class="done__actions">
          ${learning.size ? html`<button type="button" class="btn btn-primary btn-lg" data-action="again-learning">${icon('flip')} Flip the ${plural(learning.size, 'card')} again</button>` : ''}
          ${learning.size ? html`<button type="button" class="btn btn-lg" data-action="study-learning">${icon('zap')} Quiz me on them</button>` : ''}
          <button type="button" class="btn btn-lg ${learning.size ? '' : 'btn-primary'}" data-action="restart">${icon('undo')} Start over</button>
          <a class="btn btn-lg btn-ghost" href="${backHref}">Done</a>
        </div>
      </div></div>`);
  }

  function move(delta) {
    const target = index + delta;
    if (target < 0) return;
    if (target >= order.length) { finished = true; if (learning.size === 0) confetti(); draw(); return; }
    index = target;
    flipped = false;
    draw();
  }

  function sort(isKnown) {
    const card = current();
    if (!card) return;
    (isKnown ? known : learning).add(card.id);
    (isKnown ? learning : known).delete(card.id);
    move(1);
  }

  function restart(cards) {
    order = shuffled ? shuffle(cards) : cards;
    index = 0;
    flipped = false;
    finished = false;
    known.clear();
    learning.clear();
    draw();
  }

  const onClick = event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const card = current();
    if (action === 'flip') { flipped = !flipped; root.querySelector('.flip')?.classList.toggle('is-flipped', flipped); }
    else if (action === 'next') move(1);
    else if (action === 'prev') move(-1);
    else if (action === 'known') sort(true);
    else if (action === 'learning') sort(false);
    else if (action === 'shuffle') {
      shuffled = !shuffled;
      const rest = order.slice(index);
      order = [...order.slice(0, index), ...(shuffled ? shuffle(rest) : all.filter(c => rest.includes(c)))];
      draw();
    } else if (action === 'side') { startBack = !startBack; flipped = false; draw(); }
    else if (action === 'star' && card) {
      store.setStar(deckId, card.id, !card.star);
      draw();
    } else if (action === 'speak' && card) {
      const sides = cardSides(deck, card);
      speak(flipped !== startBack ? sides.back : sides.front);
    } else if (action === 'again-learning') restart(all.filter(c => learning.has(c.id)));
    else if (action === 'restart') restart([...all]);
    else if (action === 'study-learning') {
      setHandoff({ ids: [...learning], title: `${deck.name} · still learning` });
      go(`#/study/${encodeURIComponent(deckId)}`);
    }
  };

  const onKeydown = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target) || finished) return;
    const k = event.key;
    if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown') {
      if (k === 'Enter' && event.target.closest?.('button')) return;
      event.preventDefault();
      flipped = !flipped;
      root.querySelector('.flip')?.classList.toggle('is-flipped', flipped);
    } else if (k === 'ArrowRight') { event.preventDefault(); move(1); }
    else if (k === 'ArrowLeft') { event.preventDefault(); move(-1); }
    else if (k === '1') sort(false);
    else if (k === '2') sort(true);
    else if (k === 'Escape') go(backHref);
  };

  // Swipe left/right on touch screens.
  let touch = null;
  const onTouchStart = e => { if (e.target.closest('.flip-wrap')) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); sort(dx > 0); }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchend', onTouchEnd);
  document.addEventListener('keydown', onKeydown);
  draw();
  return () => {
    document.body.classList.remove('focus-mode');
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('keydown', onKeydown);
    window.speechSynthesis?.cancel();
  };
}
