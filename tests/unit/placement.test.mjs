// Touch placement rules: where a dragged ghost snaps, and when it's trash.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rootUrl } from '../sim/matter.mjs';

const { ghostCell, isTrash } = await import(rootUrl('js/placement.js'));
const { GRID, GRID_X, GRID_Y, BOARD_H } = await import(rootUrl('js/config.js'));

const TOUCH_LIFT = 60;
// a new piece from the tray: centred on the finger and lifted above it
const newGhost = (fx, fy, fw, fh) => [fx - (fw * GRID) / 2, fy - (fh * GRID) / 2 - TOUCH_LIFT];

test('a 1-row piece snaps into the bottom row with the finger anywhere over the top of the tray', () => {
  for (let fy = BOARD_H; fy < BOARD_H + 60; fy++) {
    const [gx, gy] = newGhost(GRID_X + 5 * GRID + 32, fy, 1, 1);
    assert.deepEqual(ghostCell(gx, gy, 1, 1), { col: 5, row: 8 }, `finger at y=${fy}`);
    assert.equal(isTrash('new', gx, gy, 1, 1), false);
  }
});

test('a 2-row piece snaps into rows 7-8 across a full cell of finger travel', () => {
  let band = 0;
  for (let fy = BOARD_H - 80; fy < BOARD_H + 80; fy++) {
    const [gx, gy] = newGhost(GRID_X + 3 * GRID + 32, fy, 1, 2);
    const cell = ghostCell(gx, gy, 1, 2);
    if (cell && cell.row === 7) band++;
  }
  assert.equal(band, GRID);
});

test('ghosts never snap outside the grid', () => {
  assert.equal(ghostCell(GRID_X - 40, GRID_Y, 1, 1), null);
  assert.equal(ghostCell(GRID_X + 16 * GRID, GRID_Y, 2, 1), null);
  assert.equal(ghostCell(GRID_X, GRID_Y - 40, 1, 1), null);
  assert.deepEqual(ghostCell(GRID_X + 15 * GRID, GRID_Y, 2, 2), { col: 15, row: 0 });
});

test('an existing piece becomes trash once its centre leaves the board, a new one never does', () => {
  const gx = GRID_X + 4 * GRID;
  // grabbed at its centre, moved with the finger
  assert.equal(isTrash('existing', gx, BOARD_H - 40, 1, 1), false);
  assert.equal(isTrash('existing', gx, BOARD_H - 31, 1, 1), true);
  assert.equal(isTrash('new', gx, BOARD_H + 50, 1, 1), false);
  // an existing piece dragged so it would land in row 8 is placed, not trashed
  const gy = GRID_Y + 8 * GRID + 20;
  assert.deepEqual(ghostCell(gx, gy, 1, 1), { col: 4, row: 8 });
  assert.equal(isTrash('existing', gx, gy, 1, 1), false);
});
