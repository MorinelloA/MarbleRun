// @ts-check
// Matter.js engine, marble lifecycle, collision event fan-out. What pieces
// do to marbles (conveyors, cannons, loop gates) lives in behaviors.js.

import {
  BOARD_W, BOARD_H, MARBLE_R, MAX_MARBLES, SPEED_CLAMP, MARBLE_COLORS, GRID, GRID_X, COLS,
  IMPACT_MIN_SPEED,
} from './config.js';
import * as behaviors from './behaviors.js';

const { Engine, World, Bodies, Body, Events, Composite, Vector } = window.Matter;

// Matter gives a circle of radius 11 only 12 sides, and a 12-gon rolling on
// a flat track bobs a third of a pixel per facet. 24 sides roll smoothly.
const MARBLE_SIDES = 24;

// Sleeping stays off. With it on, Matter keeps a finished contact alive
// without firing collisionEnd (and later revives it without collisionStart)
// whenever both bodies have a positive sleep counter. Static pieces always
// do, and a marble's counter grows while it rests or is held, so its next
// hits went silent and cannons stopped firing.
export const engine = Engine.create({
  enableSleeping: false,
  positionIterations: 6,
  velocityIterations: 4,
});
engine.gravity.y = 1;

/** @type {any[]} live marble bodies, oldest first */
export const marbles = [];

/** marble.id -> number of active non-sensor contacts */
const contactCounts = new Map();

/** marble.id -> performance.now() of the last touch. Rolling audio treats
 *  "touched very recently" as rolling — raw contact flickers every few
 *  steps as the marble micro-bounces, which would make the sound flutter. */
const lastContact = new Map();
const CONTACT_STICKY_MS = 120;

export function isRolling(marbleId) {
  if ((contactCounts.get(marbleId) || 0) > 0) return true;
  return performance.now() - (lastContact.get(marbleId) || -1e9) < CONTACT_STICKY_MS;
}

// ---- event fan-out (audio and visual effects subscribe to these) ----
const handlers = { impact: [], sensorEnter: [], sensorExit: [], chime: [], marbleRemoved: [] };
export function on(type, fn) { handlers[type].push(fn); }
function emit(type, ...args) { for (const fn of handlers[type]) fn(...args); }
behaviors.init(emit);

