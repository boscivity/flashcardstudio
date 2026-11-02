// Deck overview: stats, study modes, options and the card list.
import { html, render, icon, plural, fmtDue, toast, confirmDialog, downloadFile } from '../ui.js?v=2.0.1';
import * as store from '../store.js?v=2.0.1';
import { deckStats, cardSides, cardStatus, STATUS_LABEL, sideLabel, cardHasContent } from '../session.js?v=2.0.1';
import { toCsv } from '../csv.js?v=2.0.1';
import { go } from '../nav.js?v=2.0.1';

export function deckView({ root, params }) {
  const deckId = decodeURIComponent(params[0]);
  let query = '';
  let filter = 'all';

  const draw = () => {
    const deck = store.getDeck(deckId);
    if (!deck) {
      render(root, store.state.ready
        ? html`<div class="page"><div class="empty"><h2>Deck not found</h2><p>It may have been deleted on another device.</p><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`
        : html`<div class="page"><div class="skeleton skeleton--hero"></div></div>`);
      return;
    }
    render(root, page(deck));
    const search = root.querySelector('[data-search]');
    if (search) search.value = query;
  };

  const drawList = () => {
    const deck = store.getDeck(deckId);
    const list = root.querySelector('[data-list]');
    if (deck && list) render(list, cardList(deck, query, filter));
  };

  function page(deck) {
    const s = deckStats(deck);
    const prefs = store.deckPrefs(deck.id);
    const front = sideLabel(deck, 'front'), back = sideLabel(deck, 'back');
    const pct = n => (s.total ? (n / s.total) * 100 : 0);
    const starred = deck.cards.filter(c => c.star).length;
    return html`
    <div class="page deck-page">
      <a class="back-link" href="#/">${icon('back')} All decks</a>
      <header class="deck-hero">
        <div class="deck-hero__main">
          <h1 class="deck-hero__title">${deck.name}</h1>
          <p class="muted">${plural(s.total, 'card')} · ${front} → ${back}</p>
        </div>
        <div class="deck-hero__tools">
          <a class="btn" href="#/edit/${encodeURIComponent(deck.id)}">${icon('edit')}<span>Edit</span></a>
          <details class="menu">
            <summary class="btn btn-icon" aria-label="More deck actions">${icon('more')}</summary>
            <div class="menu__list" role="menu">
              <button type="button" role="menuitem" data-action="export">${icon('download')} Export CSV</button>
              <button type="button" role="menuitem" data-action="duplicate">${icon('copy')} Duplicate</button>
              <button type="button" role="menuitem" data-action="reset">${icon('undo')} Reset progress</button>
              <button type="button" role="menuitem" class="danger" data-action="delete">${icon('trash')} Delete deck</button>
            </div>
          </details>
        </div>
      </header>

      <section class="deck-progress" aria-label="Progress">
        <div class="mastery mastery--lg" role="img" aria-label="${s.mastered} mastered, ${s.reviewing} reviewing, ${s.learning} learning, ${s.new} new">
          <span class="mastery__seg mastery__seg--mastered" style="width:${pct(s.mastered)}%"></span>
          <span class="mastery__seg mastery__seg--reviewing" style="width:${pct(s.reviewing)}%"></span>
          <span class="mastery__seg mastery__seg--learning" style="width:${pct(s.learning)}%"></span>
        </div>
        <ul class="legend">
          <li><i class="dot dot--mastered"></i>${s.mastered} mastered</li>
          <li><i class="dot dot--reviewing"></i>${s.reviewing} reviewing</li>
          <li><i class="dot dot--learning"></i>${s.learning} learning</li>
          <li><i class="dot dot--new"></i>${s.new} new</li>
        </ul>
      </section>

      <section class="modes" aria-label="Study modes">
        <a class="mode mode--primary" href="#/study/${encodeURIComponent(deck.id)}">
          <span class="mode__icon">${icon('zap')}</span>
          <span class="mode__text"><strong>Study</strong><span>${s.due ? `${plural(s.due, 'card')} due` : s.new ? `${plural(Math.min(s.new, store.prefs().newPerSession), 'new card')} to learn` : s.nextDue ? `All done · next ${fmtDue(s.nextDue)}` : 'Smart review'}</span></span>
          ${icon('right', 'mode__chev')}
        </a>
        <a class="mode" href="#/cards/${encodeURIComponent(deck.id)}"><span class="mode__icon">${icon('cards')}</span><span class="mode__text"><strong>Flashcards</strong><span>Flip through</span></span></a>
        <a class="mode" href="#/test/${encodeURIComponent(deck.id)}"><span class="mode__icon">${icon('test')}</span><span class="mode__text"><strong>Test</strong><span>Check yourself</span></span></a>
        <a class="mode" href="#/match/${encodeURIComponent(deck.id)}"><span class="mode__icon">${icon('grid')}</span><span class="mode__text"><strong>Match</strong><span>Beat the clock</span></span></a>
      </section>

      <details class="panel options" ${prefs.answerWith !== 'auto' || prefs.types !== 'smart' ? 'open' : ''}>
        <summary>${icon('sliders')} Study options</summary>
        <div class="options__grid">
          <fieldset class="segmented">
            <legend>Answer with</legend>
            ${[['auto', 'Auto'], ['back', back], ['front', front], ['both', 'Both']].map(([v, l]) => html`
              <label><input type="radio" name="answerWith" value="${v}" ${prefs.answerWith === v ? 'checked' : ''}><span>${l}</span></label>`)}
          </fieldset>
          <fieldset class="segmented">
            <legend>Questions</legend>
            ${[['smart', 'Smart'], ['typing', 'Typing'], ['mc', 'Multiple choice'], ['flip', 'Flip & grade']].map(([v, l]) => html`
              <label><input type="radio" name="types" value="${v}" ${prefs.types === v ? 'checked' : ''}><span>${l}</span></label>`)}
          </fieldset>
          <p class="muted small">Smart starts new cards as multiple choice, then asks you to type the answer. Auto asks for the answer; only vocabulary decks with long definitions ask for the term instead.
          ${starred ? html`<br><a href="#/study/${encodeURIComponent(deck.id)}?starred">Study only your ${plural(starred, 'starred card')}</a>` : ''}</p>
        </div>
      </details>

      <section class="cards-section" aria-labelledby="cardsTitle">
        <div class="section-head">
          <h2 id="cardsTitle" class="section-title">Cards</h2>
          <div class="section-head__tools">
            <label class="search">${icon('search')}<span class="sr-only">Search cards</span><input type="search" data-search placeholder="Search cards" autocomplete="off"></label>
            <select data-filter aria-label="Filter cards">
              ${[['all', 'All'], ['starred', 'Starred'], ['new', 'New'], ['learning', 'Learning'], ['reviewing', 'Reviewing'], ['mastered', 'Mastered']].map(([v, l]) => html`<option value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`)}
            </select>
          </div>
        </div>
        <ol class="card-list" data-list>${cardList(deck, query, filter)}</ol>
      </section>
    </div>`;
  }

  function cardList(deck, q, f) {
    const needle = q.trim().toLowerCase();
    const rows = deck.cards.filter(c => cardHasContent(deck, c)).map(card => ({ card, ...cardSides(deck, card), status: cardStatus(card) }))
      .filter(r => (f === 'all' || (f === 'starred' ? r.card.star : r.status === f)) &&
        (!needle || r.front.toLowerCase().includes(needle) || r.back.toLowerCase().includes(needle)));
    if (!rows.length) return html`<li class="muted empty-search">${needle || f !== 'all' ? 'No matching cards.' : html`This deck has no cards yet. <a href="#/edit/${encodeURIComponent(deck.id)}">Add some</a>.`}</li>`;
    return rows.map(r => html`
      <li class="card-row">
        <button type="button" class="star ${r.card.star ? 'is-on' : ''}" data-star="${r.card.id}" aria-pressed="${r.card.star ? 'true' : 'false'}" aria-label="Star card">${icon('star')}</button>
        <div class="card-row__front">${r.front}</div>
        <div class="card-row__back">${r.back}</div>
        <div class="card-row__status"><span class="status status--${r.status}">${STATUS_LABEL[r.status]}</span>${r.card.srs ? html`<span class="muted small">${fmtDue(r.card.srs.due)}</span>` : ''}</div>
      </li>`);
  }

  const onClick = async event => {
    const deck = store.getDeck(deckId);
    if (!deck) return;
    const star = event.target.closest('[data-star]');
    if (star) {
      const card = deck.cards.find(c => c.id === star.dataset.star);
      store.setStar(deckId, star.dataset.star, !card?.star);
      return;
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    el.closest('details')?.removeAttribute('open');
    const action = el.dataset.action;
    if (action === 'export') {
      const rows = [deck.columns, ...deck.cards.map(c => deck.columns.map(col => c.data[col] ?? ''))];
      const file = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck'}.csv`;
      downloadFile(file, '﻿' + toCsv(rows), 'text/csv;charset=utf-8');
    } else if (action === 'duplicate') {
      try {
        const copy = await store.saveDeck({ ...deck, id: store.uuid(), name: `${deck.name} (copy)`, cards: deck.cards.map(c => ({ id: store.uuid(), data: { ...c.data } })) });
        toast('Deck duplicated');
        go(`#/deck/${encodeURIComponent(copy.id)}`);
      } catch { toast('Could not duplicate the deck.', { tone: 'error' }); }
    } else if (action === 'reset') {
      if (await confirmDialog({ title: 'Reset progress?', body: html`<p>All cards in “${deck.name}” go back to <strong>new</strong>. Your cards themselves are kept.</p>`, confirm: 'Reset progress', danger: true })) {
        store.resetProgress(deckId);
        toast('Progress reset');
      }
    } else if (action === 'delete') {
      if (await confirmDialog({ title: 'Delete deck?', body: html`<p>“${deck.name}” and its ${plural(deck.cards.length, 'card')} will be deleted${store.state.user ? ' from your account' : ''}. This can’t be undone.</p>`, confirm: 'Delete', danger: true })) {
        try {
          await store.deleteDeck(deckId);
          toast('Deck deleted');
          go('#/');
        } catch { toast('Could not delete the deck. Check your connection and try again.', { tone: 'error' }); }
      }
    }
  };

  const onChange = event => {
    const t = event.target;
    if (t.name === 'answerWith' || t.name === 'types') store.setDeckPref(deckId, t.name, t.value);
    if (t.matches('[data-filter]')) { filter = t.value; drawList(); }
  };
  const onInput = event => {
    if (event.target.matches('[data-search]')) { query = event.target.value; drawList(); }
  };
  const onDocClick = event => {
    for (const menu of root.querySelectorAll('details.menu[open]')) if (!menu.contains(event.target)) menu.removeAttribute('open');
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  document.addEventListener('click', onDocClick);
  const unsubscribe = store.subscribe(reason => {
    if (reason !== 'decks') return;
    if (root.contains(document.activeElement) && document.activeElement.matches('input, select')) drawList(); else draw();
  });
  draw();
  return () => {
    unsubscribe();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    document.removeEventListener('click', onDocClick);
  };
}
