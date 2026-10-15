// The installable, offline app: the service worker keeps every file the
// game loads, and the manifest names real icons.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, rootUrl } from '../sim/matter.mjs';

const { plan } = await import(rootUrl('tools/stamp-sw.mjs'));
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const listed = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('the service worker keeps every file the game needs offline', () => {
  assert.deepEqual(listed, plan().assets, 'sw.js is out of date: run node tools/stamp-sw.mjs');
  for (const file of listed.filter(f => f !== './')) assert.ok(existsSync(path.join(ROOT, file)), file);
});

test('every module the game imports is kept', () => {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1] || m[2])));
    }
  };
  visit('js/main.js');
  const missing = [...seen].filter(f => !listed.includes(f));
  assert.deepEqual(missing, []);
});

test('the manifest is installable and its icons exist', () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'fullscreen');
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.start_url, './', 'relative, so it works under any path');
  assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const icon of m.icons) {
    assert.ok(existsSync(path.join(ROOT, icon.src)), icon.src);
    assert.ok(listed.includes(icon.src), `${icon.src} kept offline`);
  }
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const href of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
    if (href[1].startsWith('#')) continue;
    assert.ok(existsSync(path.join(ROOT, href[1])), `index.html links ${href[1]}`);
  }
});
