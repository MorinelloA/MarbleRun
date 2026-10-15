// @ts-check
// Composite operations that touch both the board model and the physics
// world — used by input handling, the toolbar, menus and save/load. Player
// edits go through commitEdit() so they can be undone and get autosaved.

import { board } from './board.js';
import * as world from './world.js';
import * as save from './save.js';
import * as history from './history.js';

/** What's on the board, and whether the player changed it since it loaded. */
export const session = { dirty: false, source: 'empty' };

export function placePiece(piece) {
  board.place(piece);
  world.addPieceBodies(piece);
}

export function removePiece(piece) {
  board.remove(piece);
  world.removePieceBodies(piece);
}

export function clearBoard() {
  for (const piece of board.clear()) world.removePieceBodies(piece);
}

function setPieces(saved) {
  clearBoard();
  for (const piece of board.deserialize(saved)) {
    if (board.canPlace(piece, piece.col, piece.row)) placePiece(piece);
  }
}

/**
 * Replace the whole board and remove the marbles, without history or
 * backups. Low level: the debug handle (`__mr.loadPieces`) and the site's
 * walkthrough recorder use it directly.
 */
export function loadPieces(saved) {
  world.resetMarbles();
  setPieces(saved);
}

/** The board as plain records, to hand to commitEdit() when an edit ends. */
export function snapshot() {
  return board.serialize();
}

export function markEdited() {
  session.dirty = true;
  save.scheduleAutosave();
}

/**
 * Finish a player edit that started from `before`: add an undo step, mark
 * the board edited, autosave. A no-op when nothing actually changed.
 * @returns {boolean} whether the board changed
 */
export function commitEdit(before) {
  if (board.signature(before) === board.signature(board.serialize())) return false;
  history.record(before);
  markEdited();
  return true;
}

/**
 * Swap in a whole new board (a preset, a saved run, an empty board). A
 * build the player made is saved and backed up first, and the swap itself
 * can be undone.
 */
export function replaceBoard(pieces, { source = 'other' } = {}) {
  const before = board.serialize();
  save.flushAutosave();
  if (before.length) {
    if (session.dirty) save.pushBackup(before);
    history.record(before);
  }
  // Until the player edits this board, their last build lives only in the
  // autosave, which the first edit of something else would overwrite: keep
  // it among the backups (unless it's what's being opened).
  if (!session.dirty && source !== 'autosave') {
    const last = save.readAutosave();
    if (last) save.pushBackup(last.pieces);
  }
  loadPieces(pieces);
  session.dirty = false;
  session.source = source;
}

export function undo() {
  const snap = history.undo(board.serialize());
  if (!snap) return false;
  setPieces(snap);
  markEdited();
  return true;
}

export function redo() {
  const snap = history.redo(board.serialize());
  if (!snap) return false;
  setPieces(snap);
  markEdited();
  return true;
}
