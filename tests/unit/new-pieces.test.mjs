// The conveyor, the one-way gate, the flip-flop and the goal cup do what
// they say, run headlessly on the game's own physics.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const { Matter, config, world, actions, board } = await loadGame();
const behaviors = await import(rootUrl('js/behaviors.js'));
const { Body } = Matter;
const { PHYS_DT, GRID, GRID_X, GRID_Y, MARBLE_R } = config;

const cellX = (c) => GRID_X + GRID * c;
const cellY = (r) => GRID_Y + GRID * r;
const run = (seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds * 1000 / PHYS_DT); i++) {
    world.step(PHYS_DT);
    each();
  }
};
/** A marble sitting on the track surface of row r (track tops are 52 down a cell). */
const onTrack = (x, r) => world.spawnMarble(x, cellY(r) + 52 - MARBLE_R - 0.5);

test('a conveyor carries a marble its way; its twin, the other way', () => {
  actions.loadPieces([{ t: 'conveyor', c: 4, r: 4 }, { t: 'conveyor', c: 8, r: 4, f: 1 }]);
  const right = onTrack(cellX(4) + 32, 4);
  const left = onTrack(cellX(8) + 32, 4);
  run(0.6);
  assert.ok(right.position.x > cellX(4) + 45, `right-hand belt: x ${right.position.x}`);
  assert.ok(left.position.x < cellX(8) + 19, `left-hand belt: x ${left.position.x}`);
});

test('a gate lets marbles through one way only', () => {
  const lane = [2, 3, 5, 6].map(c => ({ t: 'straight', c, r: 4 }));
  actions.loadPieces([...lane, { t: 'gate', c: 4, r: 4 }]);
  const flapX = cellX(4) + 32;
  let passes = 0;
  world.on('pass', () => { passes++; });

  // (a marble shoved along flat track soon slows to a gentle roll)
  const through = onTrack(cellX(3) + 20, 4);
  Body.setVelocity(through, { x: 4, y: 0 });
  run(3);
  assert.ok(through.position.x > flapX + MARBLE_R, `heading right it passes: x ${through.position.x}`);
  assert.equal(through.collisionFilter.mask & 0x0004, 0x0004, 'and the flap is solid to it again');
  assert.equal(passes, 1);

  actions.loadPieces([...lane, { t: 'gate', c: 4, r: 4 }]);
  const back = onTrack(cellX(5) + 44, 4);
  Body.setVelocity(back, { x: -4, y: 0 });
  let closest = Infinity;
  run(3, () => { closest = Math.min(closest, back.position.x); });
  assert.ok(closest > flapX, `heading left it is stopped: got to x ${closest}`);
  assert.ok(closest < flapX + 3 + MARBLE_R + 2, `(and it did reach the flap: x ${closest})`);
});

test('a mirrored gate lets marbles through leftward instead', () => {
  const lane = [2, 3, 5, 6].map(c => ({ t: 'straight', c, r: 4 }));
  actions.loadPieces([...lane, { t: 'gate', c: 4, r: 4, f: 1 }]);
  const flapX = cellX(4) + 32;
  const leftward = onTrack(cellX(5) + 44, 4);
  Body.setVelocity(leftward, { x: -4, y: 0 });
  run(3);
  assert.ok(leftward.position.x < flapX - MARBLE_R, `x ${leftward.position.x}`);
});

test('a flip-flop sends marbles left and right in turn', () => {
  actions.loadPieces([{ t: 'flipflop', c: 5, r: 3 }]);
  let flips = 0;
  world.on('flip', () => { flips++; });
  const pivotX = cellX(5) + 64;
  const sides = [];
  for (let k = 0; k < 4; k++) {
    const m = world.spawnMarble(pivotX, cellY(3) - 20);
    let side = null;
    run(1.6, () => {
      if (side === null && m.position.y > cellY(4) + 20) side = m.position.x > pivotX ? 'right' : 'left';
    });
    sides.push(side);
  }
  assert.deepEqual(sides, ['right', 'left', 'right', 'left']);
  assert.equal(flips, 4);
});

test('a goal cup counts each marble that reaches it once', () => {
  actions.loadPieces([{ t: 'goal', c: 5, r: 7 }]);
  const [piece] = [...board.board.pieces];
  const x = cellX(5) + 32;
  world.spawnMarble(x, cellY(6));
  run(1.2);
  assert.equal(behaviors.goalCount(piece), 1);
  world.spawnMarble(x + 3, cellY(6));
  run(1.5);
  assert.equal(behaviors.goalCount(piece), 2);
  run(1.5); // marbles settling in the cup aren't counted again
  assert.equal(behaviors.goalCount(piece), 2);
  behaviors.resetGoals();
  assert.equal(behaviors.goalCount(piece), 0);
});
