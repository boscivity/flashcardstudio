// Sets the app version everywhere it appears: the `?v=` cache-busting query on every
// asset URL, the service worker cache name, config.js and the footer label.
// Usage: node scripts/bump-version.mjs 2.0.1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || '')) {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch>');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : walk(p);
    return /\.(js|mjs)$/.test(e.name) ? [p] : [];
  });
}

const files = [
  'index.html',
  'sw.js',
  ...walk(path.join(root, 'assets', 'js')).map(p => path.relative(root, p)),
  ...walk(path.join(root, 'tests')).map(p => path.relative(root, p))
];

let changed = 0;
for (const rel of files) {
  const file = path.join(root, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/\?v=\d+\.\d+\.\d+/g, `?v=${next}`)
    .replace(/(export const VERSION = ')\d+\.\d+\.\d+(')/, `$1${next}$2`)
    .replace(/(const VERSION = ')\d+\.\d+\.\d+(';)/, `$1${next}$2`)
    .replace(/(<span class="version">v)\d+\.\d+\.\d+(<\/span>)/, `$1${next}$2`)
    .replace(/(textContent\('\.version'\), 'v)\d+\.\d+\.\d+(')/, `$1${next}$2`);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
  }
}
console.log(`Version set to ${next} in ${changed} files.`);
