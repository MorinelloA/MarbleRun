// Every piece type has art, every art entry is a real piece type, and each
// is drawn in a mode the renderer knows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const { catalog } = await loadGame();
const { ART, MODES } = await import(rootUrl('js/art/pieces.js'));

test('art covers the catalog exactly', () => {
  const ids = catalog.CATALOG.map(e => e.id).sort();
  assert.deepEqual(Object.keys(ART).sort(), ids);
});

test('every piece is drawn in a known mode, moving pieces as dynamic', () => {
  for (const entry of catalog.CATALOG) {
    const art = ART[entry.id];
    assert.ok(MODES.includes(art.mode), `${entry.id}: unknown mode ${art.mode}`);
    assert.equal(art.mode === 'dynamic', !!entry.dynamic, `${entry.id}: dynamic mode iff it moves`);
    assert.equal(typeof art.draw, 'function', `${entry.id}: no draw()`);
    if (art.mode === 'overlay') assert.equal(typeof art.overlay, 'function', `${entry.id}: no overlay()`);
  }
});
