// @ts-check
// Matter.js engine, marble lifecycle, collision event fan-out. What pieces
// do to marbles (conveyors, cannons, loop gates) lives in behaviors.js.

import {
  BOARD_W, BOARD_H, MARBLE_R, MAX_MARBLES, SPEED_CLAMP, GRID, GRID_X, COLS,
  HIT_MIN_SPEED, BOUNCE_MIN_SPEED, CHIME_MIN_SPEED, FLOOR_Y,
} from './config.js';
import { NOTES } from './music.js';
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

/** marble.id -> its active contacts with pieces, the floor and the walls,
 *  counted apart for music pieces (bars and bells, whose notes are the
 *  sound) and everything else */
const contacts = new Map();

/** marble.id -> {t, kind} of its last touch (sim ms). The rolling sound
 *  treats "touched very recently" as still touching: raw contact flickers
 *  every few steps as the marble micro-bounces, which would make the sound
 *  flutter. */
const lastTouch = new Map();
const CONTACT_STICKY_MS = 120;

/** marble.id -> sim ms it last let go of everything. A marble touching
 *  something, or only just off it, is rolling on, not landing. */
const lastLeft = new Map();
const SETTLED_MS = 50;

/** What a marble is rolling on, for its sound: 'solid', 'music' (only bars
 *  or bells, which make their own) or null (in the air, or only touching
 *  other marbles). */
export function rollingOn(marbleId) {
  const c = contacts.get(marbleId);
  if (c?.solid > 0) return 'solid';
  if (c?.music > 0) return 'music';
  const last = lastTouch.get(marbleId);
  return last && engine.timing.timestamp - last.t < CONTACT_STICKY_MS ? last.kind : null;
}

// ---- event fan-out (audio and visual effects subscribe to these) ----
const handlers = {
  impact: [], sensorEnter: [], sensorExit: [], chime: [], marbleRemoved: [],
  pass: [], flip: [], goal: [], // a gate let a marble through, a flip-flop flipped, a goal scored
};
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
  Bodies.rectangle(BOARD_W / 2, FLOOR_Y + WALL / 2, BOARD_W + WALL * 2, WALL,
    { isStatic: true, label: 'floor', friction: 0.05 }),
  Bodies.rectangle(LEFT - WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
  Bodies.rectangle(RIGHT + WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
]);

let colorIdx = 0;

/** Colour index the next marble will get (the theme maps it to a colour). */
export function nextMarbleIndex() { return colorIdx; }

export function spawnMarble(x, y) {
  if (marbles.length >= MAX_MARBLES) removeMarble(marbles[0], true);
  const b = Bodies.polygon(x, y, MARBLE_SIDES, MARBLE_R, {
    restitution: 0.35,
    friction: 0.02,
    frictionAir: 0.0012,
    frictionStatic: 0.01,
    density: 0.002,
    label: 'marble',
  });
  b.plugin.ci = colorIdx++;
  marbles.push(b);
  World.add(engine.world, b);
  return b;
}

/** @param {boolean} [fade] shrink it away on screen (the art's business) */
export function removeMarble(b, fade = false) {
  const i = marbles.indexOf(b);
  if (i >= 0) marbles.splice(i, 1);
  contacts.delete(b.id);
  lastTouch.delete(b.id);
  lastLeft.delete(b.id);
  World.remove(engine.world, b);
  emit('marbleRemoved', b, fade);
}

/** Remove every marble, which starts a new run (goal cups count from 0);
 *  `fade` when the player cleared them (not when a new board is loading). */
export function resetMarbles({ fade = false } = {}) {
  for (const b of [...marbles]) removeMarble(b, fade);
  behaviors.resetGoals();
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

/** What a marble touched, for the sound: another marble, a music piece
 *  (bars and bells ring, bumpers and bouncers boing: their sound is their
 *  own, so no knock or rumble goes on top) or anything else. */
function kindOf(body) {
  if (body.label === 'marble') return 'marble';
  const t = body.plugin?.behavior?.type;
  return t === 'chime' || t === 'bounce' ? 'music' : 'solid';
}

function touch(m, kind) {
  const c = contacts.get(m.id) || { solid: 0, music: 0 };
  c[kind]++;
  contacts.set(m.id, c);
  lastTouch.set(m.id, { t: engine.timing.timestamp, kind });
}
function untouch(m, kind) {
  const c = contacts.get(m.id);
  if (!c) return;
  c[kind] = Math.max(0, c[kind] - 1);
  if (c.solid + c.music === 0) {
    contacts.delete(m.id);
    lastLeft.set(m.id, engine.timing.timestamp);
  }
}

Events.on(engine, 'collisionStart', (ev) => {
  const now = engine.timing.timestamp;
  const settled = new Map(); // marble -> already rolling on something
  const hardest = new Map(); // marble -> its hardest knock: one per step
  for (const pair of ev.pairs) {
    const m = marbleOf(pair);
    if (!m) continue;
    const other = otherOf(pair, m);

    if (other.isSensor) {
      emit('sensorEnter', sensorName(other), other, m);
      continue;
    }

    // contact bookkeeping: the rolling sound needs what each marble rolls on
    if (!settled.has(m)) settled.set(m, contacts.has(m.id) || now - (lastLeft.get(m.id) ?? -Infinity) < SETTLED_MS);
    const kind = kindOf(other);
    if (kind !== 'marble') touch(m, kind);

    const dv = Vector.sub(m.velocity, rootOf(other).velocity || { x: 0, y: 0 });
    const rel = Vector.magnitude(dv);
    const bh = other.plugin?.behavior;
    if (bh?.type === 'chime' && rel > CHIME_MIN_SPEED) {
      // music sounds for slow marbles too, and for marbles rolling from bar
      // to bar (so by the whole speed); the note is the placed piece's
      const piece = pieceOf(other);
      emit('chime', piece?.note != null ? String(NOTES[piece.note].hz) : bh.note, rel, piece);
    } else if (bh?.type === 'bounce' && rel > BOUNCE_MIN_SPEED) {
      emit('chime', bh.sound, rel, pieceOf(other));
    } else if (kind !== 'music') {
      // a knock is as loud as the marble struck: its speed into the surface,
      // not along it (Matter hasn't resolved the contact yet, so this is the
      // speed it arrived with). A marble rolling on knocks only where the
      // surface turns sharply under it, not at every seam or facet of a curve.
      const n = pair.collision.normal;
      const into = Math.abs(dv.x * n.x + dv.y * n.y);
      const along = Math.abs(dv.x * n.y - dv.y * n.x);
      const min = settled.get(m) ? Math.max(1.4 * HIT_MIN_SPEED, 0.5 * along) : HIT_MIN_SPEED;
      if (into > min && into > (hardest.get(m)?.into ?? 0)) hardest.set(m, { into, other });
    }
  }
  for (const [m, knock] of hardest) emit('impact', knock.into, knock.other, m);
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
    const kind = kindOf(other);
    if (kind !== 'marble') untouch(m, kind);
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
