// App shell: routing, top bar, auth state and service worker.
import { html, render, icon, plural, toast, dialog } from './ui.js?v=2.0.2';
import * as store from './store.js?v=2.0.2';
import * as auth from './auth.js?v=2.0.2';
import { VERSION } from './config.js?v=2.0.2';
import { applyTheme } from './theme-switch.js?v=2.0.2';
import { getGuard, go } from './nav.js?v=2.0.2';
import { homeView } from './views/home.js?v=2.0.2';
import { deckView } from './views/deck.js?v=2.0.2';
import { editorView } from './views/editor.js?v=2.0.2';
import { studyView } from './views/study.js?v=2.0.2';
import { flashcardsView } from './views/flashcards.js?v=2.0.2';
import { testView } from './views/test.js?v=2.0.2';
import { matchView } from './views/match.js?v=2.0.2';
import { settingsView } from './views/settings.js?v=2.0.2';
import { authView } from './views/auth.js?v=2.0.2';

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');

const ROUTES = [
  [/^\/?$/, homeView, 'Flashcard Studio'],
  [/^\/deck\/([^/]+)$/, deckView, 'Deck'],
  [/^\/new$/, editorView, 'New deck'],
  [/^\/edit\/([^/]+)$/, editorView, 'Edit deck'],
  [/^\/study\/([^/]+)$/, studyView, 'Study'],
  [/^\/cards\/([^/]+)$/, flashcardsView, 'Flashcards'],
  [/^\/test\/([^/]+)$/, testView, 'Test'],
  [/^\/match\/([^/]+)$/, matchView, 'Match'],
  [/^\/settings$/, settingsView, 'Settings'],
  [/^\/login$/, authView('login'), 'Log in'],
  [/^\/signup$/, authView('signup'), 'Sign up'],
  [/^\/forgot$/, authView('forgot'), 'Reset password'],
  [/^\/reset$/, authView('reset'), 'New password']
];
// Hashes used by earlier versions.
const LEGACY = { '#home': '#/', '#app': '#/', '#login': '#/login', '#signup': '#/signup', '#settings': '#/settings' };

let cleanup = null;
let currentHash = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(qs) };
}

async function route({ reload = false } = {}) {
  if (LEGACY[location.hash]) { history.replaceState(null, '', LEGACY[location.hash]); }
  if (/access_token=|error_description=|type=recovery/.test(location.hash)) return; // Supabase is reading its redirect.
  if (location.hash === currentHash && !reload) return;
  const guard = getGuard();
  if (guard && currentHash !== null && !reload) {
    const ok = await guard();
    if (!ok) { history.replaceState(null, '', currentHash); return; }
  }
  const { path, query } = parseHash();
  // Account pages make no sense once signed in.
  if (store.state.user && /^\/(login|signup|forgot)$/.test(path)) { history.replaceState(null, '', '#/'); return route(); }
  let match = null;
  for (const [re, fn, title] of ROUTES) {
    const m = re.exec(path);
    if (m) { match = { fn, title, params: m.slice(1) }; break; }
  }
  if (!match) { history.replaceState(null, '', '#/'); return route(); }
  try { cleanup?.(); } catch (err) { console.error(err); }
  cleanup = null;
  currentHash = location.hash || '#/';
  document.body.classList.remove('focus-mode');
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    cleanup = match.fn({ root: view, params: match.params, query }) || null;
  } catch (err) {
    console.error(err);
    render(view, html`<div class="page"><div class="empty"><h2>Something went wrong</h2><p class="muted">${String(err.message || err)}</p><a class="btn btn-primary" href="#/">Go home</a></div></div>`);
  }
  const deckName = match.params[0] && store.getDeck(decodeURIComponent(match.params[0]))?.name;
  document.title = deckName ? `${deckName} · ${match.title} · Flashcard Studio` : match.title === 'Flashcard Studio' ? 'Flashcard Studio — remember what you study' : `${match.title} · Flashcard Studio`;
  drawTopbar();
  if (!document.body.classList.contains('focus-mode') && document.activeElement === document.body) view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => route());
window.addEventListener('fcs:reload-route', () => route({ reload: true }));

