# Flashcard Studio: notes for agents

Live site: https://www.flashcardstudio.work/ (GitHub Pages from `main`, repo `boscivity/flashcardstudio`,
custom domain in `CNAME`, DNS and HTTPS through Cloudflare). Pushing to `main` deploys.

## Release rule

Every time the site is updated, bump the version. The version shows in the page footer and also
busts browser and service-worker caches, so skipping the bump can leave visitors on old files.

    node scripts/bump-version.mjs 2.0.1

The script rewrites every `?v=` query, `VERSION` in `assets/js/config.js` and `sw.js`, the footer
label in `index.html` and the version assertion in `tests/e2e.mjs`. New JS modules must be imported
with the same `?v=x.y.z` suffix, and you must add them to `SHELL` in `sw.js`.

## Architecture

- Static single-page app with no build step: plain ES modules in `assets/js`, one stylesheet
  `assets/css/app.css`, hash routes (`#/deck/<id>`, `#/study/<id>`, ...) in `assets/js/main.js`.
- `assets/js/views/*.js` holds one module per screen. Each exports a view function that renders into the root
  and returns a cleanup function.
- Render with the `html` tagged template from `ui.js`. It escapes every interpolation; only `raw()`
  skips escaping. Never build markup from user text another way.
- `fsrs.js` implements the FSRS-5 scheduler (Anki-style learning steps 1m/10m, 10m relearning).
  `session.js` plans study sessions and picks question modes. `answer.js` grades typed answers
  (typos, accents, articles and alternatives such as `a / b` are forgiven).
- `store.js` handles data. Guests keep decks in `localStorage` (`fcs:v2:guest`; the old
  `flashcardStudioSets` key is migrated). Signed-in users get a local cache plus a queue of pending
  changes, and each save merges with the cloud row card by card using the `srs.mod` / `clr`
  timestamps, so two devices do not overwrite each other's progress.
- `sw.js` serves pages network-first and versioned assets from the cache, so the app works offline.
- The CSP lives in a `<meta>` tag in `index.html`. If the Supabase project URL changes, update
  `connect-src` there as well as `assets/js/config.js`.

## Supabase

- Project ref `tbydrjbqixrrowriuvjx`, table `public.flashcard_sets` (id uuid, user_id uuid, name,
  columns jsonb, cards jsonb, templates jsonb). Auth is email + password with the implicit flow;
  password-reset links return to the site root.
- Row level security must restrict every operation to `auth.uid() = user_id`. The anon key in
  `config.js` is public by design; RLS is the only thing protecting data.
- Free projects pause after about a week without traffic. `.github/workflows/keepalive.yml` pings
  the API every two days and fails if the project is unreachable.
- When Supabase is down the app still works for studying, and login shows a friendly error.

## Run and test

    npm install          # dev only: Playwright for the browser tests
    npm start            # http://localhost:5173
    npm test             # unit tests (scheduler, grading, CSV, session planning)
    npm run test:e2e     # Chrome end-to-end tests at 390px and 1280px against a mocked Supabase

The e2e suite never touches the real Supabase project; it intercepts its URLs. It covers editing,
study sessions, flashcards, tests, match, CSV import/export, a 2,000-card deck, offline use,
sign-in, sync merging, stable card ids and isolation between two users. Run both suites before
pushing, and check the UI in a real browser at mobile and desktop widths in light and dark themes.

## Gotchas

- On the owner's home network, Spectrum Security Shield blocks the domain. Verify the live site
  from outside (for example check-host.net) and do not try to bypass the block.
- Keep `.gitattributes` (LF endings). `_config.yml` keeps dev files out of the published site.
- The domain's auto-renew is off in Cloudflare and it expires in early November each year.
  Renewal is a billing action for the owner to approve.
