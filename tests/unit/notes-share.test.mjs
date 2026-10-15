// Music pieces keep their notes through saves (format 2, which still
// reads format 1) and share links, and links carry whole boards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location = { origin: 'https://example.test', pathname: '/marblerun/', search: '', hash: '' };

const { catalog, board, presets } = await loadGame();
const save = await import(rootUrl('js/save.js'));
const share = await import(rootUrl('js/share.js'));
const { Piece } = await import(rootUrl('js/pieces/piece.js'));
const { NOTES } = await import(rootUrl('js/music.js'));

test('a music piece starts on its own note and saves only a changed one', () => {
  const ding = new Piece(catalog.BY_ID.xylo2, 1, 1);
  assert.equal(ding.note, 3);
  assert.equal('n' in ding.serialize(), false);
  ding.note = 5;
  assert.equal(ding.serialize().n, 5);
  const back = board.board.deserialize([ding.serialize()])[0];
  assert.equal(back.note, 5);
  assert.notEqual(board.board.signature([ding.serialize()]), board.board.signature([{ t: 'xylo2', c: 1, r: 1, rot: 0, f: 0 }]),
    'a retuned bar is a change (undo, autosave)');
  assert.equal(new Piece(catalog.BY_ID.ramp, 0, 0, 0, 0, 3).note, null, 'only music pieces have notes');
  assert.equal(new Piece(catalog.BY_ID.bell, 0, 0, 0, 0, 99).note, 0, 'a bad note falls back');
});

test('save format 2 keeps notes; format 1 still reads', () => {
  const v2 = save.parseDoc({ v: 2, pieces: [{ t: 'bell', c: 1, r: 1, n: 4 }, { t: 'xylo1', c: 2, r: 1, n: 99 }, { t: 'ramp', c: 3, r: 1, n: 2 }] });
  assert.deepEqual(v2.pieces.map(p => p.n), [4, undefined, undefined]);
  assert.equal(v2.v, 2);
  const v1 = save.parseDoc({ v: 1, pieces: [{ t: 'bell', c: 1, r: 1, n: 4 }] });
  assert.equal(v1.v, 2, 'read as format 2');
  assert.equal(v1.pieces[0].n, undefined, 'format 1 had no notes');
  assert.equal(save.parseDoc({ v: 3, pieces: [] }), null, 'a future format is refused');
});

test('every piece type has its own link letter', () => {
  const ids = catalog.CATALOG.map(e => e.id);
  assert.deepEqual(Object.keys(share.CODES).sort(), [...ids].sort());
  const letters = Object.values(share.CODES);
  assert.equal(new Set(letters).size, letters.length);
  for (const l of letters) assert.match(l, /^[A-Za-z]$/);
});

test('a link carries a whole board, notes and all', () => {
  for (const p of presets.PRESETS) {
    const saved = save.parseDoc({ v: 2, pieces: p.pieces }).pieces;
    const data = share.encode(saved);
    assert.match(data, /^1\.[A-Za-z0-9-]*$/);
    assert.equal(data.length, 2 + 5 * saved.length, `${p.id}: five characters a piece`);
    const doc = share.decode(data);
    assert.equal(board.board.signature(doc.pieces), board.board.signature(saved), p.id);
  }
  const tuned = [{ t: 'xylo1', c: 3, r: 2, rot: 1, f: 0, n: NOTES.length - 1 }, { t: 'ramp', c: 16, r: 8, rot: 2, f: 1 }];
  assert.deepEqual(share.decode(share.encode(tuned)).pieces, tuned);
  assert.ok(share.linkFor(tuned).startsWith('https://example.test/marblerun/#b=1.'));
});

test('a broken link opens nothing, and bad pieces in one are dropped', () => {
  for (const bad of ['', '1', '2.b000-', '1.b00', '1.b000-x', '<script>', '1.b00 0-']) {
    assert.equal(share.decode(bad), null, JSON.stringify(bad));
  }
  // unknown letters go when the link is read; cells off the grid when the
  // board loads (which knows each turned piece's footprint)
  const doc = share.decode('1.Z000-' + 'bzz0-' + 'b340-');
  const loaded = board.board.deserialize(doc.pieces).map(p => p.serialize());
  assert.deepEqual(loaded, [{ t: 'straight', c: 3, r: 4, rot: 0, f: 0 }]);
});