// ---------- top bar
function drawTopbar() {
  const { user, sync, decks } = store.state;
  const path = parseHash().path;
  const streak = decks.length ? store.streak() : 0;
  const syncIcon = sync === 'offline' || sync === 'error' ? 'cloudOff' : 'cloud';
  const syncLabel = { idle: 'Synced', loading: 'Syncing…', saving: 'Saving…', offline: 'Offline', error: 'Sync issue' }[sync];
  render(topbar, html`
    <div class="topbar__inner">
      <a class="brand" href="#/" aria-label="Flashcard Studio home">
        <img src="assets/img/icon-192.png" alt="" width="32" height="32"><span>Flashcard Studio</span>
      </a>
      <nav class="topbar__nav" aria-label="Main">
        ${streak ? html`<span class="streak" title="${plural(streak, 'day')} in a row">${icon('flame')}<b>${streak}</b><span class="sr-only"> day streak</span></span>` : ''}
        ${user ? html`<span class="sync sync--${sync}" title="${syncLabel}">${icon(syncIcon)}<span class="sync__label">${syncLabel}</span></span>` : ''}
        <a class="btn btn-ghost ${path === '/' ? 'is-current' : ''}" href="#/" ${path === '/' ? 'aria-current="page"' : ''}>${icon('cards')}<span class="hide-sm">Decks</span></a>
        <a class="btn btn-ghost btn-icon-sm ${path === '/settings' ? 'is-current' : ''}" href="#/settings" aria-label="Settings" ${path === '/settings' ? 'aria-current="page"' : ''}>${icon('sliders')}<span class="hide-sm">Settings</span></a>
        ${user ? '' : html`<a class="btn ${path === '/login' ? 'is-current' : ''}" href="#/login">Log in</a><a class="btn btn-primary hide-xs" href="#/signup">Sign up</a>`}
      </nav>
    </div>`);
}
store.subscribe(reason => { if (reason === 'sync' || reason === 'decks') drawTopbar(); });

// ---------- auth
let guestPromptShown = false;
async function offerGuestImport() {
  const decks = store.guestDecks();
  if (!decks.length || guestPromptShown || !store.state.user) return;
  guestPromptShown = true;
  const choice = await dialog({
    title: 'Add your decks to this account?',
    body: html`<p>You have ${plural(decks.length, 'deck')} saved in this browser from before you logged in:</p>
      <ul class="plain-list">${decks.slice(0, 6).map(d => html`<li>${d.name} <span class="muted">· ${plural(d.cards.length, 'card')}</span></li>`)}${decks.length > 6 ? html`<li class="muted">…and ${decks.length - 6} more</li>` : ''}</ul>`,
    actions: [{ label: 'Not now', value: 'later' }, { label: 'Discard them', value: 'discard', danger: true }, { label: 'Add to my account', value: 'import', primary: true }],
    dismissValue: 'later'
  });
  if (choice === 'import') {
    try {
      const n = await store.importGuestDecks();
      toast(`Added ${plural(n, 'deck')} to your account`);
    } catch {
      toast('Could not move your decks right now. We’ll ask again next time.', { tone: 'error' });
      guestPromptShown = false;
    }
  } else if (choice === 'discard') {
    store.discardGuestDecks();
  }
}

async function onSignedIn(user) {
  const onAuthPage = /^#\/(login|signup|forgot)/.test(location.hash);
  if (store.state.user?.id !== user.id) {
    const loading = store.loadCloud(user);
    if (onAuthPage) go('#/', { replace: true });
    await loading;
  } else {
    store.state.user = user;
    if (onAuthPage) go('#/', { replace: true });
  }
  drawTopbar();
  offerGuestImport();
}

auth.onAuthChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session?.user) {
    onSignedIn(session.user).then(() => go('#/reset', { replace: true }));
  } else if (event === 'SIGNED_IN' && session?.user) {
    if (store.state.user?.id !== session.user.id) {
      toast(`Signed in as ${session.user.email}`);
      onSignedIn(session.user);
    }
  } else if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
    store.state.user = session.user;
  } else if (event === 'SIGNED_OUT' && store.state.user) {
    store.signOutLocal();
    go('#/', { replace: true });
  }
});

// ---------- boot
async function boot() {
  applyTheme(store.prefs().theme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(store.prefs().theme));
  document.querySelector('.version').textContent = `v${VERSION}`;
  store.attachClient(auth.client);
  drawTopbar();

  const redirect = /access_token=|error_description=|type=recovery/.test(location.hash);
  if (/error_description=/.test(location.hash)) {
    const message = new URLSearchParams(location.hash.slice(1)).get('error_description');
    if (message) setTimeout(() => toast(message.replace(/\+/g, ' '), { tone: 'error', timeout: 8000 }), 300);
  }
  let user = null;
  let unreachable = false;
  try {
    user = (await auth.getSession(redirect ? 10000 : 3000))?.user || null;
  } catch {
    // Slow or unreachable server: fall back to the account saved on this device.
    user = auth.cachedUser();
    unreachable = true;
  }
  if (user) store.loadCloud(user, { timeout: unreachable ? 4000 : undefined }).then(offerGuestImport);
  else store.loadGuest();

  if (redirect) {
    const recovery = /type=recovery/.test(location.hash);
    history.replaceState(null, '', recovery ? '#/reset' : '#/');
  }
  route();
}

// ---------- service worker (offline support)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
  });
}

boot();
