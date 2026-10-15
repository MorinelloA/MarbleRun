// @ts-check
// Matter.js engine, marble lifecycle, collision event fan-out.

import {
  BOARD_W, BOARD_H, MARBLE_R, MAX_MARBLES, SPEED_CLAMP, MARBLE_COLORS,
} from './config.js';

const { Engine, World, Bodies, Body, Events, Sleeping, Composite, Vector } = window.Matter;

export const engine = Engine.create({
  enableSleeping: true,
  positionIterations: 6,
  velocityIterations: 4,
});
engine.gravity.y = 1;

/** @type {any[]} live marble bodies, oldest first */
export const marbles = [];

/** marble.id -> number of active non-sensor contacts */
export const contactCounts = new Map();

/** marble.id -> performance.now() of the last touch. Rolling audio treats
 *  "touched very recently" as rolling — raw contact flickers every few
 *  steps as the marble micro-bounces, which would make the sound flutter. */
export const lastContact = new Map();
const CONTACT_STICKY_MS = 120;

export function isRolling(marbleId) {
  if ((contactCounts.get(marbleId) || 0) > 0) return true;
  return performance.now() - (lastContact.get(marbleId) || -1e9) < CONTACT_STICKY_MS;
}

// ---- event fan-out (audio subscribes to these) ----
const handlers = { impact: [], sensorEnter: [], sensorExit: [], chime: [] };
export function on(type, fn) { handlers[type].push(fn); }
function emit(type, ...args) { for (const fn of handlers[type]) fn(...args); }

