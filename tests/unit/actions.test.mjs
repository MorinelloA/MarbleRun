// Edits are undoable; replacing a build backs it up and can be undone too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const { board: boardMod, catalog } = await loadGame();
const actions = await import(rootUrl('js/actions.js'));
const history = await import(rootUrl('js/history.js'));
const save = await import(rootUrl('js/save.js'));
const { Piece } = await import(rootUrl('js/pieces/piece.js'));
const board = boardMod.board;

const sig = () => board.signature(board.serialize());

test('an edit can be undone and redone', () => {
  actions.loadPieces([{ t: 'ramp', c: 1, r: 1, rot: 0, f: 0 }]);
  const start = sig();
  const before = actions.snapshot();
  actions.placePiece(new Piece(catalog.BY_ID.block, 5, 5, 0, 0));
  assert.equal(actions.commitEdit(before), true);
  const after = sig();
  assert.equal(actions.session.dirty, true);

  assert.equal(actions.undo(), true);
  assert.equal(sig(), start);
  assert.equal(actions.redo(), true);
  assert.equal(sig(), after);
});

test('an edit that changes nothing adds no undo step', () => {
  actions.loadPieces([{ t: 'ramp', c: 1, r: 1, rot: 0, f: 0 }]);
  while (history.canUndo()) actions.undo();
  const before = actions.snapshot();
  assert.equal(actions.commitEdit(before), false);
  assert.equal(history.canUndo(), false);
});

test('replacing an edited build backs it up and can be undone', () => {
  store.clear();
  actions.loadPieces([]);
  const before = actions.snapshot();
  actions.placePiece(new Piece(catalog.BY_ID.block, 2, 2, 0, 0));
  actions.commitEdit(before);
  const built = sig();

  actions.replaceBoard([{ t: 'ramp', c: 0, r: 0, rot: 0, f: 0 }], { source: 'preset:x' });
  assert.equal(actions.session.dirty, false);
  assert.equal(actions.session.source, 'preset:x');
  assert.equal(board.signature(save.listBackups()[0].pieces), built);
  // the edited build was autosaved before the swap
  assert.equal(board.signature(save.readAutosave().pieces), built);

  actions.undo();
  assert.equal(sig(), built);
});

test('replacing an untouched preset makes no backup', () => {
  actions.replaceBoard([], { source: 'empty' }); // start from a clean session
  store.clear();
  actions.replaceBoard([{ t: 'ramp', c: 0, r: 0, rot: 0, f: 0 }], { source: 'preset:a' });
  actions.replaceBoard([{ t: 'block', c: 0, r: 0, rot: 0, f: 0 }], { source: 'preset:b' });
  assert.equal(save.listBackups().length, 0);
});

test('a fresh start keeps the last build safe before anything else loads', () => {
  // last visit: a build, autosaved; this visit starts with an empty board
  store.clear();
  actions.replaceBoard([], { source: 'empty' });
  const build = [{ t: 'block', c: 4, r: 4, rot: 0, f: 0 }, { t: 'ramp', c: 5, r: 3, rot: 0, f: 0 }];
  store.set('marblerun:autosave', JSON.stringify({ v: 2, name: 'autosave', ts: 1, pieces: build }));
  store.delete('marblerun:backups');

  // opening the build itself backs nothing up
  actions.replaceBoard(build, { source: 'autosave' });
  assert.equal(save.listBackups().length, 0);

  // opening anything else keeps it: an edit there would overwrite the autosave
  actions.replaceBoard([{ t: 'ramp', c: 0, r: 0, rot: 0, f: 0 }], { source: 'preset:a' });
  assert.equal(board.signature(save.listBackups()[0].pieces), board.signature(build));
  const before = actions.snapshot();
  actions.placePiece(new Piece(catalog.BY_ID.peg, 9, 1, 0, 0));
  actions.commitEdit(before);
  save.flushAutosave();
  assert.equal(board.signature(save.listBackups()[0].pieces), board.signature(build), 'still there after the edit');
});

test('only pieces with a mirrored twin can be mirrored', () => {
  assert.equal(new Piece(catalog.BY_ID.loop, 0, 0, 0, 1).flip, 0);
  assert.equal(new Piece(catalog.BY_ID.ramp, 0, 0, 0, 1).flip, 1);
});
