// Landing page for new visitors and the dashboard for everyone with decks.
import { html, render, icon, plural, greeting, fmtDue, toast, pickFile, readText, dialog } from '../ui.js?v=2.0.2';
import * as store from '../store.js?v=2.0.2';
import { deckStats, dayIndex } from '../session.js?v=2.0.2';
import { SAMPLES, sampleDeck } from '../samples.js?v=2.0.2';
import { parseTable, parsePairs } from '../csv.js?v=2.0.2';
import { go, setHandoff } from '../nav.js?v=2.0.2';

export function homeView({ root }) {
  let query = '';

  const draw = () => {
    if (!store.state.ready) {
      render(root, html`<div class="page"><div class="skeleton skeleton--hero"></div><div class="deck-grid">${[1, 2, 3].map(() => html`<div class="skeleton skeleton--tile"></div>`)}</div></div>`);
      return;
    }
    if (!store.state.user && !store.state.decks.length) render(root, landing());
    else render(root, dashboard());
    const heat = root.querySelector('.heatmap');
    if (heat) heat.scrollLeft = heat.scrollWidth; // most recent weeks first on narrow screens
    root.querySelector('[data-search]')?.setAttribute('value', query);
  };

  const drawGrid = () => {
    const grid = root.querySelector('[data-grid]');
    if (grid) render(grid, deckGrid(query));
  };

  const onClick = async event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'sample') {
      el.disabled = true;
      try {
        const deck = await store.saveDeck(sampleDeck(el.dataset.sample, store.uuid));
        toast(`Added “${deck.name}”`);
        go(`#/study/${deck.id}`);
      } catch (err) {
        el.disabled = false;
        toast('Could not add that deck. Please try again.', { tone: 'error' });
      }
    } else if (action === 'import') {
      importFile();
    } else if (action === 'samples') {
      chooseSample();
    }
  };

  const onInput = event => {
    if (event.target.matches('[data-search]')) {
      query = event.target.value;
      drawGrid();
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  const unsubscribe = store.subscribe(reason => {
    if (reason === 'decks' || reason === 'sync') {
      const focused = document.activeElement?.matches?.('[data-search]');
      if (focused) drawGrid(); else draw();
    }
  });
  draw();
  return () => {
    unsubscribe();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
  };
}

function landing() {
  return html`
  <div class="landing">
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">${icon('sparkles')} Free · works offline · no ads</p>
        <h1 class="hero__title">Remember what you study.</h1>
        <p class="hero__lead">Flashcard Studio quizzes you right before you’d forget, so terms move into long-term memory with less time spent reviewing.</p>
        <div class="hero__cta">
          <a class="btn btn-primary btn-lg" href="#/new">${icon('plus')} Create a deck</a>
          <button type="button" class="btn btn-lg" data-action="samples">${icon('play')} Try a sample deck</button>
        </div>
        <p class="hero__note">No account needed. <a href="#/signup">Sign up free</a> to sync between devices, or <a href="#/login">log in</a>.</p>
      </div>
      <div class="hero__demo" aria-hidden="true">
        <div class="demo-card demo-card--back"></div>
        <div class="demo-card">
          <span class="demo-card__label">Definition → type the term</span>
          <p class="demo-card__prompt">Loss of electrons during a reaction.</p>
          <div class="demo-card__input">Oxidation<span class="demo-caret"></span></div>
          <div class="demo-card__verdict">${icon('check')} Correct</div>
          <div class="demo-card__ratings">
            <span>Again<b>1m</b></span><span>Hard<b>6m</b></span><span class="is-on">Good<b>10m</b></span><span>Easy<b>16d</b></span>
          </div>
        </div>
      </div>
    </section>

    <section class="features" aria-labelledby="featuresTitle">
      <h2 id="featuresTitle" class="section-title">Built around how memory works</h2>
      <div class="feature-grid">
        ${feature('zap', 'Spaced repetition', 'Each card is scheduled with FSRS, the modern open-source algorithm Anki uses, so reviews arrive just before you’d forget.')}
        ${feature('keyboard', 'Active recall', 'Type answers instead of just flipping. Small typos, accents and articles are forgiven, and missed cards come back sooner.')}
        ${feature('book', 'Learn step by step', 'New cards start as multiple choice, then move to typed recall once you know them.')}
        ${feature('test', 'Practice tests', 'Generate a mixed test (written, multiple choice, true/false) and see your score.')}
        ${feature('grid', 'Match game', 'Race the clock pairing terms with definitions. A quick warm-up before a test.')}
        ${feature('cloud', 'Everywhere you study', 'Works offline and installs like an app. Sign in to sync decks and progress across devices.')}
      </div>
    </section>

    <section class="samples" aria-labelledby="samplesTitle">
      <h2 id="samplesTitle" class="section-title">Start with a sample</h2>
      <div class="sample-grid">${SAMPLES.map(sampleTile)}</div>
    </section>

    <section class="cta-band">
      <h2>Bring your own terms</h2>
      <p>Paste a list from a doc or spreadsheet, or import CSV, and start studying in seconds.</p>
      <div class="hero__cta"><a class="btn btn-primary btn-lg" href="#/new">${icon('plus')} Create a deck</a><button type="button" class="btn btn-lg" data-action="import">${icon('upload')} Import a file</button></div>
    </section>
  </div>`;
}

const feature = (ic, title, text) => html`
  <article class="feature"><span class="feature__icon">${icon(ic)}</span><h3>${title}</h3><p>${text}</p></article>`;

const sampleTile = s => html`
  <button type="button" class="sample" data-action="sample" data-sample="${s.key}">
    <span class="sample__emoji" aria-hidden="true">${s.emoji}</span>
    <span class="sample__name">${s.name}</span>
    <span class="sample__meta">${plural(s.rows.length, 'card')} · ${s.columns.join(' → ')}</span>
  </button>`;

function dashboard() {
  const { user, decks, sync } = store.state;
  const now = Date.now();
  const stats = decks.map(d => ({ deck: d, s: deckStats(d, now) }));
  const due = stats.reduce((n, x) => n + x.s.due, 0);
  const fresh = stats.reduce((n, x) => n + x.s.new, 0);
  const mastered = stats.reduce((n, x) => n + x.s.mastered, 0);
  const total = stats.reduce((n, x) => n + x.s.total, 0);
  const nextDue = stats.map(x => x.s.nextDue).filter(Boolean).sort((a, b) => a - b)[0];
  const today = store.todayActivity();
  const streak = store.streak();
  const name = user?.email ? user.email.split('@')[0] : '';

  return html`
  <div class="page dashboard">
    ${!user ? html`<div class="banner">${icon('cloud')}<p>Your decks are saved in this browser. <a href="#/signup">Create a free account</a> to back them up and sync across devices.</p></div>` : ''}
    ${user && sync === 'offline' ? html`<div class="banner banner--warn">${icon('wifiOff')}<p>Can’t reach the sync server. You can keep studying — progress is saved here and will sync when the connection is back.</p></div>` : ''}
    ${user && sync === 'error' ? html`<div class="banner banner--warn">${icon('cloudOff')}<p>Sync hit a problem. Your progress is saved on this device; we’ll retry automatically.</p></div>` : ''}
    ${store.state.storageFull ? html`<div class="banner banner--warn">${icon('cloudOff')}<p>This browser’s storage is full, so progress may not be saved here. Sign in to keep it in your account.</p></div>` : ''}

    <section class="dash-head">
      <div>
        <h1 class="dash-head__title">${greeting()}${name ? html`, <span class="dash-head__name">${name}</span>` : ''}</h1>
        <p class="muted">${total ? html`${plural(decks.length, 'deck')} · ${plural(total, 'card')} · ${plural(mastered, 'card')} mastered` : 'Create a deck to get started.'}</p>
      </div>
      <dl class="stat-row">
        <div class="stat ${streak ? 'stat--hot' : ''}"><dt>${icon('flame')} Streak</dt><dd>${plural(streak, 'day')}</dd></div>
        <div class="stat"><dt>${icon('check')} Today</dt><dd>${plural(today.r, 'review')}</dd></div>
      </dl>
    </section>

    ${total ? html`
    <section class="today ${due ? 'today--due' : ''}">
      <div class="today__text">
        ${due
          ? html`<h2>${plural(due, 'card')} ready to review</h2><p>Reviewing now keeps them fresh. It takes about ${Math.max(1, Math.round(due * 8 / 60))} min.</p>`
          : html`<h2>You’re all caught up ${icon('check')}</h2><p>${nextDue ? html`Next review ${fmtDue(nextDue, now)}.` : 'Nothing scheduled yet.'} ${fresh ? html`You have ${plural(fresh, 'new card')} to learn.` : ''}</p>`}
      </div>
      <div class="today__actions">
        ${due ? html`<a class="btn btn-primary btn-lg" href="#/study/all">${icon('zap')} Review all</a>` : ''}
        ${!due && fresh ? html`<a class="btn btn-primary btn-lg" href="#/study/all">${icon('book')} Learn new cards</a>` : ''}
      </div>
    </section>` : ''}

    <section class="decks" aria-labelledby="decksTitle">
      <div class="section-head">
        <h2 id="decksTitle" class="section-title">Your decks</h2>
        <div class="section-head__tools">
          ${decks.length > 4 ? html`<label class="search">${icon('search')}<span class="sr-only">Search decks</span><input type="search" data-search placeholder="Search decks" autocomplete="off"></label>` : ''}
          <button type="button" class="btn" data-action="import">${icon('upload')}<span>Import</span></button>
          <a class="btn btn-primary" href="#/new">${icon('plus')}<span>New deck</span></a>
        </div>
      </div>
      <div class="deck-grid" data-grid>${deckGrid('')}</div>
    </section>

    ${total ? heatmap() : ''}
  </div>`;
}

function deckGrid(query) {
  const now = Date.now();
  const q = query.trim().toLowerCase();
  const decks = store.state.decks.filter(d => !q || d.name.toLowerCase().includes(q));
  if (!store.state.decks.length) {
    return html`
      <div class="empty">
        <div class="empty__art" aria-hidden="true">${icon('cards')}</div>
        <h3>No decks yet</h3>
        <p>Create a deck, import a file, or start with a sample.</p>
        <div class="sample-grid sample-grid--compact">${SAMPLES.map(sampleTile)}</div>
      </div>`;
  }
  if (!decks.length) return html`<p class="muted empty-search">No decks match “${query}”.</p>`;
  return decks.map(deck => {
    const s = deckStats(deck, now);
    const pct = n => (s.total ? (n / s.total) * 100 : 0);
    return html`
      <article class="deck-tile">
        <a class="deck-tile__link" href="#/deck/${encodeURIComponent(deck.id)}">
          <h3 class="deck-tile__name">${deck.name}</h3>
          <p class="deck-tile__meta">${plural(s.total, 'card')}${s.mastered ? html` · ${Math.round(pct(s.mastered))}% mastered` : ''}</p>
          <div class="mastery" role="img" aria-label="${s.mastered} mastered, ${s.reviewing} reviewing, ${s.learning} learning, ${s.new} new">
            <span class="mastery__seg mastery__seg--mastered" style="width:${pct(s.mastered)}%"></span>
            <span class="mastery__seg mastery__seg--reviewing" style="width:${pct(s.reviewing)}%"></span>
            <span class="mastery__seg mastery__seg--learning" style="width:${pct(s.learning)}%"></span>
          </div>
        </a>
        <div class="deck-tile__foot">
          ${s.due ? html`<span class="chip chip--due">${s.due} due</span>` : s.new ? html`<span class="chip">${s.new} new</span>` : html`<span class="chip chip--ok">${icon('check')} Done</span>`}
          <a class="btn btn-sm ${s.due || s.new ? 'btn-primary' : ''}" href="#/study/${encodeURIComponent(deck.id)}">${s.due || s.new ? 'Study' : 'Practice'}</a>
        </div>
      </article>`;
  });
}

function heatmap() {
  const act = store.activity();
  const today = dayIndex(Date.now());
  const weeks = 52;
  const todayDow = new Date(today * 86400000).getUTCDay();
  const start = today - todayDow - (weeks - 1) * 7;
  const cells = [];
  let total = 0, activeDays = 0;
  for (let d = start; d <= today; d++) {
    const r = act[d]?.r || 0;
    total += r;
    if (r) activeDays++;
    const level = r === 0 ? 0 : r < 10 ? 1 : r < 30 ? 2 : r < 60 ? 3 : 4;
    const label = `${new Date(d * 86400000).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })}: ${plural(r, 'review')}`;
    cells.push(html`<span class="heat heat--${level} ${d === today ? 'heat--today' : ''}" title="${label}"></span>`);
  }
  return html`
    <section class="activity" aria-labelledby="activityTitle">
      <div class="section-head"><h2 id="activityTitle" class="section-title">Activity</h2><p class="muted">${plural(total, 'review')} on ${plural(activeDays, 'day')} in the last year</p></div>
      <div class="heatmap" role="img" aria-label="Daily review activity for the last year">${cells}</div>
    </section>`;
}

async function chooseSample() {
  const key = await dialog({
    title: 'Try a sample deck',
    body: html`<p class="muted">Pick one to add to your decks. You can delete it any time.</p>`,
    actions: [...SAMPLES.map(s => ({ label: `${s.emoji} ${s.name}`, value: s.key })), { label: 'Cancel', value: null }],
    wide: true
  });
  if (!key) return;
  try {
    const deck = await store.saveDeck(sampleDeck(key, store.uuid));
    go(`#/study/${deck.id}`);
  } catch {
    toast('Could not add that deck. Please try again.', { tone: 'error' });
  }
}

export async function importFile() {
  const file = await pickFile('.csv,.tsv,.txt,.json,text/csv,text/plain,application/json');
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('That file is larger than 5 MB.');
    const text = await readText(file);
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const baseName = stem ? stem[0].toUpperCase() + stem.slice(1) : 'Imported deck';
    if (/\.json$/i.test(file.name)) {
      const data = JSON.parse(text);
      const decks = Array.isArray(data) ? data : data?.decks;
      if (!Array.isArray(decks) || !decks.length) throw new Error('No decks found in that file.');
      for (const d of decks) await store.saveDeck(store.normalizeDeck({ ...d, id: store.uuid() }));
      toast(`Imported ${plural(decks.length, 'deck')}`);
      return;
    }
    let columns, rows;
    if (/\.txt$/i.test(file.name) && !text.includes('\t')) {
      const { pairs } = parsePairs(text);
      if (!pairs.length) throw new Error('Put one term and definition per line, separated by a tab, “ - ”, “ | ” or a comma.');
      columns = ['Term', 'Definition'];
      rows = pairs.map(([a, b]) => ({ Term: a, Definition: b }));
    } else {
      ({ columns, rows } = parseTable(text));
    }
    if (!rows.length) throw new Error('No cards found in that file.');
    setHandoff({
      draft: {
        id: store.uuid(),
        name: baseName,
        columns,
        templates: { front: `{{${columns[0]}}}`, back: `{{${columns[1] || columns[0]}}}`, hint: columns[2] && /hint/i.test(columns[2]) ? `{{${columns[2]}}}` : '' },
        cards: rows.map(data => ({ id: store.uuid(), data }))
      }
    });
    go('#/new');
  } catch (err) {
    toast(err.message || 'Could not import that file.', { tone: 'error', timeout: 6000 });
  }
}
