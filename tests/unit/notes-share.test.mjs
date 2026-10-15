// The notes are the C major scale, in tune; every note has a bar and a bell
// in the tray; music pieces keep their notes through saves (format 3, which
// still reads formats 1 and 2) and share links (format 2, which still reads
// format 1), and links carry whole boards.

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
const theme = await import(rootUrl('js/theme.js'));

test('the notes are do re mi fa so la ti do, C5 to C6, in tune', () => {
  assert.deepEqual(NOTES.map(n => n.name), ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'High C']);
  // equal temperament from A4 = 440 Hz, to a tenth of a cent
  const midi = [72, 74, 76, 77, 79, 81, 83, 84];
  NOTES.forEach((n, i) => {
    const cents = 1200 * Math.log2(n.hz / (440 * 2 ** ((midi[i] - 69) / 12)));
    assert.ok(Math.abs(cents) < 0.1, `${n.name}: ${n.hz} Hz is ${cents.toFixed(3)} cents out`);
  });
  assert.ok(Math.abs(NOTES[5].hz - 880) < 1e-9, 'A5 is 880 Hz');
  // whole, whole, half, whole, whole, whole, half
  const steps = NOTES.slice(1).map((n, i) => Math.round(12 * Math.log2(n.hz / NOTES[i].hz)));
  assert.deepEqual(steps, [2, 2, 1, 2, 2, 2, 1]);
});

test('every note has its own colour, and a bar and a bell in the tray', () => {
  const th = theme.current();
  assert.equal(th.notes.length, NOTES.length);
  assert.equal(new Set(th.notes.map(c => c.toLowerCase())).size, NOTES.length, 'eight different colours');
  const music = catalog.TRAY_GROUPS.find(g => g.id === 'music').items.map(i => catalog.BY_ID[i.type]);
  for (const role of ['bar', 'bell']) {
    const notes = music.filter(e => e.role === role).map(e => e.tunable.note);
    assert.deepEqual(notes, NOTES.map((_, n) => n), `a ${role} for every note, in scale order`);
  }
  assert.equal(new Set(music.map(e => e.name)).size, music.length, 'every tile has its own name');
});

test('a music piece starts on its own note and saves only a changed one', () => {
  const ding = new Piece(catalog.BY_ID.xylo2, 1, 1);
  assert.equal(ding.note, 4, 'Ding G');
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

test('save format 3 keeps notes; formats 1 and 2 still read', () => {
  const v3 = save.parseDoc({ v: 3, pieces: [{ t: 'bell', c: 1, r: 1, n: 6 }, { t: 'xylo1', c: 2, r: 1, n: 99 }, { t: 'ramp', c: 3, r: 1, n: 2 }] });
  assert.deepEqual(v3.pieces.map(p => p.n), [6, undefined, undefined]);
  assert.equal(v3.v, 3);
  // format 2 numbered the old six notes, C D E G A C: each keeps its pitch
  const v2 = save.parseDoc({ v: 2, pieces: [0, 1, 2, 3, 4, 5, 6].map(n => ({ t: 'bell', c: n, r: 1, n })) });
  assert.equal(v2.v, 3, 'read as format 3');
  assert.deepEqual(v2.pieces.map(p => p.n), [0, 1, 2, 4, 5, 7, undefined]);
  const v1 = save.parseDoc({ v: 1, pieces: [{ t: 'bell', c: 1, r: 1, n: 4 }] });
  assert.equal(v1.v, 3, 'read as format 3');
  assert.equal(v1.pieces[0].n, undefined, 'format 1 had no notes');
  assert.equal(save.parseDoc({ v: 4, pieces: [] }), null, 'a future format is refused');
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
    const saved = save.parseDoc({ v: 3, pieces: p.pieces }).pieces;
    const data = share.encode(saved);
    assert.match(data, /^2\.[A-Za-z0-9-]*$/);
    assert.equal(data.length, 2 + 5 * saved.length, `${p.id}: five characters a piece`);
    const doc = share.decode(data);
    assert.equal(board.board.signature(doc.pieces), board.board.signature(saved), p.id);
  }
  const tuned = [{ t: 'xylo1', c: 3, r: 2, rot: 1, f: 0, n: NOTES.length - 1 }, { t: 'ramp', c: 16, r: 8, rot: 2, f: 1 }];
  assert.deepEqual(share.decode(share.encode(tuned)).pieces, tuned);
  assert.ok(share.linkFor(tuned).startsWith('https://example.test/marblerun/#b=2.'));
});

test('a link from before the full scale still opens, every note at its old pitch', () => {
  // format 1: a bell on G (old note 3) and a bar on high C (old note 5)
  const doc = share.decode('1.s3203' + 't4405');
  assert.deepEqual(doc.pieces.map(p => [p.t, NOTES[p.n].name]), [['bell', 'G'], ['xylo1', 'High C']]);
});

test('a broken link opens nothing, and bad pieces in one are dropped', () => {
  for (const bad of ['', '1', '3.b000-', '1.b00', '1.b000-x', '<script>', '1.b00 0-']) {
    assert.equal(share.decode(bad), null, JSON.stringify(bad));
  }
  // unknown letters go when the link is read; cells off the grid when the
  // board loads (which knows each turned piece's footprint)
  const doc = share.decode('1.Z000-' + 'bzz0-' + 'b340-');
  const loaded = board.board.deserialize(doc.pieces).map(p => p.serialize());
  assert.deepEqual(loaded, [{ t: 'straight', c: 3, r: 4, rot: 0, f: 0 }]);
});
