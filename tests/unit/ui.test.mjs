// The tray's kinds cover every piece exactly once, and the interface is
// drawn with icons, not emoji.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadGame } from '../sim/matter.mjs';

const { catalog } = await loadGame();

test('the tray kinds hold every tray item exactly once', () => {
  const key = (i) => `${i.type}:${i.flip}`;
  const grouped = catalog.TRAY_GROUPS.flatMap(g => g.items.map(key));
  assert.equal(new Set(grouped).size, grouped.length, 'an item is in two kinds');
  assert.deepEqual([...grouped].sort(), catalog.TRAY_ITEMS.map(key).sort());
});

test('a mirrored twin sits right after its piece', () => {
  for (const g of catalog.TRAY_GROUPS) {
    g.items.forEach((item, i) => {
      if (item.flip) assert.deepEqual(g.items[i - 1], { type: item.type, flip: 0 }, `${item.type} twin in ${g.id}`);
    });
  }
});

test('every kind has an icon in the sprite', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const g of catalog.TRAY_GROUPS) assert.match(html, new RegExp(`<symbol id="i-${g.icon}"`), g.id);
});

test('no emoji (or old glyph icons) in the interface', () => {
  const uiDir = path.join(ROOT, 'js', 'ui');
  const files = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'js', 'presets.js'),
    ...readdirSync(uiDir).filter(f => f.endsWith('.js')).map(f => path.join(uiDir, f)),
  ];
  const found = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\p{Extended_Pictographic}|[↶↷⇄✕➕⭐]/gu)) {
      found.push(`${path.relative(ROOT, file)}: ${m[0]}`);
    }
  }
  assert.deepEqual(found, []);
});
