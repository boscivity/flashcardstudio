// Settings: appearance, study preferences, account and data.
import { html, render, icon, plural, toast, downloadFile, canSpeak } from '../ui.js?v=2.0.0';
import * as store from '../store.js?v=2.0.0';
import * as auth from '../auth.js?v=2.0.0';
import { VERSION } from '../config.js?v=2.0.0';
import { importFile } from './home.js?v=2.0.0';
import { applyTheme } from '../theme-switch.js?v=2.0.0';

export function settingsView({ root }) {
  const draw = () => {
    const p = store.prefs();
    const { user, sync } = store.state;
    render(root, html`
    <div class="page narrow settings">
      <h1>Settings</h1>

      <section class="panel">
        <h2>Appearance</h2>
        <fieldset class="segmented segmented--icons">
          <legend>Theme</legend>
          ${[['system', 'System', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, ic]) => html`
            <label><input type="radio" name="theme" value="${v}" ${p.theme === v ? 'checked' : ''}><span>${icon(ic)} ${l}</span></label>`)}
        </fieldset>
      </section>

      <section class="panel">
        <h2>Studying</h2>
        <div class="setting">
          <div><strong>Memory target</strong><p class="muted small">How sure you want to be that you’ll remember a card when it comes back. Higher means more frequent reviews.</p></div>
          <select name="retention">${[[0.8, '80% · fewer reviews'], [0.85, '85%'], [0.9, '90% · recommended'], [0.95, '95% · most reviews']].map(([v, l]) => html`<option value="${v}" ${p.retention === v ? 'selected' : ''}>${l}</option>`)}</select>
        </div>
        <div class="setting">
          <div><strong>New cards per session</strong><p class="muted small">Learning a few at a time sticks better than cramming.</p></div>
          <select name="newPerSession">${[5, 10, 15, 20, 30, 50, 100].map(n => html`<option value="${n}" ${p.newPerSession === n ? 'selected' : ''}>${n}</option>`)}</select>
        </div>
        <label class="setting setting--toggle">
          <div><strong>Auto-advance</strong><p class="muted small">Move on automatically after a correct multiple-choice answer.</p></div>
          <input type="checkbox" class="switch" name="autoAdvance" ${p.autoAdvance ? 'checked' : ''}>
        </label>
        <label class="setting setting--toggle">
          <div><strong>Strict accents</strong><p class="muted small">Count “é” and “e” as different letters when grading typed answers.</p></div>
          <input type="checkbox" class="switch" name="strictAccents" ${p.strictAccents ? 'checked' : ''}>
        </label>
        ${canSpeak() ? html`<label class="setting setting--toggle">
          <div><strong>Read questions aloud</strong><p class="muted small">Uses your device’s text-to-speech voice.</p></div>
          <input type="checkbox" class="switch" name="autoSpeak" ${p.autoSpeak ? 'checked' : ''}>
        </label>` : ''}
      </section>

      <section class="panel">
        <h2>Account</h2>
        ${user ? html`
          <div class="setting">
            <div><strong>${user.email}</strong><p class="muted small">${syncText(sync)}</p></div>
            <button type="button" class="btn" data-action="sync">${icon('cloud')} Sync now</button>
          </div>
          <form class="stack" data-password>
            <h3>Change password</h3>
            <label class="field"><span class="field__label">Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
            <label class="field"><span class="field__label">New password</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
            <label class="field"><span class="field__label">Confirm new password</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>
            <p class="form-status" data-status role="status" hidden></p>
            <button type="submit" class="btn">Update password</button>
          </form>
          <button type="button" class="btn btn-ghost" data-action="logout">${icon('logout')} Log out</button>
        ` : html`
          <p class="muted">You’re studying as a guest. Your decks are saved in this browser only.</p>
          <div class="row"><a class="btn btn-primary" href="#/signup">Create free account</a><a class="btn" href="#/login">Log in</a></div>
        `}
      </section>

      <section class="panel">
        <h2>Your data</h2>
        <div class="setting">
          <div><strong>Backup</strong><p class="muted small">Download all ${plural(store.state.decks.length, 'deck')}, including study progress, as a JSON file.</p></div>
          <button type="button" class="btn" data-action="backup" ${store.state.decks.length ? '' : 'disabled'}>${icon('download')} Download</button>
        </div>
        <div class="setting">
          <div><strong>Import</strong><p class="muted small">Add decks from a backup (.json), CSV/TSV, or a text file of term – definition lines.</p></div>
          <button type="button" class="btn" data-action="import">${icon('upload')} Import</button>
        </div>
      </section>

      <section class="panel">
        <h2>Keyboard shortcuts</h2>
        <dl class="shortcuts">
          <div><dt><kbd>Enter</kbd></dt><dd>Check answer / continue</dd></div>
          <div><dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Pick a choice, or rate Again / Hard / Good / Easy</dd></div>
          <div><dt><kbd>Space</kbd></dt><dd>Flip card / show answer</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Star the current card</dd></div>
          <div><dt><kbd>Z</kbd></dt><dd>Undo the last answer</dd></div>
          <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next flashcard</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>Leave the answer box, then leave the session</dd></div>
        </dl>
      </section>

      <p class="muted small center">Flashcard Studio v${VERSION} · Scheduling by <a href="https://github.com/open-spaced-repetition" target="_blank" rel="noopener">FSRS</a></p>
    </div>`);
  };

  const syncText = sync => ({
    idle: store.hasPendingChanges() ? 'Changes waiting to sync' : 'All changes synced',
    loading: 'Syncing…', saving: 'Saving…',
    offline: 'Offline — changes will sync when you reconnect',
    error: 'Sync problem — we’ll keep retrying'
  })[sync] || '';

  const onChange = event => {
    const t = event.target;
    if (t.name === 'theme') { store.setPref('theme', t.value); applyTheme(t.value); }
    else if (t.name === 'retention') store.setPref('retention', Number(t.value));
    else if (t.name === 'newPerSession') store.setPref('newPerSession', Number(t.value));
    else if (['autoAdvance', 'strictAccents', 'autoSpeak'].includes(t.name)) store.setPref(t.name, t.checked);
    else return;
    toast('Saved', { timeout: 1200 });
  };

  const onClick = async event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'backup') {
      downloadFile(`flashcard-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportAll(), null, 2), 'application/json');
    } else if (action === 'import') importFile();
    else if (action === 'sync') {
      el.disabled = true;
      await store.flush();
      await store.refresh();
      el.disabled = false;
      toast(store.state.sync === 'idle' ? 'Synced' : 'Could not reach the sync server', { tone: store.state.sync === 'idle' ? '' : 'error' });
    } else if (action === 'logout') {
      el.disabled = true;
      await store.flush().catch(() => {});
      await auth.signOut();
      store.signOutLocal();
      location.hash = '#/';
      toast('Logged out');
    }
  };

  const onSubmit = async event => {
    if (!event.target.matches('[data-password]')) return;
    event.preventDefault();
    const f = event.target;
    const status = f.querySelector('[data-status]');
    const say = (msg, tone) => { status.hidden = false; status.textContent = msg; status.dataset.tone = tone; };
    if (f.next.value.length < 8) return say('Your new password needs at least 8 characters.', 'error');
    if (f.next.value !== f.confirm.value) return say('The new passwords don’t match.', 'error');
    const button = f.querySelector('button');
    button.disabled = true;
    say('Updating…', 'info');
    try {
      await auth.verifyPassword(store.state.user.email, f.current.value);
    } catch {
      button.disabled = false;
      return say('Your current password is incorrect.', 'error');
    }
    try {
      await auth.updatePassword(f.next.value);
      f.reset();
      say('Password updated.', 'success');
    } catch (err) {
      say(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  const unsubscribe = store.subscribe(reason => {
    if ((reason === 'sync' || reason === 'decks') && !root.contains(document.activeElement?.closest('form'))) draw();
  });
  draw();
  return () => {
    unsubscribe();
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}
