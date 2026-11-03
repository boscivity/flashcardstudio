// Smart study session: multiple choice -> typed recall -> spaced reviews, scheduled with FSRS.
import { html, render, icon, plural, fmtInterval, fmtDue, fmtDuration, toast, speak, canSpeak, confetti, isTypingTarget } from '../ui.js?v=2.0.2';
import * as store from '../store.js?v=2.0.2';
import { previewAll, schedule, Rating } from '../fsrs.js?v=2.0.2';
import { planSession, chooseMode, mcChoices, cardSides, renderTemplate, templateFields, autoAnswerSide, LEARN_AHEAD, deckStats } from '../session.js?v=2.0.2';
import { gradeAnswer, diffChars, hintMask } from '../answer.js?v=2.0.2';
import { go, takeHandoff, setHandoff } from '../nav.js?v=2.0.2';

const RATING_LABELS = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export function studyView({ root, params, query }) {
  const scope = decodeURIComponent(params[0]);
  const handoff = takeHandoff();
  const decks = scope === 'all' ? [...store.state.decks] : [store.getDeck(scope)].filter(Boolean);
  const backHref = scope === 'all' ? '#/' : `#/deck/${encodeURIComponent(scope)}`;
  const title = handoff?.title || (scope === 'all' ? 'All decks' : decks[0]?.name || 'Study');

  if (!decks.length) {
    render(root, html`<div class="page"><div class="empty"><h2>${store.state.ready ? 'Deck not found' : 'Loading…'}</h2><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`);
    if (!store.state.ready) {
      const unsub = store.subscribe(r => { if (r === 'decks' && store.state.ready) { unsub(); go(location.hash, { replace: true }); } });
      return unsub;
    }
    return () => {};
  }

  document.body.classList.add('focus-mode');
  const prefs = store.prefs();
  const retention = prefs.retention || 0.9;

  let source = 'due', ids = null;
  if (handoff?.ids) { source = 'ids'; ids = handoff.ids; }
  else if (query.has('starred')) { source = 'ids'; ids = decks.flatMap(d => d.cards.filter(c => c.star).map(c => c.id)); }
  else if (query.has('cram')) source = 'all';

  // Which side to type, per deck.
  const answerSide = deck => {
    const pref = store.deckPrefs(deck.id).answerWith;
    if (pref === 'back' || pref === 'front' || pref === 'both') return pref;
    return autoAnswerSide(deck);
  };
  const sideFor = new Map(decks.map(d => [d.id, answerSide(d)]));

  const makeItem = e => {
    let side = sideFor.get(e.deck.id);
    if (side === 'both') side = Math.random() < 0.5 ? 'front' : 'back';
    return { deckId: e.deck.id, cardId: e.card.id, side, seen: 0 };
  };

  const plan = () => {
    const entries = decks.flatMap(deck => deck.cards.map(card => ({ deck: store.getDeck(deck.id) || deck, card })));
    return planSession(entries, { source, ids, newLimit: prefs.newPerSession }).map(makeItem);
  };

  let queue = plan();
  let current = null;      // { item, deck, card, prompt, answer, hint, extra, mode, options }
  let phase = 'ask';       // ask | feedback | done | empty
  let attempt = null;
  let completed = 0;
  let autoTimer = null;
  const history = [];
  const stats = { reviews: 0, first: new Map(), again: new Set(), introduced: 0, start: Date.now() };

  function load(item) {
    const deck = store.getDeck(item.deckId);
    const card = store.getCard(item.deckId, item.cardId);
    if (!deck || !card) return null;
    const sides = cardSides(deck, card);
    const answerKey = item.side;
    const promptKey = answerKey === 'back' ? 'front' : 'back';
    const used = new Set([...templateFields(deck.templates.front), ...templateFields(deck.templates.back), ...templateFields(deck.templates.hint)]);
    const extra = deck.columns.filter(c => !used.has(c) && String(card.data[c] || '').trim()).map(c => [c, card.data[c]]);
    const pool = deck.cards.filter(c => c.id !== card.id).map(c => renderTemplate(deck.templates[answerKey], c.data)).filter(Boolean);
    const mc = mcChoices(sides[promptKey], sides[answerKey], pool);
    const mode = chooseMode({ card, answer: sides[answerKey], types: store.deckPrefs(deck.id).types, optionCount: mc.options.length - 1, seenThisSession: item.seen });
    return {
      item, deck, card, mode,
      prompt: mode === 'mc' ? mc.prompt : sides[promptKey], answer: sides[answerKey], correct: mc.correct,
      promptLabel: templateFields(deck.templates[promptKey])[0] || (promptKey === 'front' ? 'Front' : 'Back'),
      answerLabel: templateFields(deck.templates[answerKey])[0] || (answerKey === 'front' ? 'Front' : 'Back'),
      hint: sides.hint, extra,
      options: mode === 'mc' ? mc.options : []
    };
  }

  function next() {
    clearTimeout(autoTimer);
    current = null;
    while (queue.length && !current) current = load(queue.shift());
    if (!current) {
      phase = stats.reviews ? 'done' : 'empty';
      draw();
      if (phase === 'done') { store.flush(); if (stats.reviews >= 5) confetti(); }
      return;
    }
    phase = 'ask';
    attempt = { start: Date.now(), hintLevel: 0, typed: '', choice: null, verdict: null };
    draw();
    if (prefs.autoSpeak) speak(current.prompt);
  }

  // ---------- rendering
  function draw() {
    if (phase === 'empty') return render(root, emptyScreen());
    if (phase === 'done') return render(root, doneScreen());
    const remaining = queue.length + 1;
    // Cards still in learning count half once answered correctly, so progress keeps moving.
    const partial = queue.reduce((n, item) => n + (item.partial || 0), 0) + (current.item.partial || 0);
    const pct = ((completed + partial) / (completed + remaining)) * 100;
    render(root, html`
      <div class="study">
        <header class="study__bar">
          <a class="btn btn-icon btn-ghost" href="${backHref}" aria-label="End session">${icon('x')}</a>
          <div class="study__progress" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="${completed + remaining}" aria-valuenow="${completed}">
            <span style="width:${pct}%"></span>
          </div>
          <span class="study__count" aria-live="off">${completed}/${completed + remaining}</span>
          <button type="button" class="btn btn-icon btn-ghost star ${current.card.star ? 'is-on' : ''}" data-action="star" aria-pressed="${current.card.star ? 'true' : 'false'}" aria-label="Star card (S)" title="Star (S)">${icon('star')}</button>
          <button type="button" class="btn btn-icon btn-ghost" data-action="undo" aria-label="Undo last answer (Z)" title="Undo (Z)" ${history.length ? '' : 'disabled'}>${icon('undo')}</button>
        </header>
        <main class="study__stage">
          <section class="qcard ${phase === 'feedback' ? `qcard--${attempt.verdict}` : ''}" aria-live="polite">
            <div class="qcard__meta">
              <span class="tag">${modeLabel()}</span>
              ${scope === 'all' ? html`<span class="muted small">${current.deck.name}</span>` : ''}
            </div>
            <div class="qcard__label">${current.promptLabel}</div>
            <div class="qcard__prompt ${current.prompt.length > 120 ? 'qcard__prompt--long' : ''}"><span class="qcard__text">${current.prompt}</span>${canSpeak() ? html`<button type="button" class="speak" data-action="speak" data-text="prompt" aria-label="Read aloud">${icon('volume')}</button>` : ''}</div>
            ${phase === 'ask' ? askBody() : feedbackBody()}
          </section>
        </main>
        <footer class="study__keys" aria-hidden="true">${keysHelp()}</footer>
      </div>`);
    focusDefault();
  }

  const modeLabel = () => ({ type: `Type the ${current.answerLabel.toLowerCase()}`, mc: 'Choose the answer', flip: 'Recall, then reveal' })[current.mode];

  function askBody() {
    if (current.mode === 'type') {
      const hintText = attempt.hintLevel ? hintMask(current.answer, attempt.hintLevel) : '';
      return html`
        ${current.hint && attempt.hintLevel ? html`<p class="qcard__hint">${icon('bulb')} ${current.hint}</p>` : ''}
        ${hintText ? html`<p class="qcard__mask" aria-label="Hint">${hintText}</p>` : ''}
        <form class="answer-form" data-answer>
          <label class="sr-only" for="answerInput">Your answer</label>
          <input id="answerInput" class="answer-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" maxlength="2000" placeholder="Type your answer" value="${attempt.typed}">
          <div class="answer-form__row">
            <button type="button" class="btn btn-ghost" data-action="hint">${icon('bulb')} Hint</button>
            <button type="button" class="btn btn-ghost" data-action="reveal">Don’t know</button>
            <button type="submit" class="btn btn-primary">Check <kbd>Enter</kbd></button>
          </div>
        </form>`;
    }
    if (current.mode === 'mc') {
      return html`<div class="options" role="group" aria-label="Answer choices">
        ${current.options.map((opt, i) => html`<button type="button" class="option" data-option="${i}"><kbd>${i + 1}</kbd><span>${opt}</span></button>`)}
        <button type="button" class="btn btn-ghost btn-sm options__idk" data-action="reveal">Don’t know</button>
      </div>`;
    }
    return html`
      ${current.hint ? html`<details class="qcard__hint-toggle"><summary>${icon('bulb')} Hint</summary><p>${current.hint}</p></details>` : ''}
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="show">Show answer <kbd>Space</kbd></button>`;
  }

  function feedbackBody() {
    const v = attempt.verdict;
    const verdictText = {
      correct: html`${icon('check')} Correct`,
      close: html`${icon('check')} Almost — check the spelling`,
      wrong: html`${icon('x')} Not quite`,
      revealed: html`Here’s the answer`,
      override: html`${icon('check')} Counted as correct`,
      flip: html`How well did you know it?`
    }[v];
    const answerBlock = html`
      <div class="qcard__answer">
        <div class="qcard__label">${current.answerLabel}</div>
        <div class="qcard__answer-text"><span class="qcard__text">${current.answer}</span>${canSpeak() ? html`<button type="button" class="speak" data-action="speak" data-text="answer" aria-label="Read answer aloud">${icon('volume')}</button>` : ''}</div>
        ${current.extra.length ? html`<dl class="qcard__extra">${current.extra.map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`)}</dl>` : ''}
      </div>`;

    if (current.mode === 'mc') {
      return html`
        <div class="options options--done">
          ${current.options.map((opt, i) => html`<div class="option ${opt === current.correct ? 'is-correct' : i === attempt.choice ? 'is-wrong' : 'is-dim'}"><kbd>${i + 1}</kbd><span>${opt}</span>${opt === current.correct ? icon('check') : i === attempt.choice ? icon('x') : ''}</div>`)}
        </div>
        <p class="verdict verdict--${v}" role="status">${verdictText}</p>
        ${current.extra.length ? html`<dl class="qcard__extra">${current.extra.map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`)}</dl>` : ''}
        <button type="button" class="btn btn-primary btn-lg btn-block" data-rate="${attempt.suggested}">Continue <kbd>Enter</kbd></button>`;
    }

    let compare = '';
    if (current.mode === 'type' && attempt.typed.trim() && v !== 'correct') {
      const diff = v === 'close' ? diffChars(attempt.typed.trim(), current.answer) : null;
      compare = html`<div class="compare">
        <span class="compare__label">You wrote</span>
        <span class="compare__text">${diff ? diff.filter(d => d.type !== 'missing').map(d => d.type === 'extra' ? html`<del>${d.text}</del>` : d.text) : html`<del>${attempt.typed.trim()}</del>`}</span>
      </div>`;
    }
    const preview = previewAll(current.card.srs, Date.now(), retention);
    const now = Date.now();
    return html`
      ${current.mode !== 'flip' ? html`<p class="verdict verdict--${v}" role="status">${verdictText}</p>` : ''}
      ${compare}
      ${answerBlock}
      ${current.mode === 'type' && (v === 'wrong' || v === 'close') ? html`<button type="button" class="link-btn" data-action="override">I was right — count it</button>` : ''}
      ${current.mode === 'flip' ? html`<p class="verdict verdict--flip">${verdictText}</p>` : ''}
      <div class="ratings" role="group" aria-label="Rate how well you remembered">
        ${[1, 2, 3, 4].map(g => html`
          <button type="button" class="rating rating--${g} ${attempt.suggested === g ? 'is-suggested' : ''}" data-rate="${g}">
            <span class="rating__label"><kbd>${g}</kbd> ${RATING_LABELS[g]}</span>
            <span class="rating__ivl">${fmtInterval(preview[g].due - now)}</span>
          </button>`)}
      </div>`;
  }

  function keysHelp() {
    if (phase === 'ask' && current.mode === 'mc') return html`<span><kbd>1</kbd>–<kbd>${current.options.length}</kbd> choose</span><span><kbd>S</kbd> star</span><span><kbd>Z</kbd> undo</span>`;
    if (phase === 'ask' && current.mode === 'flip') return html`<span><kbd>Space</kbd> show answer</span><span><kbd>S</kbd> star</span><span><kbd>Z</kbd> undo</span>`;
    if (phase === 'ask') return html`<span><kbd>Enter</kbd> check</span><span><kbd>Esc</kbd> leave typing</span>`;
    return html`<span><kbd>Enter</kbd> ${current.mode === 'mc' ? 'continue' : 'suggested'}</span>${current.mode !== 'mc' ? html`<span><kbd>1</kbd>–<kbd>4</kbd> rate</span>` : ''}<span><kbd>S</kbd> star</span><span><kbd>Z</kbd> undo</span>`;
  }

  function focusDefault() {
    if (phase === 'ask' && current.mode === 'type') {
      const input = root.querySelector('#answerInput');
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    } else if (phase === 'ask' && current.mode === 'mc') {
      root.querySelector('.option')?.focus({ preventScroll: true });
    } else if (phase === 'ask') {
      root.querySelector('[data-action="show"]')?.focus({ preventScroll: true });
    } else {
      (root.querySelector('.rating.is-suggested') || root.querySelector('[data-rate]'))?.focus({ preventScroll: true });
    }
  }

  function emptyScreen() {
    const allStats = decks.map(d => deckStats(d));
    const nextDue = allStats.map(s => s.nextDue).filter(Boolean).sort((a, b) => a - b)[0];
    const total = allStats.reduce((n, s) => n + s.total, 0);
    const deckId = scope === 'all' ? null : encodeURIComponent(scope);
    return html`
      <div class="page"><div class="done">
        <div class="done__badge">${icon('check')}</div>
        <h1>${total ? 'All caught up' : 'No cards to study yet'}</h1>
        <p class="muted">${total ? html`Nothing is due right now${nextDue ? html` — next review ${fmtDue(nextDue)}` : ''}. Extra practice is fine; it won’t mess up your schedule.` : 'Add some cards to this deck first.'}</p>
        <div class="done__actions">
          ${total ? html`<a class="btn btn-primary btn-lg" href="#/study/${encodeURIComponent(scope)}?cram">${icon('zap')} Practice anyway</a>` : ''}
          ${deckId && total ? html`<a class="btn btn-lg" href="#/match/${deckId}">${icon('grid')} Play match</a>` : ''}
          ${!total && deckId ? html`<a class="btn btn-primary btn-lg" href="#/edit/${deckId}">${icon('edit')} Add cards</a>` : ''}
          <a class="btn btn-lg btn-ghost" href="${backHref}">Back</a>
        </div>
      </div></div>`;
  }

  function doneScreen() {
    const firstTries = [...stats.first.values()];
    const accuracy = firstTries.length ? Math.round(firstTries.filter(Boolean).length / firstTries.length * 100) : 0;
    const tricky = [...stats.again].map(key => {
      const [deckId, cardId] = key.split('\u0000');
      const deck = store.getDeck(deckId), card = store.getCard(deckId, cardId);
      return deck && card ? { deck, card, ...cardSides(deck, card) } : null;
    }).filter(Boolean);
    const freshPlan = plan();
    const allStats = decks.map(d => deckStats(store.getDeck(d.id) || d));
    const nextDue = allStats.map(s => s.nextDue).filter(Boolean).sort((a, b) => a - b)[0];
    return html`
      <div class="page"><div class="done">
        <div class="done__badge done__badge--party">${icon('trophy')}</div>
        <h1>Session complete</h1>
        <p class="muted">${title}</p>
        <dl class="done__stats">
          <div><dt>${icon('cards')} Cards</dt><dd>${stats.first.size}</dd></div>
          <div><dt>${icon('target')} First-try accuracy</dt><dd>${accuracy}%</dd></div>
          <div><dt>${icon('clock')} Time</dt><dd>${fmtDuration(Date.now() - stats.start)}</dd></div>
          <div><dt>${icon('sparkles')} New cards</dt><dd>${stats.introduced}</dd></div>
        </dl>
        ${nextDue ? html`<p class="muted">Next review ${fmtDue(nextDue)}. Coming back then is the fastest way to lock these in.</p>` : ''}
        ${tricky.length ? html`
          <div class="tricky">
            <h2>Tricky cards</h2>
            <ul>${tricky.slice(0, 8).map(t => html`<li><strong>${t.front}</strong><span>${t.back}</span></li>`)}</ul>
          </div>` : ''}
        <div class="done__actions">
          ${freshPlan.length ? html`<button type="button" class="btn btn-primary btn-lg" data-action="more">${icon('zap')} Keep going (${freshPlan.length})</button>` : ''}
          ${tricky.length ? html`<button type="button" class="btn btn-lg" data-action="tricky">${icon('flip')} Practice tricky cards</button>` : ''}
          <a class="btn btn-lg ${freshPlan.length || tricky.length ? 'btn-ghost' : 'btn-primary'}" href="${backHref}">Done</a>
        </div>
      </div></div>`;
  }

  // ---------- actions
  function check() {
    const input = root.querySelector('#answerInput');
    attempt.typed = input ? input.value : '';
    if (!attempt.typed.trim()) return reveal();
    const { verdict } = gradeAnswer(attempt.typed, current.answer, { accents: prefs.strictAccents });
    attempt.verdict = verdict;
    attempt.suggested = verdict === 'correct' ? (attempt.hintLevel ? Rating.Hard : Rating.Good) : verdict === 'close' ? Rating.Hard : Rating.Again;
    phase = 'feedback';
    draw();
  }

  function choose(index) {
    if (phase !== 'ask' || current.mode !== 'mc' || !current.options[index]) return;
    attempt.choice = index;
    const right = current.options[index] === current.correct;
    attempt.verdict = right ? 'correct' : 'wrong';
    attempt.suggested = right ? Rating.Good : Rating.Again;
    phase = 'feedback';
    draw();
    if (right && prefs.autoAdvance) autoTimer = setTimeout(() => rate(Rating.Good), 900);
  }

  function reveal() {
    attempt.verdict = 'revealed';
    attempt.suggested = Rating.Again;
    phase = 'feedback';
    draw();
  }

  function show() {
    attempt.verdict = 'flip';
    attempt.suggested = null;
    phase = 'feedback';
    draw();
  }

  function rate(g) {
    clearTimeout(autoTimer);
    if (phase !== 'feedback' || !current) return;
    const { item, card } = current;
    const prev = card.srs ? { ...card.srs } : null;
    const now = Date.now();
    const nextSrs = schedule(prev, g, now, retention);
    history.push({ item: { ...item, partial: item.partial }, prev, queue: [...queue], completed, stats: { reviews: stats.reviews, first: new Map(stats.first), again: new Set(stats.again), introduced: stats.introduced } });
    if (history.length > 50) history.shift();
    store.recordReview(item.deckId, item.cardId, nextSrs, { wasNew: !prev, ms: now - attempt.start });
    const key = `${item.deckId}\u0000${item.cardId}`;
    stats.reviews++;
    if (!prev) stats.introduced++;
    if (!stats.first.has(key)) stats.first.set(key, g >= Rating.Hard && attempt.verdict !== 'revealed');
    if (g === Rating.Again) stats.again.add(key);
    item.seen++;
    item.partial = g >= Rating.Good ? 0.5 : 0;
    if (nextSrs.due <= now + LEARN_AHEAD) {
      // Bring it back after a few other cards (sooner when it was missed).
      const gap = g === Rating.Again ? 3 + Math.floor(Math.random() * 2) : 6 + Math.floor(Math.random() * 3);
      queue.splice(Math.min(gap, queue.length), 0, item);
    } else {
      completed++;
    }
    next();
  }

  function undo() {
    const last = history.pop();
    if (!last) return;
    clearTimeout(autoTimer);
    store.restoreProgress(last.item.deckId, last.item.cardId, last.prev);
    queue = last.queue;
    completed = last.completed;
    Object.assign(stats, last.stats);
    queue.unshift(last.item);
    next();
    toast('Undid last answer', { timeout: 2000 });
  }

  // ---------- events
  const onClick = event => {
    const opt = event.target.closest('[data-option]');
    if (opt) return choose(Number(opt.dataset.option));
    const rateBtn = event.target.closest('[data-rate]');
    if (rateBtn) return rate(Number(rateBtn.dataset.rate));
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'hint') {
      attempt.typed = root.querySelector('#answerInput')?.value || '';
      attempt.hintLevel++;
      draw();
    } else if (action === 'reveal') {
      attempt.typed = root.querySelector('#answerInput')?.value || '';
      reveal();
    } else if (action === 'show') show();
    else if (action === 'override') {
      attempt.verdict = 'override';
      attempt.suggested = Rating.Good;
      draw();
    } else if (action === 'speak') speak(el.dataset.text === 'answer' ? current.answer : current.prompt);
    else if (action === 'star') toggleStar();
    else if (action === 'undo') undo();
    else if (action === 'more') { queue = plan(); completed = 0; Object.assign(stats, { reviews: 0, first: new Map(), again: new Set(), introduced: 0, start: Date.now() }); history.length = 0; next(); }
    else if (action === 'tricky') {
      setHandoff({ ids: [...stats.again].map(k => k.split('\u0000')[1]), title: `${title} · tricky cards` });
      go(`#/study/${encodeURIComponent(scope)}`, { replace: true });
    }
  };

  function toggleStar() {
    if (!current) return;
    store.setStar(current.item.deckId, current.item.cardId, !current.card.star);
    current.card = store.getCard(current.item.deckId, current.item.cardId) || current.card;
    const btn = root.querySelector('[data-action="star"]');
    btn?.classList.toggle('is-on', !!current.card.star);
    btn?.setAttribute('aria-pressed', current.card.star ? 'true' : 'false');
    toast(current.card.star ? 'Starred' : 'Unstarred', { timeout: 1500 });
  }

  const onSubmit = event => {
    if (event.target.matches('[data-answer]')) { event.preventDefault(); check(); }
  };

  const onKeydown = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const typing = isTypingTarget(event.target);
    if (event.key === 'Escape') {
      if (typing) { event.target.blur(); return; }
      go(backHref);
      return;
    }
    if (typing || phase === 'done' || phase === 'empty' || !current) return;
    const k = event.key.toLowerCase();
    if (k === 's') { event.preventDefault(); toggleStar(); return; }
    if (k === 'z') { event.preventDefault(); undo(); return; }
    if (phase === 'ask' && current.mode === 'mc' && /^[1-9]$/.test(k)) { event.preventDefault(); choose(Number(k) - 1); return; }
    if (phase === 'ask' && current.mode === 'flip' && (k === ' ' || k === 'enter')) { event.preventDefault(); show(); return; }
    if (phase === 'ask' && current.mode === 'type' && k.length === 1) { root.querySelector('#answerInput')?.focus(); return; }
    if (phase === 'feedback') {
      if (/^[1-4]$/.test(k) && current.mode !== 'mc') { event.preventDefault(); rate(Number(k)); return; }
      if (k === 'enter' || (k === ' ' && current.mode === 'mc')) {
        if (event.target.closest?.('[data-rate]') && k === 'enter') return; // native button press
        event.preventDefault();
        rate(attempt.suggested || Rating.Good);
      }
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKeydown);
  next();

  return () => {
    clearTimeout(autoTimer);
    document.body.classList.remove('focus-mode');
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    document.removeEventListener('keydown', onKeydown);
    window.speechSynthesis?.cancel();
    store.flush();
  };
}
