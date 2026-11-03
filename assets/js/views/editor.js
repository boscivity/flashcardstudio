// Create / edit a deck: quick term-definition rows, bulk paste, and optional custom fields.
import { html, render, icon, plural, toast, confirmDialog } from '../ui.js?v=2.0.2';
import * as store from '../store.js?v=2.0.2';
import { parsePairs, detectSeparator } from '../csv.js?v=2.0.2';
import { renderTemplate } from '../session.js?v=2.0.2';
import { go, setGuard, takeHandoff } from '../nav.js?v=2.0.2';

const blankCard = columns => ({ id: store.uuid(), data: Object.fromEntries(columns.map(c => [c, ''])) });

export function editorView({ root, params }) {
  const editingId = params[0] ? decodeURIComponent(params[0]) : null;
  const handoff = editingId ? null : takeHandoff();
  let draft;
  if (editingId) {
    const deck = store.getDeck(editingId);
    if (!deck) {
      render(root, html`<div class="page"><div class="empty"><h2>Deck not found</h2><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`);
      return () => {};
    }
    draft = structuredClone(deck);
  } else {
    draft = handoff?.draft ? store.normalizeDeck(handoff.draft) : {
      id: store.uuid(), name: '', columns: ['Term', 'Definition'],
      templates: { front: '{{Term}}', back: '{{Definition}}', hint: '' }, cards: []
    };
    if (!draft.cards.length) draft.cards = [1, 2, 3].map(() => blankCard(draft.columns));
  }
  let dirty = !!handoff?.draft;
  let saving = false;
  const markDirty = () => { dirty = true; };

  function draw() {
    render(root, html`
    <form class="page editor" novalidate data-editor>
      <div class="editor__bar">
        <a class="back-link" href="${editingId ? `#/deck/${encodeURIComponent(editingId)}` : '#/'}">${icon('back')} Cancel</a>
        <h1 class="editor__title">${editingId ? 'Edit deck' : 'New deck'}</h1>
        <button type="submit" class="btn btn-primary" data-save>${icon('check')}<span>Save</span></button>
      </div>

      <label class="field field--title">
        <span class="field__label">Title</span>
        <input name="title" value="${draft.name}" placeholder="e.g. Biology chapter 5" maxlength="120" autocomplete="off" required>
        <span class="field__error" data-error="title" hidden>Give your deck a name.</span>
      </label>

      <details class="panel" data-bulk>
        <summary>${icon('upload')} Paste a list</summary>
        <div class="bulk">
          <p class="muted small">One card per line. Separate the term and definition with a tab, “ - ”, “ | ”, “: ” or a comma. Copying two columns from a spreadsheet works too.</p>
          <textarea data-bulk-text rows="6" placeholder="Osmosis - Movement of water across a membrane&#10;Diffusion - Movement from high to low concentration"></textarea>
          <div class="bulk__foot"><span class="muted small" data-bulk-info></span><button type="button" class="btn" data-action="bulk-add">${icon('plus')} Add cards</button></div>
        </div>
      </details>

      <ol class="edit-list" data-rows>${rows()}</ol>
      <button type="button" class="btn btn-block btn-dashed" data-action="add">${icon('plus')} Add card</button>
      <p class="field__error" data-error="cards" hidden></p>

      <details class="panel advanced" ${draft.columns.length > 2 || draft.templates.hint ? 'open' : ''}>
        <summary>${icon('sliders')} Fields &amp; card layout</summary>
        <div class="advanced__body" data-advanced>${advanced()}</div>
      </details>

      <div class="editor__footer">
        <span class="muted small" data-count>${countLabel()}</span>
        <button type="submit" class="btn btn-primary btn-lg">${icon('check')} Save deck</button>
      </div>
    </form>`);
    autosizeAll();
  }

  const isEmpty = card => draft.columns.every(c => !String(card.data[c] || '').trim());
  const countLabel = () => plural(draft.cards.filter(c => !isEmpty(c)).length, 'card');

  function rows() {
    const cols = draft.columns;
    return draft.cards.map((card, i) => html`
      <li class="edit-card" data-card="${card.id}">
        <span class="edit-card__num" aria-hidden="true">${i + 1}</span>
        <div class="edit-card__fields" style="--cols:${Math.min(cols.length, 3)}">
          ${cols.map(col => html`
            <label class="field">
              <span class="field__label">${col}</span>
              <textarea rows="1" data-col="${col}" data-card-id="${card.id}" aria-label="${col} for card ${i + 1}">${card.data[col] ?? ''}</textarea>
            </label>`)}
        </div>
        <button type="button" class="btn btn-icon btn-ghost" data-remove="${card.id}" aria-label="Delete card ${i + 1}">${icon('trash')}</button>
      </li>`);
  }

  function advanced() {
    return html`
      <p class="muted small">Fields are the columns each card has. The layout decides what shows on each side — use <code>{{Field}}</code> to insert a field.</p>
      <div class="chips" data-fields>
        ${draft.columns.map(col => html`<span class="chip chip--field">${col}${draft.columns.length > 1 ? html`<button type="button" data-remove-field="${col}" aria-label="Remove field ${col}">${icon('x')}</button>` : ''}</span>`)}
      </div>
      <div class="inline-form">
        <input data-new-field placeholder="New field, e.g. Example" maxlength="40" aria-label="New field name">
        <button type="button" class="btn" data-action="add-field">${icon('plus')} Add field</button>
      </div>
      <div class="template-grid">
        <label class="field"><span class="field__label">Front (question)</span><input data-template="front" value="${draft.templates.front}"></label>
        <label class="field"><span class="field__label">Back (answer)</span><input data-template="back" value="${draft.templates.back}"></label>
        <label class="field"><span class="field__label">Hint (optional)</span><input data-template="hint" value="${draft.templates.hint}" placeholder="e.g. {{Hint}}"></label>
      </div>
      <span class="field__error" data-error="templates" hidden></span>
      <button type="button" class="btn btn-sm" data-action="swap">${icon('swap')} Swap front and back</button>`;
  }

  function redrawRows(focusCardId) {
    render(root.querySelector('[data-rows]'), rows());
    autosizeAll();
    updateCount();
    if (focusCardId) root.querySelector(`[data-card="${CSS.escape(focusCardId)}"] textarea`)?.focus();
  }
  const redrawAdvanced = () => render(root.querySelector('[data-advanced]'), advanced());
  const updateCount = () => { const el = root.querySelector('[data-count]'); if (el) el.textContent = countLabel(); };

  const autosize = ta => {
    if (CSS.supports?.('field-sizing', 'content')) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  };
  const autosizeAll = () => root.querySelectorAll('.edit-card textarea').forEach(autosize);

  function addCards(pairs, afterId) {
    const [a, b] = draft.columns;
    const cards = pairs.map(([x, y]) => { const c = blankCard(draft.columns); c.data[a] = x; if (b) c.data[b] = y; return c; });
    let index;
    if (afterId) {
      index = draft.cards.findIndex(c => c.id === afterId);
      // Pasting into an empty row replaces that row.
      if (index >= 0 && isEmpty(draft.cards[index])) draft.cards.splice(index--, 1);
    } else {
      // Appending fills the empty rows at the end instead of leaving gaps.
      while (draft.cards.length && isEmpty(draft.cards[draft.cards.length - 1])) draft.cards.pop();
      index = draft.cards.length - 1;
    }
    draft.cards.splice(index + 1, 0, ...cards);
    markDirty();
    redrawRows();
    return cards.length;
  }

  function showError(name, message) {
    const el = root.querySelector(`[data-error="${name}"]`);
    if (!el) return;
    el.hidden = !message;
    if (message) el.textContent = message;
  }

  async function save() {
    if (saving) return;
    showError('title', ''); showError('cards', ''); showError('templates', '');
    draft.name = root.querySelector('[name="title"]').value.trim();
    const cards = draft.cards.filter(c => !isEmpty(c)).map(c => ({ ...c, data: Object.fromEntries(draft.columns.map(col => [col, String(c.data[col] ?? '').trim()])) }));
    let ok = true;
    if (!draft.name) { showError('title', 'Give your deck a name.'); root.querySelector('[name="title"]').focus(); ok = false; }
    if (!draft.templates.front.trim() || !draft.templates.back.trim()) {
      showError('templates', 'The front and back layouts can’t be empty.');
      root.querySelector('.advanced').open = true;
      ok = false;
    }
    const complete = cards.filter(c => renderTemplate(draft.templates.front, c.data) && renderTemplate(draft.templates.back, c.data));
    if (ok && !complete.length) {
      showError('cards', `Add at least one card with both a ${draft.columns[0]} and a ${draft.columns[1] || 'back'}.`);
      root.querySelector('.edit-card textarea')?.focus();
      ok = false;
    }
    if (!ok) return;
    saving = true;
    root.querySelectorAll('[type="submit"]').forEach(b => { b.disabled = true; });
    try {
      const saved = await store.saveDeck({ ...draft, cards });
      dirty = false;
      const incomplete = cards.length - complete.length;
      const offline = store.state.user && store.state.sync === 'offline';
      const note = incomplete ? ` ${plural(incomplete, 'card')} with an empty side won’t be studied.` : '';
      toast(offline ? `Saved on this device. It will sync when you’re back online.${note}` : incomplete ? `Saved.${note}` : 'Deck saved', { timeout: offline || incomplete ? 6000 : 3000 });
      go(`#/deck/${encodeURIComponent(saved.id)}`, { replace: !editingId });
    } catch (err) {
      console.error(err);
      toast('Could not save the deck. Please try again.', { tone: 'error', timeout: 7000 });
    } finally {
      saving = false;
      root.querySelectorAll('[type="submit"]').forEach(b => { b.disabled = false; });
    }
  }

  // ---------- events
  const onInput = event => {
    const t = event.target;
    if (t.dataset.col && t.dataset.cardId) {
      const card = draft.cards.find(c => c.id === t.dataset.cardId);
      if (card) card.data[t.dataset.col] = t.value;
      autosize(t);
      markDirty();
      updateCount();
      showError('cards', '');
    } else if (t.name === 'title') {
      markDirty();
      if (t.value.trim()) showError('title', '');
    } else if (t.dataset.template) {
      draft.templates[t.dataset.template] = t.value;
      markDirty();
    } else if (t.matches('[data-bulk-text]')) {
      const { pairs, skipped, separator } = parsePairs(t.value);
      const sepName = { '\t': 'tab', ' | ': '“|”', ' — ': 'dash', ' - ': '“-”', ': ': 'colon', ' = ': '“=”', ', ': 'comma' }[separator];
      root.querySelector('[data-bulk-info]').textContent = t.value.trim()
        ? `${plural(pairs.length, 'card')} found${sepName ? ` (split on ${sepName})` : ''}${skipped ? ` · ${skipped} line${skipped === 1 ? '' : 's'} skipped` : ''}`
        : '';
    }
  };

  const onClick = async event => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const i = draft.cards.findIndex(c => c.id === remove.dataset.remove);
      if (i < 0) return;
      const [removed] = draft.cards.splice(i, 1);
      if (!draft.cards.length) draft.cards.push(blankCard(draft.columns));
      markDirty();
      redrawRows();
      if (!isEmpty(removed)) {
        toast('Card deleted', { action: 'Undo', onAction: () => { draft.cards.splice(i, 0, removed); redrawRows(removed.id); } });
      }
      root.querySelectorAll('.edit-card')[Math.min(i, draft.cards.length - 1)]?.querySelector('textarea')?.focus();
      return;
    }
    const removeField = event.target.closest('[data-remove-field]');
    if (removeField) {
      const col = removeField.dataset.removeField;
      const used = draft.cards.some(c => String(c.data[col] || '').trim());
      if (used && !(await confirmDialog({ title: `Remove “${col}”?`, body: html`<p>Every card’s ${col} text will be deleted when you save.</p>`, confirm: 'Remove field', danger: true }))) return;
      draft.columns = draft.columns.filter(c => c !== col);
      draft.cards.forEach(c => delete c.data[col]);
      for (const side of ['front', 'back', 'hint']) {
        draft.templates[side] = draft.templates[side].replace(new RegExp(`{{\\s*${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*}}`, 'g'), '').trim();
      }
      if (!draft.templates.front) draft.templates.front = `{{${draft.columns[0]}}}`;
      if (!draft.templates.back) draft.templates.back = `{{${draft.columns[1] || draft.columns[0]}}}`;
      markDirty();
      redrawRows();
      redrawAdvanced();
      return;
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'add') {
      const card = blankCard(draft.columns);
      draft.cards.push(card);
      markDirty();
      redrawRows(card.id);
    } else if (action === 'bulk-add') {
      const ta = root.querySelector('[data-bulk-text]');
      const { pairs } = parsePairs(ta.value);
      if (!pairs.length) { toast('No cards found — put one term and definition per line.', { tone: 'error' }); return; }
      const n = addCards(pairs);
      ta.value = '';
      root.querySelector('[data-bulk-info]').textContent = '';
      root.querySelector('[data-bulk]').open = false;
      toast(`Added ${plural(n, 'card')}`);
    } else if (action === 'add-field') {
      const input = root.querySelector('[data-new-field]');
      const name = input.value.trim().replace(/[{}]/g, '');
      if (!name) { input.focus(); return; }
      if (draft.columns.some(c => c.toLowerCase() === name.toLowerCase())) { toast('That field already exists.', { tone: 'error' }); return; }
      draft.columns.push(name);
      draft.cards.forEach(c => { c.data[name] = ''; });
      if (/hint/i.test(name) && !draft.templates.hint) draft.templates.hint = `{{${name}}}`;
      markDirty();
      redrawRows();
      redrawAdvanced();
      root.querySelector('[data-new-field]')?.focus();
    } else if (action === 'swap') {
      [draft.templates.front, draft.templates.back] = [draft.templates.back, draft.templates.front];
      markDirty();
      redrawAdvanced();
      toast('Front and back swapped');
    }
  };

  const onKeydown = event => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'Enter')) {
      event.preventDefault();
      save();
      return;
    }
    const t = event.target;
    // Tab out of the last field of the last card adds a new card.
    if (event.key === 'Tab' && !event.shiftKey && t.dataset.cardId) {
      const last = draft.cards[draft.cards.length - 1];
      if (t.dataset.cardId === last.id && t.dataset.col === draft.columns[draft.columns.length - 1] && !isEmpty(last)) {
        event.preventDefault();
        const card = blankCard(draft.columns);
        draft.cards.push(card);
        redrawRows(card.id);
      }
    }
    if (event.key === 'Enter' && t.matches('[data-new-field]')) {
      event.preventDefault();
      root.querySelector('[data-action="add-field"]').click();
    }
  };

  const onPaste = event => {
    const t = event.target;
    if (!t.dataset?.cardId) return;
    const text = event.clipboardData?.getData('text/plain') || '';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return;
    const sep = detectSeparator(text);
    const { pairs } = parsePairs(text, sep);
    if (pairs.length < 2 || pairs.length < lines.length * 0.6) return;
    event.preventDefault();
    const n = addCards(pairs, t.dataset.cardId);
    toast(`Added ${plural(n, 'card')} from your paste`);
  };

  const onSubmit = event => { event.preventDefault(); save(); };
  const onBeforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };

  draw();
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('paste', onPaste);
  root.addEventListener('submit', onSubmit);
  window.addEventListener('beforeunload', onBeforeUnload);
  setGuard(async () => !dirty || confirmDialog({ title: 'Discard changes?', body: html`<p>You have unsaved changes to this deck.</p>`, confirm: 'Discard', cancel: 'Keep editing', danger: true }));
  if (!editingId) root.querySelector('[name="title"]').focus();

  return () => {
    setGuard(null);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
    root.removeEventListener('paste', onPaste);
    root.removeEventListener('submit', onSubmit);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
