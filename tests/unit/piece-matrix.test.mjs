// The art is drawn in each entry's own coordinates under pieceMatrix,
// while the physics uses the parts transformParts turned and mirrored. The
// two must agree for every piece, turn and mirror, or the drawing and the
// bodies drift apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const { catalog, config } = await loadGame();
const { pieceMatrix, transformParts, transformPoint, Piece } = await import(rootUrl('js/pieces/piece.js'));
const { CATALOG } = catalog;
const { GRID } = config;

const EPS = 1e-9;
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

test('pieceMatrix places every part where transformParts does', () => {
  let checked = 0;
  for (const entry of CATALOG) {
    const local = entry.build(null);
    for (let rot = 0; rot < 4; rot++) {
      for (const flip of [0, 1]) {
        const where = `${entry.id} rot ${rot} flip ${flip}`;
        const m = pieceMatrix(entry, rot, flip);
        assert.ok(Math.abs(Math.abs(m[0] * m[3] - m[1] * m[2]) - 1) < EPS, `${where}: not a rigid transform`);
        const parts = transformParts(entry, rot, flip);
        local.forEach((p, i) => {
          const q = parts[i];
          const [x, y] = apply(m, p.x, p.y);
          assert.ok(Math.abs(x - q.x) < EPS && Math.abs(y - q.y) < EPS,
            `${where}, part ${i}: matrix puts it at ${x},${y}, physics at ${q.x},${q.y}`);
          if (p.kind === 'rect') {
            // a rectangle's long axis must match (its direction may differ by
            // half a turn, which is the same rectangle)
            const dx = m[0] * Math.cos(p.a) + m[2] * Math.sin(p.a);
            const dy = m[1] * Math.cos(p.a) + m[3] * Math.sin(p.a);
            const cross = dx * Math.sin(q.a) - dy * Math.cos(q.a);
            assert.ok(Math.abs(cross) < EPS, `${where}, part ${i}: angle differs`);
          }
          checked++;
        });
        if (entry.dynamic) {
          const [px, py] = apply(m, ...entry.dynamic.pivot);
          const [qx, qy] = transformPoint(entry, entry.dynamic.pivot, rot, flip);
          assert.ok(Math.abs(px - qx) < EPS && Math.abs(py - qy) < EPS, `${where}: pivot differs`);
        }
        // the footprint lands on the turned footprint
        const fw = (rot % 2 ? entry.cells[1] : entry.cells[0]) * GRID;
        const fh = (rot % 2 ? entry.cells[0] : entry.cells[1]) * GRID;
        const corners = [[0, 0], [entry.cells[0] * GRID, entry.cells[1] * GRID]].map(([x, y]) => apply(m, x, y));
        const xs = corners.map(c => c[0]).sort((a, b) => a - b);
        const ys = corners.map(c => c[1]).sort((a, b) => a - b);
        assert.deepEqual([xs[0], xs[1], ys[0], ys[1]].map(v => Math.round(v)), [0, fw, 0, fh], `${where}: footprint`);
      }
    }
  }
  const parts = CATALOG.reduce((n, e) => n + e.build(null).length, 0);
  assert.equal(checked, parts * 8, 'every part in every orientation');
});

test('moving pieces turn about their pivot', () => {
  // the art draws a moving piece turned about its pivot, which is only
  // right if the physics body's centre of mass is the pivot too
  for (const entry of CATALOG.filter(e => e.dynamic)) {
    const piece = new Piece(entry, 3, 3);
    const [body] = piece.buildBodies();
    const [px, py] = transformPoint(entry, entry.dynamic.pivot, 0, 0);
    const a = body.angle;
    piece.parts.forEach((p, i) => {
      const live = body.parts[i + 1].position;
      const ox = piece.x + px, oy = piece.y + py;
      const ex = ox + Math.cos(a) * (p.x - px) - Math.sin(a) * (p.y - py);
      const ey = oy + Math.sin(a) * (p.x - px) + Math.cos(a) * (p.y - py);
      assert.ok(Math.hypot(live.x - ex, live.y - ey) < 0.01,
        `${entry.id} part ${i}: body has it at ${live.x},${live.y}, art at ${ex},${ey}`);
    });
  }
});
