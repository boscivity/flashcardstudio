// Data layer. Guests keep decks in localStorage; signed-in users sync decks to the
// Supabase `flashcard_sets` table (one row per deck, cards as JSON) with a local cache
// so the app opens instantly and keeps working offline. Study progress lives on each
// card (`srs`) and is merged per card by review time, so devices never overwrite
// newer progress or newer edits.
import { DECKS_TABLE } from './config.js?v=2.0.0';
import { isValidSrs } from './fsrs.js?v=2.0.0';
import { dayIndex } from './session.js?v=2.0.0';

const KEYS = {
  guest: 'fcs:v2:guest',
  legacy: 'flashcardStudioSets',
  prefs: 'fcs:v2:prefs',
  activity: 'fcs:v2:activity',
  cache: uid => `fcs:v2:cloud:${uid}`,
  pending: uid => `fcs:v2:pending:${uid}`,
  edited: uid => `fcs:v2:edited:${uid}`
};
const COLUMNS = 'id, name, columns, cards, templates';

export const state = {
  user: null,
  decks: [],
  ready: false,
  sync: 'idle', // idle | loading | saving | offline | error
  syncError: null,
  storageFull: false
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(reason) {
  for (const fn of [...listeners]) {
    try { fn(reason); } catch (err) { console.error(err); }
  }
}

let client = null;
export const attachClient = c => { client = c; };

// ---------- localStorage
function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (state.storageFull) { state.storageFull = false; emit('storage'); }
    return true;
  } catch {
    if (!state.storageFull) { state.storageFull = true; emit('storage'); }
    return false;
  }
}
function remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// ---------- ids
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function hashId(text) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `c${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

// ---------- normalisation (compatible with rows written by every earlier version)
export function normalizeDeck(raw, { fallbackName = 'Untitled deck' } = {}) {
  const columns = [...new Set((Array.isArray(raw?.columns) ? raw.columns : [])
    .map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean))];
  if (!columns.length) columns.push('Term', 'Definition');
  const t = raw?.templates || {};
  const str = v => (typeof v === 'string' ? v : '');
  const templates = {
    front: str(t.front).trim() || `{{${columns[0]}}}`,
    back: str(t.back).trim() || `{{${columns[1] || columns[0]}}}`,
    hint: str(t.hint).trim()
  };
  const deckId = typeof raw?.id === 'string' && raw.id ? raw.id : uuid();
  const seen = new Set();
  const cards = (Array.isArray(raw?.cards) ? raw.cards : []).filter(c => c && typeof c === 'object').map((card, index) => {
    const data = {};
    for (const col of columns) {
      const v = card.data?.[col];
      data[col] = typeof v === 'string' ? v : v == null ? '' : String(v);
    }
    // Cards saved without an id get a deterministic one so progress survives reloads.
    let id = typeof card.id === 'string' && card.id ? card.id : hashId(`${deckId}|${index}|${JSON.stringify(data)}`);
    while (seen.has(id)) id = hashId(`${id}|dup`);
    seen.add(id);
    const out = { id, data };
    if (isValidSrs(card.srs)) out.srs = { ...card.srs };
    if (Number.isFinite(card.clr)) out.clr = card.clr;
    if (card.star) out.star = true;
    if (Number.isFinite(card.starAt)) out.starAt = card.starAt;
    return out;
  });
  return {
    id: deckId,
    name: (typeof raw?.name === 'string' && raw.name.trim()) || fallbackName,
    columns,
    templates,
    cards
  };
}

const toRow = (deck, userId) => ({
  id: deck.id,
  user_id: userId,
  name: deck.name,
  columns: deck.columns,
  templates: deck.templates,
  cards: deck.cards.map(c => {
    const out = { id: c.id, data: c.data };
    if (c.srs) out.srs = c.srs;
    if (c.clr) out.clr = c.clr;
    if (c.star) out.star = true;
    if (c.starAt) out.starAt = c.starAt;
    return out;
  })
});

// When a card's progress last changed: a review (srs.mod) or a reset/undo that cleared it (clr).
const srsStamp = srs => (isValidSrs(srs) ? (srs.mod || srs.last) : 0);
const progressStamp = card => Math.max(srsStamp(card.srs), card.clr || 0);

/** Copies newer progress/stars from `source` into `target` (matched by card id). Returns true if anything changed. */
export function mergeProgress(target, source) {
  const byId = new Map(source.cards.map(c => [c.id, c]));
  let changed = false;
  for (const card of target.cards) {
    const other = byId.get(card.id);
    if (!other) continue;
    if (progressStamp(other) > progressStamp(card)) {
      if (srsStamp(other.srs) >= (other.clr || 0)) card.srs = { ...other.srs };
      else delete card.srs;
      if (other.clr) card.clr = other.clr;
      changed = true;
    }
    if ((other.starAt || 0) > (card.starAt || 0)) {
      card.star = !!other.star;
      card.starAt = other.starAt;
      changed = true;
    }
  }
  return changed;
}

export const getDeck = id => state.decks.find(d => d.id === id) || null;
export const getCard = (deckId, cardId) => getDeck(deckId)?.cards.find(c => c.id === cardId) || null;

const sortDecks = decks => decks.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

// ---------- sync status
function setSync(sync, error = null) {
  state.sync = sync;
  state.syncError = error;
  emit('sync');
}

// supabase-js waits on a token refresh before each request and keeps retrying it while the
// server is unreachable, so every cloud call gets a deadline and fails like a network error.
const CLOUD_TIMEOUT = 10000;
function cloud(query, ms = CLOUD_TIMEOUT) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Sync request timed out')), ms); });
  return Promise.race([query, deadline]).finally(() => clearTimeout(timer));
}

export function isNetworkError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return !navigator.onLine || err?.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request failed|timed out|fetch/.test(msg);
}

// ---------- local persistence
// pending: decks with progress or stars to upload. edited: decks whose content was saved while
// the server was unreachable; their local content wins when they upload.
let pending = new Set();
let edited = new Set();
let persistTimer = null;

function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  if (state.user) {
    write(KEYS.cache(state.user.id), { decks: state.decks, savedAt: Date.now() });
    write(KEYS.pending(state.user.id), [...pending]);
    write(KEYS.edited(state.user.id), [...edited]);
  } else {
    write(KEYS.guest, state.decks);
  }
}
function persistSoon() {
  if (!persistTimer) persistTimer = setTimeout(persistNow, 400);
}
window.addEventListener('pagehide', () => { if (persistTimer) persistNow(); });

// ---------- loading
export function loadGuest() {
  state.user = null;
  pending = new Set();
  edited = new Set();
  let decks = read(KEYS.guest, []);
  if (!Array.isArray(decks)) decks = [];
  // Decks saved on this device by versions from before accounts existed.
  const legacy = read(KEYS.legacy, null);
  if (Array.isArray(legacy) && legacy.length) {
    decks = decks.concat(legacy);
    write(KEYS.guest, decks.map(d => normalizeDeck(d)));
    remove(KEYS.legacy);
  }
  state.decks = sortDecks(decks.map(d => normalizeDeck(d)));
  state.ready = true;
  setSync('idle');
  emit('decks');
}

export function guestDecks() {
  const decks = read(KEYS.guest, []);
  const legacy = read(KEYS.legacy, []);
  return [...(Array.isArray(decks) ? decks : []), ...(Array.isArray(legacy) ? legacy : [])].map(d => normalizeDeck(d));
}

export async function loadCloud(user, { timeout } = {}) {
  const switching = state.user?.id !== user.id;
  state.user = user;
  if (switching) {
    const cache = read(KEYS.cache(user.id), null);
    state.decks = Array.isArray(cache?.decks) ? sortDecks(cache.decks.map(d => normalizeDeck(d))) : [];
    pending = new Set(read(KEYS.pending(user.id), []));
    edited = new Set(read(KEYS.edited(user.id), []));
    state.ready = !!cache;
    emit('decks');
  }
  await refresh({ timeout });
}

export async function refresh({ timeout } = {}) {
  if (!state.user || !client) return;
  const uid = state.user.id;
  setSync('loading');
  try {
    const { data, error } = await cloud(client.from(DECKS_TABLE).select(COLUMNS).eq('user_id', uid), timeout);
    if (error) throw error;
    if (state.user?.id !== uid) return;
    const local = new Map(state.decks.map(d => [d.id, d]));
    const server = (data || []).map(row => normalizeDeck(row));
    const decks = server.map(deck => {
      const mine = local.get(deck.id);
      if (mine && edited.has(deck.id)) { mergeProgress(mine, deck); return mine; }
      if (mine && mergeProgress(deck, mine)) pending.add(deck.id);
      return deck;
    });
    // Decks created while offline are not on the server yet.
    for (const id of edited) if (local.has(id) && !server.some(d => d.id === id)) decks.push(local.get(id));
    for (const id of [...pending]) if (!decks.some(d => d.id === id)) pending.delete(id);
    for (const id of [...edited]) if (!decks.some(d => d.id === id)) edited.delete(id);
    state.decks = sortDecks(decks);
    state.ready = true;
    persistNow();
    setSync('idle');
    emit('decks');
    if (pending.size) scheduleFlush(300);
  } catch (err) {
    console.warn('Could not load decks', err);
    state.ready = true;
    setSync(isNetworkError(err) ? 'offline' : 'error', err);
    emit('decks');
  }
}

async function fetchRow(id) {
  const { data, error } = await cloud(client.from(DECKS_TABLE).select(COLUMNS).eq('id', id).eq('user_id', state.user.id).maybeSingle());
  if (error) throw error;
  return data ? normalizeDeck(data) : null;
}

async function upsertRow(deck) {
  const { error } = await cloud(client.from(DECKS_TABLE).upsert(toRow(deck, state.user.id), { onConflict: 'id' }));
  if (error) throw error;
}

function putLocal(deck) {
  const i = state.decks.findIndex(d => d.id === deck.id);
  if (i >= 0) state.decks[i] = deck; else state.decks.push(deck);
  sortDecks(state.decks);
}

// ---------- writes
/** Saves deck content (name, fields, templates, cards). Keeps any newer progress already saved elsewhere. */
export async function saveDeck(input) {
  const deck = normalizeDeck(input);
  const existing = getDeck(deck.id);
  if (existing) mergeProgress(deck, existing);
  if (state.user && client) {
    setSync('saving');
    try {
      const server = await fetchRow(deck.id);
      if (server) mergeProgress(deck, server);
      await upsertRow(deck);
      pending.delete(deck.id);
      edited.delete(deck.id);
      setSync('idle');
    } catch (err) {
      if (!isNetworkError(err)) { setSync('error', err); throw err; }
      // Offline: keep the change on this device and upload it when the server is back.
      setSync('offline', err);
      edited.add(deck.id);
      pending.add(deck.id);
      scheduleFlush(15000);
    }
  }
  putLocal(deck);
  persistNow();
  emit('decks');
  return deck;
}

export async function deleteDeck(id) {
  if (state.user && client) {
    setSync('saving');
    try {
      const { error } = await cloud(client.from(DECKS_TABLE).delete().eq('id', id).eq('user_id', state.user.id));
      if (error) throw error;
      setSync('idle');
    } catch (err) {
      setSync(isNetworkError(err) ? 'offline' : 'error', err);
      throw err;
    }
  }
  state.decks = state.decks.filter(d => d.id !== id);
  pending.delete(id);
  edited.delete(id);
  persistNow();
  emit('decks');
}

/** Records a review result on a card. Saved locally right away and synced shortly after. */
export function recordReview(deckId, cardId, srs, { wasNew = false, ms = 0 } = {}) {
  const card = getCard(deckId, cardId);
  if (!card) return;
  card.srs = { ...srs, mod: Date.now() };
  logActivity({ reviews: 1, learned: wasNew ? 1 : 0, ms });
  markDirty(deckId);
}

/** Puts back a card's previous progress (used by Undo). */
export function restoreProgress(deckId, cardId, srs) {
  const card = getCard(deckId, cardId);
  if (!card) return;
  const now = Date.now();
  if (srs) card.srs = { ...srs, mod: now };
  else { delete card.srs; card.clr = now; }
  logActivity({ reviews: -1 });
  markDirty(deckId);
}

export function setStar(deckId, cardId, on) {
  const card = getCard(deckId, cardId);
  if (!card) return;
  card.star = !!on;
  card.starAt = Date.now();
  markDirty(deckId);
  emit('decks');
}

export function resetProgress(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  // The timestamp makes the reset win over older progress saved on other devices.
  const now = Date.now();
  for (const card of deck.cards) { delete card.srs; card.clr = now; }
  markDirty(deckId, 200);
  emit('decks');
}

function markDirty(deckId, delay = 3000) {
  persistSoon();
  if (state.user) {
    pending.add(deckId);
    scheduleFlush(delay);
  }
}

// ---------- cloud flush
let flushTimer = null;
let flushing = null;
export function scheduleFlush(ms = 3000) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush().catch(() => {}); }, ms);
}

export function flush() {
  if (!state.user || !client || !pending.size) return Promise.resolve();
  if (flushing) return flushing.then(() => flush());
  clearTimeout(flushTimer);
  const uid = state.user.id;
  flushing = (async () => {
    setSync('saving');
    try {
      for (const id of [...pending]) {
        const local = getDeck(id);
        if (!local) { pending.delete(id); continue; }
        const server = await fetchRow(id);
        if (state.user?.id !== uid) return;
        if (edited.has(id)) {
          if (server) mergeProgress(local, server);
          await upsertRow(local);
          edited.delete(id);
          pending.delete(id);
          continue;
        }
        if (!server) { pending.delete(id); continue; }
        mergeProgress(server, local);
        mergeProgress(local, server);
        await upsertRow(server);
        // Keep local objects (an active session may hold them) but take server content.
        local.name = server.name;
        local.columns = server.columns;
        local.templates = server.templates;
        const localCards = new Map(local.cards.map(c => [c.id, c]));
        local.cards = server.cards.map(c => Object.assign(localCards.get(c.id) || {}, c));
        pending.delete(id);
      }
      persistNow();
      setSync('idle');
      emit('decks');
    } catch (err) {
      console.warn('Sync failed', err);
      setSync(isNetworkError(err) ? 'offline' : 'error', err);
      persistNow();
      scheduleFlush(isNetworkError(err) ? 15000 : 60000);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export const hasPendingChanges = () => pending.size > 0;

window.addEventListener('online', () => {
  if (!state.user) return;
  if (pending.size) flush(); else if (state.sync === 'offline') refresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { persistNow(); if (pending.size) flush(); }
});

/** Moves decks stored on this device (guest mode) into the signed-in account. */
export async function importGuestDecks() {
  if (!state.user || !client) return 0;
  const decks = guestDecks();
  let moved = 0;
  setSync('saving');
  try {
    for (const deck of decks) {
      deck.id = uuid();
      await upsertRow(deck);
      putLocal(deck);
      moved++;
    }
    write(KEYS.guest, []);
    remove(KEYS.legacy);
    persistNow();
    setSync('idle');
  } catch (err) {
    // Remove what already moved so a retry does not duplicate it.
    const remaining = decks.slice(moved);
    write(KEYS.guest, remaining);
    setSync(isNetworkError(err) ? 'offline' : 'error', err);
    emit('decks');
    throw err;
  }
  emit('decks');
  return moved;
}

export function discardGuestDecks() {
  write(KEYS.guest, []);
  remove(KEYS.legacy);
}

export function signOutLocal() {
  persistNow();
  state.user = null;
  loadGuest();
}

// ---------- preferences
const DEFAULT_PREFS = {
  theme: 'system',
  retention: 0.9,
  newPerSession: 10,
  autoAdvance: true,
  strictAccents: false,
  autoSpeak: false,
  decks: {}
};

export function prefs() {
  const p = read(KEYS.prefs, {});
  return { ...DEFAULT_PREFS, ...(p && typeof p === 'object' ? p : {}) };
}

export function setPref(key, value) {
  const p = prefs();
  p[key] = value;
  write(KEYS.prefs, p);
  emit('prefs');
}

export function deckPrefs(deckId) {
  return { answerWith: 'auto', types: 'smart', ...(prefs().decks?.[deckId] || {}) };
}

export function setDeckPref(deckId, key, value) {
  const p = prefs();
  p.decks = { ...(p.decks || {}), [deckId]: { ...(p.decks?.[deckId] || {}), [key]: value } };
  write(KEYS.prefs, p);
  emit('prefs');
}

// ---------- activity (per device)
export function activity() {
  const a = read(KEYS.activity, {});
  return a && typeof a === 'object' ? a : {};
}

export function logActivity({ reviews = 0, learned = 0, ms = 0 }) {
  const a = activity();
  const key = String(dayIndex(Date.now()));
  const day = a[key] || { r: 0, n: 0, ms: 0 };
  day.r = Math.max(0, day.r + reviews);
  day.n = Math.max(0, day.n + learned);
  day.ms += Math.max(0, Math.min(ms, 5 * 60000));
  a[key] = day;
  write(KEYS.activity, a);
}

export function streak(now = Date.now()) {
  const a = activity();
  let day = dayIndex(now);
  if (!(a[day]?.r > 0)) day--;
  let count = 0;
  while (a[day]?.r > 0) { count++; day--; }
  return count;
}

export function todayActivity(now = Date.now()) {
  return activity()[dayIndex(now)] || { r: 0, n: 0, ms: 0 };
}

// ---------- backup
export function exportAll() {
  return { app: 'flashcard-studio', version: 2, exportedAt: new Date().toISOString(), decks: state.decks.map(d => toRow(d, undefined)) };
}
