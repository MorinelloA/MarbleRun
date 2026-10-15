// Writes sw.js's list of files to keep offline and its version, a hash of
// those files' contents. Run it before every deploy:
//
//   node tools/stamp-sw.mjs           restamp sw.js
//   node tools/stamp-sw.mjs --check   exit 1 if sw.js is out of date
//
// A deploy that changes any file then gets a new version, so installed
// copies fetch it all afresh and drop the old cache.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'sw.js');

function walk(dir, keep) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel, keep));
    else if (keep(name)) out.push(rel);
  }
  return out;
}

/** What the app needs to run offline, and the version those files make. */
export function plan() {
  const files = [
    'index.html',
    'manifest.webmanifest',
    'css/style.css',
    'vendor/matter.min.js',
    ...walk('fonts', n => n.endsWith('.woff2')),
    ...walk('icons', n => n.endsWith('.png')),
    ...walk('js', n => n.endsWith('.js')),
  ];
  const hash = createHash('sha1');
  for (const f of files) hash.update(f).update(readFileSync(path.join(ROOT, f)));
  return { assets: ['./', ...files], version: `mr-${hash.digest('hex').slice(0, 12)}` };
}

/** sw.js with this plan written in. */
export function stamped(src, { assets, version }) {
  return src
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
    .replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assets.map(a => `  '${a}',`).join('\n')}\n];`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = readFileSync(SW, 'utf8');
  const next = stamped(src, plan());
  if (process.argv.includes('--check')) {
    if (next !== src) {
      console.error('sw.js is out of date: run node tools/stamp-sw.mjs');
      process.exit(1);
    }
    console.log('sw.js is current');
  } else {
    writeFileSync(SW, next);
    console.log(`stamped sw.js: ${plan().version}, ${plan().assets.length} files`);
  }
}
