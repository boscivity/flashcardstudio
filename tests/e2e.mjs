// End-to-end tests in Chrome with a mocked Supabase backend (no real accounts or data touched).
// Run: npm run test:e2e   (after `npm install`; uses installed Chrome when present, else Playwright's Chromium)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/serve.mjs';

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const SUPABASE = 'https://tbydrjbqixrrowriuvjx.supabase.co';

// ---------------------------------------------------------------- mock Supabase
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
function makeBackend() {
  const users = new Map([
    ['alice@example.com', { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com', password: 'correct-horse-1' }],
    ['bob@example.com', { id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.com', password: 'battery-staple-2' }]
  ]);
  const rows = new Map();
  const log = [];
  let offline = false;
  const userObj = u => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [{ id: u.id, provider: 'email' }], created_at: '2025-01-01T00:00:00Z' });
  const session = u => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return { access_token: `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `refresh-${u.id}`, user: userObj(u) };
  };
  const uidFrom = headers => {
    const token = (headers.authorization || '').replace(/^Bearer /, '');
    try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub || null; } catch { return null; }
  };
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (offline) return route.abort('internetdisconnected');
    const headers = req.headers();
    log.push(`${req.method()} ${url.pathname}${url.search}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = url.pathname;
    if (p === '/auth/v1/token') {
      const body = JSON.parse(req.postData() || '{}');
      if (url.searchParams.get('grant_type') === 'password') {
        const u = users.get(String(body.email).toLowerCase());
        if (!u || u.password !== body.password) return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return json(route, 200, session(u));
      }
      const u = [...users.values()].find(x => `refresh-${x.id}` === body.refresh_token);
      return u ? json(route, 200, session(u)) : json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    if (p === '/auth/v1/user') {
      const uid = uidFrom(headers);
      const u = [...users.values()].find(x => x.id === uid);
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}');
        if (u && body.password) u.password = body.password;
      }
      return u ? json(route, 200, userObj(u)) : json(route, 401, { msg: 'invalid JWT' });
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/auth/v1/signup') {
      const body = JSON.parse(req.postData() || '{}');
      if (users.has(body.email)) return json(route, 200, { ...userObj(users.get(body.email)), identities: [] });
      const u = { id: crypto.randomUUID(), email: body.email, password: body.password };
      users.set(body.email, u);
      return json(route, 200, { ...userObj(u), email_confirmed_at: null });
    }
    if (p === '/auth/v1/recover') return json(route, 200, {});
    if (p === '/rest/v1/flashcard_sets') {
      const uid = uidFrom(headers);
      // Row level security: every request only sees the caller's rows.
      const visible = [...rows.values()].filter(r => uid && r.user_id === uid);
      const filters = [...url.searchParams.entries()].filter(([k, v]) => k !== 'select' && /^eq\./.test(v));
      const matches = visible.filter(r => filters.every(([k, v]) => String(r[k]) === v.slice(3)));
      if (req.method() === 'GET') {
        if ((headers.accept || '').includes('vnd.pgrst.object')) return matches.length === 1 ? json(route, 200, matches[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
        return json(route, 200, matches);
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        for (const row of Array.isArray(body) ? body : [body]) {
          const existing = rows.get(row.id);
          if (!uid || row.user_id !== uid || (existing && existing.user_id !== uid)) return json(route, 403, { code: '42501', message: 'new row violates row-level security policy' });
          rows.set(row.id, structuredClone(row));
        }
        return route.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'DELETE') {
        for (const r of matches) rows.delete(r.id);
        return route.fulfill({ status: 204 });
      }
    }
    return json(route, 404, { message: `unmocked ${p}` });
  }
  return { users, rows, log, handle, setOffline: v => { offline = v; } };
}

// ---------------------------------------------------------------- helpers
const server = createServer();
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true }) // undefined -> bundled Chromium;
const results = [];

async function newPage({ width = 1280, backend = makeBackend(), context } = {}) {
  const ctx = context || await browser.newContext({ viewport: { width, height: 860 }, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.route(`${SUPABASE}/**`, route => backend.handle(route));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', d => { errors.push(`native dialog: ${d.message()}`); d.dismiss(); });
  return { page, ctx, errors, backend };
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(['PASS', name, Date.now() - t]);
    console.log(`PASS ${name} (${Date.now() - t}ms)`);
  } catch (err) {
    results.push(['FAIL', name, Date.now() - t]);
    console.log(`FAIL ${name}\n  ${String(err.stack || err).split('\n').slice(0, 6).join('\n  ')}`);
  }
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function decksFromStorage(page) {
  return page.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === 'fcs:v2:guest') out.push(...JSON.parse(localStorage.getItem(k)));
      if (k.startsWith('fcs:v2:cloud:')) out.push(...JSON.parse(localStorage.getItem(k)).decks);
    }
    return out;
  });
}

