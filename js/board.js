// @ts-check
// Grid model: which cells are occupied by which piece, placement rules,
// serialization. Physics side effects (adding/removing bodies) are done
// through the world module by whoever mutates the board.

import { GRID, COLS, ROWS, GRID_X, GRID_Y } from './config.js';
import { Piece } from './pieces/piece.js';
import { BY_ID } from './pieces/catalog.js';

export const board = {
  /** @type {Map<string, Piece>} cell key "c,r" -> piece */
  cells: new Map(),
  /** @type {Set<Piece>} */
  pieces: new Set(),
  /** @type {Array<() => void>} */
  listeners: [],

  onChange(fn) { this.listeners.push(fn); },
  emit() { for (const fn of this.listeners) fn(); },

  worldToCell(x, y) {
    return {
      col: Math.floor((x - GRID_X) / GRID),
      row: Math.floor((y - GRID_Y) / GRID),
    };
  },

  inBounds(col, row, fw = 1, fh = 1) {
    return col >= 0 && row >= 0 && col + fw <= COLS && row + fh <= ROWS;
  },

  /** Can a piece with this rotated footprint go at (col,row)?
   *  `ignore` lets a piece being moved not collide with itself. */
  canPlace(piece, col, row, ignore = null) {
    if (!this.inBounds(col, row, piece.fw, piece.fh)) return false;
    for (const key of piece.footprintKeys(col, row)) {
      const occ = this.cells.get(key);
      if (occ && occ !== ignore) return false;
    }
    return true;
  },

  pieceAt(col, row) {
    return this.cells.get(`${col},${row}`) || null;
  },

  /** Place an already-constructed Piece. Returns its bodies to add to physics. */
  place(piece) {
    for (const key of piece.footprintKeys()) this.cells.set(key, piece);
    this.pieces.add(piece);
    const bodies = piece.buildBodies();
    this.emit();
    return piece;
  },

  /** Remove a piece. Caller removes its bodies from physics. */
  remove(piece) {
    for (const key of piece.footprintKeys()) {
      if (this.cells.get(key) === piece) this.cells.delete(key);
    }
    this.pieces.delete(piece);
    this.emit();
  },

  clear() {
    const all = [...this.pieces];
    this.cells.clear();
    this.pieces.clear();
    this.emit();
    return all;
  },

  serialize() {
    return [...this.pieces].map(p => p.serialize());
  },

  /** Build Piece objects from saved data (does not add them anywhere). */
  deserialize(saved) {
    const out = [];
    for (const s of saved || []) {
      const entry = BY_ID[s.t];
      if (!entry) { console.warn('Unknown piece type in save:', s.t); continue; }
      const piece = new Piece(entry, s.c, s.r, s.rot, s.f);
      if (!this.inBounds(piece.col, piece.row, piece.fw, piece.fh)) continue;
      out.push(piece);
    }
    return out;
  },
};
