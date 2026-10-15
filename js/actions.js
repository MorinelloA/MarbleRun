// @ts-check
// Composite operations that touch both the board model and the physics
// world — used by input handling, toolbar and save/load.

import { board } from './board.js';
import * as world from './world.js';
import { Piece } from './pieces/piece.js';
import { BY_ID } from './pieces/catalog.js';

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

/** Replace the whole board with a saved document's pieces. */
export function loadPieces(saved) {
  clearBoard();
  world.resetMarbles();
  for (const piece of board.deserialize(saved)) {
    if (board.canPlace(piece, piece.col, piece.row)) placePiece(piece);
  }
}

export function makePiece(typeId, col, row, rot = 0, flip = 0) {
  const entry = BY_ID[typeId];
  return entry ? new Piece(entry, col, row, rot, flip) : null;
}