function sidesOf(deck, card) {
  const r = t => t.replace(/{{\s*([^{}]+?)\s*}}/g, (_, k) => card.data[k] ?? '').trim();
  return { front: r(deck.templates.front), back: r(deck.templates.back) };
}

/** Answers the current study question. mode: 'right' | 'wrong' | 'typo'. Returns the question mode. */
async function answer(page, mode = 'right') {
  await page.waitForSelector('.qcard');
  const decks = await decksFromStorage(page);
  const prompt = (await page.textContent('.qcard__prompt .qcard__text')).trim();
  let expected = null;
  for (const d of decks) for (const c of d.cards) {
    const s = sidesOf(d, c);
    if (s.front === prompt) expected = s.back;
    else if (s.back === prompt) expected = s.front;
  }
  assert.ok(expected !== null, `no card for prompt "${prompt}"`);
  if (await page.locator('#answerInput').count()) {
    const text = mode === 'wrong' ? 'zzz definitely wrong' : mode === 'typo' && expected.length > 7 ? expected.slice(0, -2) + expected.slice(-1) : expected;
    await page.fill('#answerInput', text);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ratings');
    await page.keyboard.press('Enter'); // accept suggested rating
    return 'type';
  }
  if (await page.locator('button.option').count()) {
    const options = await page.locator('button.option span').allTextContents();
    const right = options.findIndex(o => o.trim() === expected);
    const idx = mode === 'wrong' ? options.findIndex((o, i) => i !== right) : right;
    await page.keyboard.press(String(idx + 1));
    await page.waitForSelector('.options--done');
    await page.keyboard.press('Enter');
    return 'mc';
  }
  await page.keyboard.press(' ');
  await page.waitForSelector('.ratings');
  await page.keyboard.press(mode === 'wrong' ? '1' : '3');
  return 'flip';
}

async function finishSession(page, { max = 120, wrongFirst = 0 } = {}) {
  const modes = [];
  for (let i = 0; i < max; i++) {
    if (await page.locator('.done').count()) return modes;
    modes.push(await answer(page, i < wrongFirst ? 'wrong' : 'right'));
    await page.waitForTimeout(30);
  }
  throw new Error('session did not finish');
}

async function setDeckOption(page, name, value) {
  const details = page.locator('details.options');
  if (!(await details.evaluate(d => d.open))) await details.locator('summary').click();
  await page.locator(`input[name="${name}"][value="${value}"]`).check();
}

