// @ts-check
// Where a dragged piece lands. Pure functions of the ghost's top-left corner
// in board pixels, so the touch rules can be unit tested without a DOM.

import { GRID, GRID_X, GRID_Y, COLS, ROWS, BOARD_H } from './config.js';

/**
 * Nearest grid cell for a ghost whose top-left corner is at (gx, gy), or
 * null when the footprint would stick out of the grid.
 */
export function ghostCell(gx, gy, fw, fh) {
  const col = Math.round((gx - GRID_X) / GRID);
  const row = Math.round((gy - GRID_Y) / GRID);
  if (col < 0 || row < 0 || col + fw > COLS || row + fh > ROWS) return null;
  return { col, row };
}

/**
 * True when a piece already on the board has been dragged down onto the
 * tray to throw it away: its ghost's centre has left the board. New pieces
 * coming out of the tray are never "trash"; letting go over the tray just
 * puts them back.
 * @param {'new'|'existing'} kind
 */
export function isTrash(kind, gx, gy, fw, fh) {
  return kind === 'existing' && gy + (fh * GRID) / 2 > BOARD_H;
}