// ---- world bounds: closed floor + side walls just outside the frame ----
const WALL = 80;
World.add(engine.world, [
  Bodies.rectangle(BOARD_W / 2, BOARD_H + WALL / 2 - 6, BOARD_W + WALL * 2, WALL,
    { isStatic: true, label: 'floor', friction: 0.05 }),
  Bodies.rectangle(-WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
  Bodies.rectangle(BOARD_W + WALL / 2, BOARD_H / 2 - 400, WALL, BOARD_H + 1600,
    { isStatic: true, label: 'wall' }),
]);

let colorIdx = 0;

export function spawnMarble(x, y) {
  if (marbles.length >= MAX_MARBLES) removeMarble(marbles[0]);
  const b = Bodies.circle(x, y, MARBLE_R, {
    restitution: 0.35,
    friction: 0.02,
    frictionAir: 0.0012,
    frictionStatic: 0.01,
    density: 0.002,
    label: 'marble',
    // never sleep: a marble that slows below the sleep threshold while on
    // a slope would freeze there mid-track instead of rolling on
    sleepThreshold: Infinity,
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
}

export function resetMarbles() {
  for (const b of [...marbles]) removeMarble(b);
}

export function wakeAllMarbles() {
  for (const b of marbles) Sleeping.set(b, false);
}

/** Parse "prefix:x,y" labels into a vector, or null. */
function parseDirLabel(label, prefix) {
  if (!label || !label.startsWith(prefix)) return null;
  const [x, y] = label.slice(prefix.length).split(',').map(Number);
  return { x, y };
}

/** Rotate/flip a piece-local direction into board space
 *  (same mapping as transformParts in piece.js). */
function orientDir(d, piece) {
  let x = piece.flip ? -d.x : d.x;
  let y = d.y;
  for (let i = 0; i < piece.rot; i++) [x, y] = [-y, x];
  return { x, y };
}

export function addPieceBodies(piece) {
  for (const b of piece.bodies) {
    // loop exit gates live in their own collision category so individual
    // marbles can be made to pass through them (see the lap logic below)
    if (b.label === 'loopgate') b.collisionFilter.category = GATE_CATEGORY;
    // movers and launchers declare a piece-local direction in their label;
    // cache the board-space vector on the body
    const push = parseDirLabel(b.label, 'push:');
    if (push) b.plugin.push = orientDir(push, piece);
    const launch = parseDirLabel(b.label, 'launch:');
    if (launch) b.plugin.launch = orientDir(launch, piece);
  }
  World.add(engine.world, piece.bodies);
  if (piece.constraint) World.add(engine.world, piece.constraint);
  wakeAllMarbles();
}

export function removePieceBodies(piece) {
  for (const b of piece.bodies) World.remove(engine.world, b);
  if (piece.constraint) World.remove(engine.world, piece.constraint);
  wakeAllMarbles();
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

Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const m = marbleOf(pair);
    if (!m) continue;
    const other = otherOf(pair, m);

    if (other.isSensor) {
      emit('sensorEnter', other.label, other, m);
      continue;
    }

    // contact bookkeeping (rolling sound needs "is touching anything")
    contactCounts.set(m.id, (contactCounts.get(m.id) || 0) + 1);
    lastContact.set(m.id, performance.now());

    const rel = Vector.magnitude(Vector.sub(m.velocity, rootOf(other).velocity || { x: 0, y: 0 }));
    const isMarble = other.label === 'marble';
    if (rel > 2.2) {
      emit('impact', rel, isMarble, m);
      const label = other.label || '';
      if (label.startsWith('chime:')) {
        emit('chime', label.slice(6), rel, other.plugin?.piece || rootOf(other).plugin?.piece);
      } else if (label === 'bumper') {
        emit('chime', 'bumper', rel, other.plugin?.piece);
      } else if (label === 'tramp') {
        emit('chime', 'tramp', rel, other.plugin?.piece);
      }
    }
  }
});

Events.on(engine, 'collisionEnd', (ev) => {
  for (const pair of ev.pairs) {
    const m = marbleOf(pair);
    if (!m) continue;
    const other = otherOf(pair, m);
    if (other.isSensor) {
      emit('sensorExit', other.label, other, m);
      continue;
    }
    const n = (contactCounts.get(m.id) || 1) - 1;
    if (n <= 0) contactCounts.delete(m.id); else contactCounts.set(m.id, n);
  }
});

// ---- powered pieces ----
// Parts labeled 'boost' push a touching marble along its direction of
// travel (a motorized loop — energy injection like the bumper's kick).
// The low-speed gate keeps settled marbles settled; the high gate and
// the global SPEED_CLAMP prevent runaway. Collected during collision
// events but applied in afterUpdate: Matter wipes forces set inside
// collision callbacks, so we adjust velocity directly instead.
const BOOST_DV = 0.35;
const boosted = new Set();
// Directional movers: parts (or sensor fields) labeled 'push:dx,dy' shove a
// touching/overlapping marble along a fixed board-space direction each step
// — conveyor floors, escalators, lift shafts. No low-speed gate: marbles
// must never come to rest on a mover, they get carried along.
const pushed = new Map(); // marble body -> accumulated {x, y}
// Launchers: sensors labeled 'launch:vx,vy' (cannons) set an absolute
// velocity the moment a marble enters them.
const launched = new Map(); // marble body -> { v: {x,y}, piece }
// A marble that has passed a loop's apex gets that loop's exit gate opened:
// the 'loopgate' scoop (bottom-right of the arc) stops colliding with it, so
// it rolls straight through at ground level and exits the piece rightward.
// Implemented with collision filters — Matter 0.20 ignores pair.isActive
// changes made inside collision event callbacks.
const GATE_CATEGORY = 0x0002;
const lapped = new WeakMap(); // marble body -> loop piece whose apex it passed
// collisionStart too: a slow marble skipping over the segmented arc
// re-collides every frame and never holds a contact long enough for
// collisionActive to fire
for (const evName of ['collisionStart', 'collisionActive']) {
  Events.on(engine, evName, (ev) => {
    for (const pair of ev.pairs) {
      const m = marbleOf(pair);
      if (!m) continue;
      const other = otherOf(pair, m);
      const plug = other.plugin;
      if (plug?.push) {
        const acc = pushed.get(m) || { x: 0, y: 0 };
        acc.x += plug.push.x;
        acc.y += plug.push.y;
        pushed.set(m, acc);
        continue;
      }
      if (plug?.launch) {
        if (evName === 'collisionStart') launched.set(m, { v: plug.launch, piece: plug.piece });
        continue;
      }
      const label = other.label;
      if (label !== 'boost' && label !== 'loopgate') continue;
      const piece = other.plugin?.piece;
      if (piece && piece.entry.id === 'loop') {
        // loop center in board coords (loop is never rotated/flipped)
        const dx = m.position.x - (piece.x + 64);
        const dy = m.position.y - (piece.y + 68);
        // just past the apex, on the inside: this marble has lapped —
        // open the exit by masking gate bodies out of its collisions
        if (dy < -20 && dx < -10 && Math.hypot(dx, dy) < 55) {
          lapped.set(m, piece);
          m.collisionFilter.mask &= ~GATE_CATEGORY;
        }
      }
      boosted.add(m);
    }
  });
}

// ---- per-step guards: boost + speed clamp + escape cull ----
Events.on(engine, 'afterUpdate', () => {
  for (const b of boosted) {
    const s = b.speed;
    if (s >= 0.6 && s <= 12) {
      Body.setVelocity(b, {
        x: b.velocity.x * (1 + BOOST_DV / s),
        y: b.velocity.y * (1 + BOOST_DV / s),
      });
    }
  }
  boosted.clear();
  for (const [b, dir] of pushed) {
    if (b.speed <= 12) {
      Body.setVelocity(b, {
        x: b.velocity.x + BOOST_DV * dir.x,
        y: b.velocity.y + BOOST_DV * dir.y,
      });
    }
  }
  pushed.clear();
  for (const [b, l] of launched) {
    Body.setVelocity(b, { x: l.v.x, y: l.v.y });
    emit('chime', 'tramp', 9, l.piece);
  }
  launched.clear();
  for (let i = marbles.length - 1; i >= 0; i--) {
    const b = marbles[i];
    // once clear of a lapped loop, gates turn solid again for this marble
    const lp = lapped.get(b);
    if (lp && Math.abs(b.position.x - (lp.x + 64)) > 72) {
      lapped.delete(b);
      b.collisionFilter.mask |= GATE_CATEGORY;
    }
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
  Engine.update(engine, dtMs);
}

export function bodyCount() {
  return Composite.allBodies(engine.world).length;
}
