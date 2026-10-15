// What the game hears from the physics: a knock as hard as a marble struck
// (rolling over the seams between pieces makes none), the bars' notes with
// no knock on top, and what each marble is rolling on, so the rumble stays
// off the bars and Melody Lane's scale rings clear.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../sim/matter.mjs';

const { Matter, config, world, actions, board, presets } = await loadGame();
const { Body, Events, Vector } = Matter;
const { PHYS_DT, GRID, GRID_X, GRID_Y, MARBLE_R } = config;

const cellX = (c) => GRID_X + GRID * c;
const cellY = (r) => GRID_Y + GRID * r;
const run = (seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds * 1000 / PHYS_DT); i++) {
    world.step(PHYS_DT);
    each();
  }
};

const knocks = [];
world.on('impact', (into, other, marble) => knocks.push({ into, other, marble }));
const chimes = [];
world.on('chime', (note, speed, piece) => chimes.push(piece));

test('a marble rolling over the seams between pieces makes no knock', () => {
  actions.loadPieces([2, 3, 4, 5, 6, 7, 8, 9].map(c => ({ t: 'straight', c, r: 4 })));
  const m = world.spawnMarble(cellX(2) + 20, cellY(4) + 52 - MARBLE_R - 0.5);
  // rolling, not sliding: spun to match its speed
  Body.setVelocity(m, { x: 5, y: 0 });
  Body.setAngularVelocity(m, 5 / MARBLE_R);
  // what the old rule (a knock whenever a contact starts at a whole speed
  // over 2.2) would have done
  let oldKnocks = 0;
  const old = (ev) => {
    for (const p of ev.pairs) if ((p.bodyA === m || p.bodyB === m) && Vector.magnitude(m.velocity) > 2.2) oldKnocks++;
  };
  Events.on(world.engine, 'collisionStart', old);
  knocks.length = 0;
  run(1.5);
  Events.off(world.engine, 'collisionStart', old);

  assert.ok(m.position.x > cellX(6), `it rolled over at least four seams: x ${m.position.x}`);
  assert.ok(oldKnocks >= 3, `(the old rule knocked ${oldKnocks} times)`);
  assert.deepEqual(knocks.map(k => k.into.toFixed(2)), []);
});

test('a marble dropped onto a track knocks as hard as it fell, and its bounces softer', () => {
  actions.loadPieces([{ t: 'straight', c: 5, r: 6 }]);
  const m = world.spawnMarble(cellX(5) + 32, cellY(6) + 52 - MARBLE_R - 150);
  knocks.length = 0;
  let fall = 0;
  // between steps a velocity is px per 16.7 ms; a knock's speed, taken
  // inside the step, is px per step
  run(1, () => { if (knocks.length === 0) fall = m.velocity.y * PHYS_DT / (1000 / 60); });
  assert.ok(knocks.length >= 1, 'it knocked');
  assert.ok(Math.abs(knocks[0].into - fall) < 0.15 * fall, `first knock ${knocks[0].into}, falling at ${fall}`);
  for (let i = 1; i < knocks.length; i++) {
    assert.ok(knocks[i].into < knocks[i - 1].into, `bounce ${i}: ${knocks[i].into} after ${knocks[i - 1].into}`);
  }
});

test("Melody Lane's bars ring with no knock or rumble on top", () => {
  const preset = presets.PRESETS.find(p => p.id === 'melodylane');
  actions.loadPieces(preset.pieces);
  const bars = [...board.board.pieces].filter(p => p.entry.id === 'xylo1' && p.row === 3);
  assert.equal(bars.length, 8);
  const [x, y] = preset.spawn[0];
  const m = world.spawnMarble(x, y);
  knocks.length = 0;
  chimes.length = 0;
  const onBars = [];
  run(4, () => {
    // fully over the bars, clear of the ramp before them and the cup after
    const bx = m.position.x;
    if (bx > cellX(3) + MARBLE_R + 2 && bx < cellX(11) - MARBLE_R - 2) onBars.push(world.rollingOn(m.id));
  });

  for (const bar of bars) assert.ok(chimes.includes(bar), `the bar at column ${bar.col} rang`);
  const onBar = knocks.filter(k => k.other.plugin?.piece?.entry.id === 'xylo1');
  assert.equal(onBar.length, 0, 'no knock on a bar');
  assert.ok(onBars.length > 20, `it rolled along the bars (${onBars.length} steps)`);
  assert.ok(!onBars.includes('solid'), `no rumble over the bars: ${[...new Set(onBars)]}`);
  assert.ok(onBars.includes('music'));
});
