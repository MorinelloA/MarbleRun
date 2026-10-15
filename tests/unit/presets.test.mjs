// Every preset must load completely: known piece types, inside the grid,
// and no two pieces sharing a cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../sim/matter.mjs';

const { presets, board } = await loadGame();
const b = board.board;

for (const p of presets.PRESETS) {
  test(`preset ${p.id} loads every piece`, () => {
    b.clear();
    const built = b.deserialize(p.pieces);
    assert.equal(built.length, p.pieces.length, 'unknown or out-of-bounds pieces');
    for (const piece of built) {
      assert.ok(b.canPlace(piece, piece.col, piece.row),
        `${piece.entry.id} at ${piece.col},${piece.row} overlaps another piece`);
      b.place(piece);
    }
    assert.ok(p.spawn.length > 0, 'no spawn points');
  });
}
