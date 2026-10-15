// Save documents are validated on the way in, and old un-namespaced keys
// move to `marblerun:` keys once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

await loadGame();
const save = await import(rootUrl('js/save.js'));

test('parseDoc rejects documents that are not boards', () => {
  for (const bad of [null, undefined, 3, 'x', [], {}, { pieces: 'no' }, { v: 99, pieces: [] }]) {
    assert.equal(save.parseDoc(bad), null, JSON.stringify(bad));
  }
});

test('parseDoc keeps valid pieces and normalizes the rest', () => {
  const doc = save.parseDoc({
    name: '  My run  ',
    ts: 123,
    pieces: [
      { t: 'ramp', c: 1, r: 2, rot: 5, f: true },
      { t: 'nope', c: 0, r: 0 },
      { t: 'ramp', c: 1.5, r: 2 },
      null,
      { t: 'toString', c: 0, r: 0 },
      { t: 'block', c: 3, r: 4 },
    ],
    thumb: '<img onerror=alert(1)>',
  });
  assert.deepEqual(doc.pieces, [
    { t: 'ramp', c: 1, r: 2, rot: 1, f: 1 },
    { t: 'block', c: 3, r: 4, rot: 0, f: 0 },
  ]);
  assert.equal(doc.name, 'My run');
  assert.equal(doc.ts, 123);
  assert.equal(doc.thumb, null);
  assert.equal(save.parseDoc({ pieces: [] }).name, 'Marble Run');
});

test('legacy mr.* saves move to marblerun: keys', () => {
  store.clear();
  const run = { v: 1, name: 'Old run', ts: 5, pieces: [{ t: 'ramp', c: 0, r: 0, rot: 0, f: 0 }] };
  store.set('mr.autosave', JSON.stringify(run));
  store.set('mr.slots', JSON.stringify(['s1', 's2']));
  store.set('mr.slot.s1', JSON.stringify(run));
  store.set('mr.slot.s2', '{broken json');
  save.migrateLegacyKeys();
  assert.equal(save.readAutosave().name, 'Old run');
  assert.deepEqual(save.listSlots().map(s => s.id), ['s1']);
  assert.equal(store.has('mr.autosave'), false);
  assert.equal(store.has('mr.slot.s1'), false);
  // the unreadable slot stays where it was, and so does the list naming it
  assert.equal(store.has('mr.slot.s2'), true);
  assert.equal(store.has('mr.slots'), true);
  // running again changes nothing
  save.migrateLegacyKeys();
  assert.deepEqual(save.listSlots().map(s => s.id), ['s1']);
});

test('default names skip ones already taken', () => {
  store.clear();
  save.migrateLegacyKeys();
  assert.equal(save.nextDefaultName(), 'Marble Run 1');
  store.set('marblerun:slots', JSON.stringify(['a']));
  store.set('marblerun:slot:a', JSON.stringify({ v: 1, name: 'Marble Run 1', ts: 1, pieces: [] }));
  assert.equal(save.nextDefaultName(), 'Marble Run 2');
});

test('saved runs can be renamed, copied and saved over, names kept unique', async () => {
  store.clear();
  const { board } = await import(rootUrl('js/board.js'));
  const actions = await import(rootUrl('js/actions.js'));
  actions.loadPieces([{ t: 'ramp', c: 0, r: 0 }]);
  const a = save.saveSlot('Loop city');
  const b = save.saveSlot('Loop city');
  assert.ok(a && b && a !== b);
  assert.deepEqual(save.listSlots().map(s => s.doc.name), ['Loop city 2', 'Loop city']);

  assert.equal(save.renameSlot(a, '  Loop city 2 '), 'Loop city 3', 'a taken name is made unique');
  assert.equal(save.renameSlot(a, ''), null, 'an empty name changes nothing');
  assert.equal(save.renameSlot(a, 'Loop city 3'), null, 'the same name changes nothing');

  const c = save.duplicateSlot(a);
  const names = save.listSlots().map(s => s.doc.name);
  assert.deepEqual(names, ['Loop city 2', 'Loop city 3', 'Loop city 4'], 'the copy follows the original');

  actions.loadPieces([{ t: 'block', c: 5, r: 5 }, { t: 'peg', c: 6, r: 5 }]);
  assert.equal(save.overwriteSlot(c), true);
  const saved = save.listSlots().find(s => s.id === c).doc;
  assert.equal(saved.name, 'Loop city 4', 'saving over keeps the name');
  assert.equal(board.signature(saved.pieces), board.signature(board.serialize()));
  assert.equal(save.overwriteSlot('missing'), false);
  actions.loadPieces([]);
});

test('backups keep the newest five distinct boards', () => {
  store.clear();
  for (let i = 0; i < 7; i++) save.pushBackup([{ t: 'block', c: i, r: 0, rot: 0, f: 0 }]);
  save.pushBackup([{ t: 'block', c: 6, r: 0, rot: 0, f: 0 }]); // same as the newest
  const list = save.listBackups();
  assert.equal(list.length, 5);
  assert.equal(list[0].pieces[0].c, 6);
  assert.equal(list[4].pieces[0].c, 2);
});