async function createDeckViaEditor(page, title, pairs) {
  await page.goto(`${BASE}#/new`);
  await page.fill('[name="title"]', title);
  const bulk = pairs.map(([a, b]) => `${a}\t${b}`).join('\n');
  await page.click('[data-bulk] summary');
  await page.fill('[data-bulk-text]', bulk);
  await page.click('[data-action="bulk-add"]');
  await page.click('[data-save]');
  await page.waitForURL(/#\/deck\//);
}

// ---------------------------------------------------------------- guest flows
for (const width of [390, 1280]) {
  const { page, errors } = await newPage({ width });
  const tag = `[${width}px]`;

  await step(`${tag} landing renders without errors or overflow`, async () => {
    await page.goto(BASE);
    await page.waitForSelector('.hero__title');
    assert.equal(await noOverflow(page), true);
    assert.equal(await page.textContent('.version'), 'v2.0.1');
  });

  await step(`${tag} editor validation, tab-to-add, smart paste, literal HTML`, async () => {
    await page.goto(`${BASE}#/new`);
    await page.click('[data-save]');
    assert.equal(await page.locator('[data-error="title"]').isVisible(), true);
    assert.equal(await page.locator('[data-save]').isDisabled(), false, 'save stays usable after a validation error');
    await page.fill('[name="title"]', 'Unit 1 <b>vocab</b>');
    await page.click('[data-save]');
    assert.match(await page.textContent('[data-error="cards"]'), /at least one card/);
    const first = page.locator('.edit-card').first().locator('textarea');
    await first.nth(0).fill('<img src=x onerror="window.__xss=1">');
    await first.nth(1).fill('Literal markup');
    // Paste a two-column list into the second row.
    await page.locator('.edit-card').nth(1).locator('textarea').first().focus();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'Anion\tNegative ion\nCation\tPositive ion\nIsotope\tSame element, different neutrons');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.locator('.edit-card').count(), 5); // 1 filled + 3 pasted + 1 empty trailing
    const last = page.locator('.edit-card').last().locator('textarea');
    await last.nth(0).fill('Catalyst');
    await last.nth(1).fill('Speeds up a reaction');
    await last.nth(1).press('Tab');
    assert.equal(await page.locator('.edit-card').count(), 6, 'tab from the last field adds a card');
    await page.click('[data-save]');
    await page.waitForURL(/#\/deck\//);
    assert.match(await page.textContent('.deck-hero__title'), /Unit 1 <b>vocab<\/b>/);
    assert.equal(await page.locator('.card-row').count(), 5);
    assert.equal(await page.locator('.card-row img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await noOverflow(page), true);
  });

  await step(`${tag} full study session with keyboard only (MC -> typing, misses requeue, undo, star)`, async () => {
    await page.click('a.mode--primary');
    await page.waitForSelector('.qcard');
    // First answer wrong, check it comes back; undo; star.
    const firstPrompt = await page.textContent('.qcard__prompt .qcard__text');
    await answer(page, 'wrong');
    await page.keyboard.press('z');
    await page.waitForSelector('.qcard');
    assert.equal(await page.textContent('.qcard__prompt .qcard__text'), firstPrompt, 'undo returns to the same card');
    await page.keyboard.press('s');
    assert.equal(await page.locator('.study__bar .star.is-on').count(), 1);
    const modes = await finishSession(page, { wrongFirst: 2 });
    assert.ok(modes.includes('mc') && modes.includes('type'), `modes used: ${modes}`);
    assert.match(await page.textContent('.done'), /Session complete/);
    assert.match(await page.textContent('.done__stats'), /First-try accuracy/);
    assert.equal(await page.locator('[data-action="tricky"]').count(), 1, 'missed cards offered for practice');
  });

  await step(`${tag} progress persists after reload and schedules reviews in the future`, async () => {
    await page.reload();
    const decks = await decksFromStorage(page);
    const deck = decks.find(d => d.name.startsWith('Unit 1'));
    assert.ok(deck.cards.every(c => c.srs), 'every card has a memory state');
    assert.ok(deck.cards.every(c => c.srs.due > Date.now()), 'nothing is due right after a full session');
    assert.equal(deck.cards.filter(c => c.star).length, 1);
    await page.goto(`${BASE}#/study/${deck.id}`);
    await page.waitForSelector('.done');
    assert.match(await page.textContent('.done'), /All caught up/);
  });

  await step(`${tag} typo tolerance and "I was right" override`, async () => {
    const decks = await decksFromStorage(page);
    const deck = decks.find(d => d.name.startsWith('Unit 1'));
    await page.goto(`${BASE}#/deck/${deck.id}`);
    await setDeckOption(page, 'types', 'typing');
    await page.goto(`${BASE}#/study/${deck.id}?cram`);
    await page.waitForSelector('#answerInput');
    const prompt = (await page.textContent('.qcard__prompt .qcard__text')).trim();
    const card = deck.cards.map(c => sidesOf(deck, c)).find(s => s.front === prompt || s.back === prompt);
    const expected = card.front === prompt ? card.back : card.front;
    await page.fill('#answerInput', expected.toUpperCase() + '!');
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('.verdict'), /Correct/);
    await page.keyboard.press('3');
    await page.waitForSelector('#answerInput');
    await page.fill('#answerInput', 'nonsense');
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('.verdict'), /Not quite/);
    assert.equal(await page.locator('.rating--1.is-suggested').count(), 1);
    await page.click('[data-action="override"]');
    assert.equal(await page.locator('.rating--3.is-suggested').count(), 1);
    await page.goto(`${BASE}#/deck/${deck.id}`);
    await setDeckOption(page, 'types', 'smart');
  });

  await step(`${tag} flashcards: flip, navigate, sort, summary`, async () => {
    const deck = (await decksFromStorage(page)).find(d => d.name.startsWith('Unit 1'));
    await page.goto(`${BASE}#/cards/${deck.id}`);
    await page.waitForSelector('.flip');
    await page.keyboard.press(' ');
    assert.equal(await page.locator('.flip.is-flipped').count(), 1);
    await page.keyboard.press('2');
    await page.keyboard.press('1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 10 && !(await page.locator('.done').count()); i++) await page.keyboard.press('2');
    assert.match(await page.textContent('.done'), /every card/);
    assert.equal(await noOverflow(page), true);
  });

  await step(`${tag} practice test: build, answer, grade`, async () => {
    const deck = (await decksFromStorage(page)).find(d => d.name.startsWith('Unit 1'));
    await page.goto(`${BASE}#/test/${deck.id}`);
    await page.click('[data-setup] [type="submit"]');
    await page.waitForSelector('.question');
    const n = await page.locator('.question').count();
    assert.equal(n, 5);
    // Answer the written questions correctly and leave the rest blank.
    for (let i = 0; i < n; i++) {
      const q = page.locator('.question').nth(i);
      if (await q.locator('input:not([type])').count()) {
        const prompt = (await q.locator('.question__prompt').textContent()).trim();
        const s = deck.cards.map(c => sidesOf(deck, c)).find(x => x.front === prompt || x.back === prompt);
        await q.locator('input').fill(s.front === prompt ? s.back : s.front);
      }
    }
    await page.click('[data-test] [type="submit"]');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog .btn-primary');
    await page.waitForSelector('.score');
    assert.match(await page.textContent('.score'), /of 5 correct/);
    assert.ok(await page.locator('.questions--results .question').count() === 5);
  });

  await step(`${tag} match game completes`, async () => {
    const deck = (await decksFromStorage(page)).find(d => d.name.startsWith('Unit 1'));
    await page.goto(`${BASE}#/match/${deck.id}`);
    await page.click('[data-action="start"]');
    await page.waitForSelector('.tile');
    const pairs = new Map(deck.cards.map(c => { const s = sidesOf(deck, c); return [s.front, s.back]; }));
    // One wrong pair first (penalty), then solve.
    const texts = await page.locator('.tile').allTextContents();
    const fronts = texts.filter(t => pairs.has(t));
    const wrongBack = texts.find(t => !pairs.has(t) && t !== pairs.get(fronts[0]));
    await page.locator('.tile', { hasText: fronts[0] }).first().click();
    await page.locator('.tile', { hasText: wrongBack }).first().click();
    await page.waitForTimeout(500);
    for (const f of fronts) {
      await page.locator('.tile:not(.is-done)').filter({ hasText: f }).first().click();
      await page.locator('.tile:not(.is-done)').filter({ hasText: pairs.get(f) }).last().click();
    }
    await page.waitForSelector('.done');
    assert.match(await page.textContent('.done'), /penalties|best|First time/);
  });

  await step(`${tag} CSV export and re-import round trip`, async () => {
    const deck = (await decksFromStorage(page)).find(d => d.name.startsWith('Unit 1'));
    await page.goto(`${BASE}#/deck/${deck.id}`);
    await page.click('.menu summary');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
    assert.equal(download.suggestedFilename(), 'unit-1-b-vocab-b.csv');
    const file = path.join(os.tmpdir(), `fcs-${width}-${download.suggestedFilename()}`);
    await download.saveAs(file);
    const csv = fs.readFileSync(file, 'utf8');
    assert.match(csv, /^\uFEFFTerm,Definition\r\n/);
    assert.match(csv, /"Isotope","?Same element, different neutrons"?|Isotope,"Same element, different neutrons"/);
    await page.goto(BASE);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="import"]')]);
    await chooser.setFiles(file);
    await page.waitForURL(/#\/new$/);
    assert.equal(await page.inputValue('[name="title"]'), `Fcs ${width} unit 1 b vocab b`);
    assert.equal(await page.locator('.edit-card').count(), 5);
    await page.click('[data-save]');
    await page.waitForURL(/#\/deck\//);
  });

  await step(`${tag} settings: theme and study preferences persist`, async () => {
    await page.goto(`${BASE}#/settings`);
    await page.click('input[name="theme"][value="light"]', { force: true });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.selectOption('select[name="newPerSession"]', '20');
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.inputValue('select[name="newPerSession"]'), '20');
    await page.click('input[name="theme"][value="system"]', { force: true });
    assert.equal(await noOverflow(page), true);
  });

  await step(`${tag} sample deck, dashboard, deck page and unsaved-changes guard`, async () => {
    await page.goto(BASE);
    await page.goto(`${BASE}#/new`);
    await page.fill('[name="title"]', 'Draft');
    await page.goto(`${BASE}#/`);
    await page.waitForSelector('dialog[open]');
    await page.click('dialog button:has-text("Keep editing")');
    await page.waitForURL(/#\/new$/);
    assert.equal(await page.inputValue('[name="title"]'), 'Draft', 'draft kept');
    await page.click('.back-link');
    await page.click('dialog .btn-danger');
    await page.waitForSelector('.dashboard');
    assert.ok(await page.locator('.deck-tile').count() >= 2);
    assert.equal(await noOverflow(page), true);
  });

  await step(`${tag} no console errors`, async () => { assert.deepEqual(errors, []); });
  await page.context().close();
}

// ---------------------------------------------------------------- large deck
await step('2,000-card deck: import, dashboard and session start stay fast', async () => {
  const { page, errors } = await newPage({ width: 1280 });
  await page.goto(BASE);
  const csv = 'Term,Definition\n' + Array.from({ length: 2000 }, (_, i) => `term ${i},definition number ${i} for the big deck`).join('\n');
  const file = path.join(os.tmpdir(), 'fcs-big.csv');
  fs.writeFileSync(file, csv);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="import"]')]);
  await chooser.setFiles(file);
  await page.waitForURL(/#\/new$/);
  assert.equal(await page.locator('.edit-card').count(), 2000);
  let t = Date.now();
  await page.click('[data-save]');
  await page.waitForURL(/#\/deck\//);
  const saveMs = Date.now() - t;
  t = Date.now();
  await page.click('a.mode--primary');
  await page.waitForSelector('.qcard');
  const startMs = Date.now() - t;
  assert.ok(saveMs < 4000 && startMs < 1500, `save ${saveMs}ms, start ${startMs}ms`);
  for (let i = 0; i < 4; i++) await answer(page, 'right');
  t = Date.now();
  await page.goto(BASE);
  await page.waitForSelector('.deck-tile');
  assert.ok(Date.now() - t < 2000);
  assert.deepEqual(errors, []);
  await page.context().close();
});

// ---------------------------------------------------------------- signed-in flows (mock backend)
await step('cloud: login errors, login, guest import, edit, study sync, stable ids, isolation, offline, logout', async () => {
  const backend = makeBackend();
  const alice = backend.users.get('alice@example.com');
  const bob = backend.users.get('bob@example.com');
  // Rows written by older app versions: one card has no id and no progress.
  backend.rows.set('aaaaaaaa-0000-4000-8000-000000000001', {
    id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: alice.id, name: 'Alice biology',
    columns: ['Term', 'Definition', 'Hint'], templates: { front: '{{Term}}', back: '{{Definition}}', hint: '{{Hint}}' },
    cards: [{ id: 'c-1', data: { Term: 'Cell', Definition: 'Basic unit of life', Hint: 'small' } }, { data: { Term: 'Gene', Definition: 'Unit of heredity', Hint: '' } }]
  });
  backend.rows.set('bbbbbbbb-0000-4000-8000-000000000002', {
    id: 'bbbbbbbb-0000-4000-8000-000000000002', user_id: bob.id, name: 'Bob secret deck',
    columns: ['Term', 'Definition'], templates: { front: '{{Term}}', back: '{{Definition}}', hint: '' },
    cards: [{ id: 'b-1', data: { Term: 'Secret', Definition: 'Only Bob sees this' } }]
  });

  const { page, errors, ctx } = await newPage({ width: 390, backend });
  await page.goto(BASE);
  // A guest deck that should be offered for import after login.
  await page.click('[data-action="samples"]');
  await page.click('dialog button:has-text("World capitals")');
  await page.waitForURL(/#\/study\//);
  await page.goto(`${BASE}#/login`);
  await page.fill('[name="email"]', 'alice@example.com');
  await page.fill('[name="password"]', 'wrong-password');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('[data-status][data-tone="error"]');
  assert.match(await page.textContent('[data-status]'), /don’t match/);
  await page.fill('[name="password"]', 'correct-horse-1');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('dialog[open]');
  assert.match(await page.textContent('dialog'), /World capitals/);
  await page.click('dialog .btn-primary');
  await page.waitForFunction(() => document.querySelectorAll('.deck-tile').length === 2);
  assert.ok([...backend.rows.values()].some(r => r.user_id === alice.id && r.name === 'World capitals'), 'guest deck uploaded to Alice');
  const tiles = await page.locator('.deck-tile__name').allTextContents();
  assert.ok(!tiles.includes('Bob secret deck'), 'never sees another user’s deck');
  assert.ok(backend.log.filter(l => l.startsWith('GET /rest/v1/flashcard_sets')).every(l => l.includes(`user_id=eq.${alice.id}`)), 'every read is scoped to the user');

  // Card ids stay stable across refreshes, including the legacy card without an id.
  const idsBefore = (await decksFromStorage(page)).find(d => d.name === 'Alice biology').cards.map(c => c.id);
  await page.reload();
  await page.waitForSelector('.deck-tile');
  const idsAfter = (await decksFromStorage(page)).find(d => d.name === 'Alice biology').cards.map(c => c.id);
  assert.deepEqual(idsAfter, idsBefore);

  // Edit: add a card and save; existing ids are kept.
  await page.click('.deck-tile__link:has-text("Alice biology")');
  await page.click('a:has-text("Edit")');
  await page.click('[data-action="add"]');
  const fields = page.locator('.edit-card').last().locator('textarea');
  await fields.nth(0).fill('Enzyme');
  await fields.nth(1).fill('Protein that speeds up reactions');
  await page.click('[data-save]');
  await page.waitForURL(/#\/deck\//);
  const saved = backend.rows.get('aaaaaaaa-0000-4000-8000-000000000001');
  assert.equal(saved.cards.length, 3);
  assert.equal(saved.cards[0].id, 'c-1');
  assert.equal(saved.cards[1].id, idsBefore[1], 'legacy card keeps the id it was given');

  // Another device adds a card meanwhile; studying must not wipe it.
  saved.cards.push({ id: 'other-device', data: { Term: 'Ribosome', Definition: 'Builds proteins', Hint: '' } });
  await page.click('a.mode--primary');
  await finishSession(page);
  await page.waitForFunction(() => !document.querySelector('.sync--saving'));
  await page.waitForTimeout(500);
  const synced = backend.rows.get('aaaaaaaa-0000-4000-8000-000000000001');
  assert.ok(synced.cards.find(c => c.id === 'other-device'), 'card added on another device survives the sync');
  assert.ok(synced.cards.filter(c => c.id !== 'other-device').every(c => c.srs && c.srs.due > Date.now()), 'progress synced to the cloud');

  // Offline: studying keeps working, sync resumes later.
  backend.setOffline(true);
  await page.goto(BASE);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.goto(`${BASE}#/study/aaaaaaaa-0000-4000-8000-000000000001?cram`);
  await answer(page, 'right');
  await answer(page, 'right');
  await page.goto(BASE);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('.banner--warn, .sync--offline', { timeout: 20000 });
  // Creating and editing decks offline saves on the device and uploads later.
  await createDeckViaEditor(page, 'Made offline', [['Photon', 'Particle of light'], ['Quark', 'Builds protons']]);
  await page.goto(`${BASE}#/edit/aaaaaaaa-0000-4000-8000-000000000001`);
  await page.fill('[name="title"]', 'Alice biology v2');
  await page.click('[data-save]');
  await page.waitForURL(/#\/deck\//);
  assert.ok(![...backend.rows.values()].some(r => r.name === 'Made offline'), 'nothing reached the server yet');
  await page.reload();
  await page.goto(BASE);
  await page.waitForSelector('.deck-tile');
  assert.ok((await page.locator('.deck-tile__name').allTextContents()).includes('Made offline'), 'offline deck survives a reload');
  backend.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelector('.sync')?.classList.contains('sync--idle'), null, { timeout: 20000 });
  const uploaded = [...backend.rows.values()].find(r => r.name === 'Made offline');
  assert.ok(uploaded && uploaded.user_id === alice.id && uploaded.cards.length === 2, 'offline deck uploaded');
  assert.equal(backend.rows.get('aaaaaaaa-0000-4000-8000-000000000001').name, 'Alice biology v2', 'offline edit uploaded');
  assert.ok(backend.rows.get('aaaaaaaa-0000-4000-8000-000000000001').cards.find(c => c.id === 'other-device'), 'other device card kept');

  // Bob in a separate browser profile sees only his deck.
  const bobCtx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  const { page: bobPage, errors: bobErrors } = await newPage({ backend, context: bobCtx });
  await bobPage.goto(`${BASE}#/login`);
  await bobPage.fill('[name="email"]', 'bob@example.com');
  await bobPage.fill('[name="password"]', 'battery-staple-2');
  await bobPage.click('[data-auth] [type="submit"]');
  await bobPage.waitForSelector('.deck-tile');
  assert.deepEqual(await bobPage.locator('.deck-tile__name').allTextContents(), ['Bob secret deck']);
  // Bob trying to overwrite Alice's deck id is rejected by RLS.
  const forged = await bobPage.evaluate(async () => {
    const res = await fetch('https://tbydrjbqixrrowriuvjx.supabase.co/rest/v1/flashcard_sets', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${JSON.parse(localStorage.getItem('sb-tbydrjbqixrrowriuvjx-auth-token')).access_token}` }, body: JSON.stringify({ id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: 'x', name: 'pwned', columns: [], cards: [], templates: {} }) });
    return res.status;
  });
  assert.equal(forged, 403);
  assert.equal(backend.rows.get('aaaaaaaa-0000-4000-8000-000000000001').name, 'Alice biology v2', 'forged write rejected');
  assert.deepEqual(bobErrors, []);
  await bobCtx.close();

  // Logout returns to guest mode.
  await page.goto(`${BASE}#/settings`);
  await page.click('[data-action="logout"]');
  await page.waitForSelector('.hero__title, .dashboard');
  assert.equal(await page.locator('.sync').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await step('cloud: sign up shows confirmation, duplicate email is reported, reset email is sent', async () => {
  const { page, errors, ctx } = await newPage({ width: 1280 });
  await page.goto(`${BASE}#/signup`);
  await page.fill('[name="email"]', 'new@example.com');
  await page.fill('[name="newPassword"]', 'short');
  await page.click('[data-auth] [type="submit"]');
  assert.match(await page.textContent('[data-status]'), /at least 8/);
  await page.fill('[name="newPassword"]', 'long-enough-pw');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('[data-status][data-tone="success"]');
  assert.match(await page.textContent('[data-status]'), /confirmation link/);
  await page.fill('[name="email"]', 'alice@example.com');
  await page.fill('[name="newPassword"]', 'long-enough-pw');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('[data-status][data-tone="error"]');
  assert.match(await page.textContent('[data-status]'), /already exists/);
  await page.goto(`${BASE}#/forgot`);
  await page.fill('[name="email"]', 'alice@example.com');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('[data-status][data-tone="success"]');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await step('sync server unreachable: friendly login error and guest studying still works', async () => {
  const backend = makeBackend();
  backend.setOffline(true);
  const { page, errors, ctx } = await newPage({ width: 390, backend });
  await page.goto(`${BASE}#/login`);
  await page.fill('[name="email"]', 'alice@example.com');
  await page.fill('[name="password"]', 'correct-horse-1');
  await page.click('[data-auth] [type="submit"]');
  await page.waitForSelector('[data-status][data-tone="error"]', { timeout: 20000 });
  assert.match(await page.textContent('[data-status]'), /could not reach|offline/i);
  await page.goto(BASE);
  await page.click('[data-action="samples"]');
  await page.click('dialog button:has-text("Chemistry")');
  await page.waitForSelector('.qcard');
  await answer(page, 'right');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await step('returning user while the sync server is down: dashboard and warning, not an endless spinner', async () => {
  const backend = makeBackend();
  backend.setOffline(true);
  const { page, errors, ctx } = await newPage({ width: 390, backend });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const part = o => btoa(JSON.stringify(o)).replace(/=+$/, '');
    const exp = Math.floor(Date.now() / 1000) - 60; // token expired months ago
    localStorage.setItem('sb-tbydrjbqixrrowriuvjx-auth-token', JSON.stringify({ access_token: `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp })}.sig`, refresh_token: 'stale', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', email: 'returning@example.com', aud: 'authenticated' } }));
  });
  const t = Date.now();
  await page.goto(BASE);
  await page.waitForSelector('.dashboard', { timeout: 15000 });
  assert.ok(Date.now() - t < 10000, `dashboard took ${Date.now() - t}ms`);
  assert.match(await page.textContent('.banner--warn'), /Can’t reach the sync server/);
  await page.click('[data-sample="chemistry"]');
  await answer(page, 'right');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await step('offline: the installed app reloads and studies without a network', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const { page, errors } = await newPage({ context: ctx });
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.click('[data-action="samples"]');
  await page.click('dialog button:has-text("Spanish")');
  await page.waitForSelector('.qcard');
  await ctx.setOffline(true);
  await page.reload();
  await answer(page, 'right');
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('.dashboard');
  assert.equal(await page.locator('.deck-tile').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