// ---- world bounds: closed floor + side walls at the grid's edges ----
// The walls stand at the outer grid lines, not the canvas edges: in the
// ~22 px strips beyond the grid no piece can be placed, so a marble that
// fell in there was lost.
const WALL = 80;
const LEFT = GRID_X;
const RIGHT = GRID_X + COLS * GRID;
World.add(engine.world, [
  Bodies.rectangle(BOARD_W / 2, BOARD_H + WALL / 2 - 6, BOARD_W + WALL * 2, WALL,
    { isStatic: true, label: 'floor', friction: 0.05 }),
  Bodies.rectangle(LEFT - WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
  Bodies.rectangle(RIGHT + WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
]);

let colorIdx = 0;

export function spawnMarble(x, y) {
  if (marbles.length >= MAX_MARBLES) removeMarble(marbles[0]);
  const b = Bodies.polygon(x, y, MARBLE_SIDES, MARBLE_R, {
    restitution: 0.35,
    friction: 0.02,
    frictionAir: 0.0012,
    frictionStatic: 0.01,
    density: 0.002,
    label: 'marble',
  });
  b.plugin.color = MARBLE_COLORS[colorIdx++ % MARBLE_COLORS.length];
  marbles.push(b);
  World.add(engine.world, b);
  return b;
}

export function removeMarble(b) {
  const i = marbles.indexOf(b);
  if (i >= 0) marbles.splice(i, 1);
  contactCounts.delete(b.id);
  lastContact.delete(b.id);
  World.remove(engine.world, b);
  emit('marbleRemoved', b);
}

export function resetMarbles() {
  for (const b of [...marbles]) removeMarble(b);
}

/** Simulated time in ms (advances only while physics steps). */
export function simTime() { return engine.timing.timestamp; }

export function addPieceBodies(piece) {
  World.add(engine.world, piece.bodies);
  if (piece.constraint) World.add(engine.world, piece.constraint);
  behaviors.onPieceAdded(piece);
}

export function removePieceBodies(piece) {
  behaviors.onPieceRemoved(piece);
  for (const b of piece.bodies) World.remove(engine.world, b);
  if (piece.constraint) World.remove(engine.world, piece.constraint);
}

// ---- collision fan-out ----
function marbleOf(pair) {
  if (pair.bodyA.label === 'marble') return pair.bodyA;
  if (pair.bodyB.label === 'marble') return pair.bodyB;
  return null;
}
function otherOf(pair, marble) {
  return pair.bodyA === marble ? pair.bodyB : pair.bodyA;
}
/** walk up to the compound root for dynamic pieces */
function rootOf(body) { return body.parent && body.parent !== body ? body.parent : body; }
function pieceOf(body) { return body.plugin?.piece || rootOf(body).plugin?.piece; }
function sensorName(body) {
  const b = body.plugin?.behavior;
  return b ? (b.name || b.type) : body.label;
}

function touch(m) {
  contactCounts.set(m.id, (contactCounts.get(m.id) || 0) + 1);
  lastContact.set(m.id, performance.now());
}
function untouch(m) {
  const n = (contactCounts.get(m.id) || 1) - 1;
  if (n <= 0) contactCounts.delete(m.id); else contactCounts.set(m.id, n);
}

Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const m = marbleOf(pair);
    if (!m) continue;
    const other = otherOf(pair, m);

    if (other.isSensor) {
      emit('sensorEnter', sensorName(other), other, m);
      continue;
    }

    // contact bookkeeping (rolling sound needs "is touching anything");
    // a marble-on-marble contact counts for both
    const isMarble = other.label === 'marble';
    touch(m);
    if (isMarble) touch(other);

    const rel = Vector.magnitude(Vector.sub(m.velocity, rootOf(other).velocity || { x: 0, y: 0 }));
    if (rel > IMPACT_MIN_SPEED) {
      emit('impact', rel, isMarble, m);
      const bh = other.plugin?.behavior;
      if (bh?.type === 'chime') emit('chime', bh.note, rel, pieceOf(other));
      else if (bh?.type === 'bounce') emit('chime', bh.sound, rel, pieceOf(other));
    }
  }
});

Events.on(engine, 'collisionEnd', (ev) => {
  for (const pair of ev.pairs) {
    const m = marbleOf(pair);
    if (!m) continue;
    const other = otherOf(pair, m);
    if (other.isSensor) {
      emit('sensorExit', sensorName(other), other, m);
      continue;
    }
    untouch(m);
    if (other.label === 'marble') untouch(other);
  }
});

// powered pieces see every contact while it lasts; collisionStart too, as
// a slow marble skipping over a segmented arc re-collides every step and
// never holds a contact long enough to show up as active
for (const evName of ['collisionStart', 'collisionActive']) {
  Events.on(engine, evName, (ev) => {
    const now = engine.timing.timestamp;
    for (const pair of ev.pairs) {
      const m = marbleOf(pair);
      if (m) behaviors.contact(m, otherOf(pair, m), now);
    }
  });
}

// ---- per-step: powered pieces, speed clamp, escape cull ----
let stepDt = 0;
Events.on(engine, 'afterUpdate', () => {
  behaviors.afterStep(marbles, stepDt, engine.timing.timestamp);
  for (let i = marbles.length - 1; i >= 0; i--) {
    const b = marbles[i];
    if (b.speed > SPEED_CLAMP) {
      const s = SPEED_CLAMP / b.speed;
      Body.setVelocity(b, { x: b.velocity.x * s, y: b.velocity.y * s });
    }
    if (b.position.y > BOARD_H + 300 || b.position.x < -300 || b.position.x > BOARD_W + 300) {
      removeMarble(b); // escaped through some crack — clean up
    }
  }
});

export function step(dtMs) {
  stepDt = dtMs;
  Engine.update(engine, dtMs);
}

export function bodyCount() {
  return Composite.allBodies(engine.world).length;
}
