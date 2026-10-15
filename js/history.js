// @ts-check
// Undo and redo for board edits. A board is a few dozen tiny records, so
// each step keeps a whole snapshot rather than a diff.

const LIMIT = 10;
/** @type {any[][]} */
const undos = [];
/** @type {any[][]} */
const redos = [];
const listeners = [];

function changed() { for (const fn of listeners) fn(); }

/** Remember the board as it was before an edit. */
export function record(snapshot) {
  undos.push(snapshot);
  if (undos.length > LIMIT) undos.shift();
  redos.length = 0;
  changed();
}

/** @returns the snapshot to restore, or null */
export function undo(current) {
  if (!undos.length) return null;
  redos.push(current);
  const s = undos.pop();
  changed();
  return s;
}

/** @returns the snapshot to restore, or null */
export function redo(current) {
  if (!redos.length) return null;
  undos.push(current);
  const s = redos.pop();
  changed();
  return s;
}

export function canUndo() { return undos.length > 0; }
export function canRedo() { return redos.length > 0; }
export function onHistoryChange(fn) { listeners.push(fn); }
