// @ts-check
// What pieces do to marbles beyond plain collisions. Parts declare a
// behavior in the catalog, already turned and mirrored with the piece by
// transformParts:
//   push   {dir}    escalators, lift fields: shove touching marbles along dir
//          {dir, speed}  a belt: drag marbles on it toward speed along dir
//   launch {vel}    cannons: set the velocity of a marble inside
//   boost           loop arcs: speed riders along their direction of travel
//   gate            the loop's scoop: solid until a marble passes the apex
//   oneway {dir}    a gate's flap: marbles heading along dir pass through it
//   flap, flipzone  a flip-flop's flap, which tips the other way once the
//                   marbles in its zone have all left
//   goal            a goal cup: counts each marble that reaches it
//   chime, bounce, sensor: sound and sensor events only (see world.js)
//
// world.js forwards every marble contact here during Matter's collision
// events and calls afterStep() once per physics step. Velocity changes are
// collected during the events and applied after the step, because Matter
// discards forces set inside collision callbacks.

import { PHYS_DT, MARBLE_R } from './config.js';

const { Body } = window.Matter;

// Strengths per reference step (PHYS_DT), scaled by dt / PHYS_DT so they
// stay the same per second if the step ever changes.
const NUDGE = 0.35;          // boost and push, in Matter velocity units
const BOOST_MIN_SPEED = 0.6; // boost leaves settled marbles settled
const NUDGE_MAX_SPEED = 12;  // no boost or push above this (no runaway)
const LAUNCH_COOLDOWN_MS = 250;
// loop gates sit in their own collision category so a single marble can be
// let through by masking it out (Matter 0.20 ignores pair.isActive changes
// made inside collision events)
const GATE_CATEGORY = 0x0002;
// one-way flaps let marbles through the same way, in a category of their own
const ONEWAY_CATEGORY = 0x0004;
// how far ahead of a one-way flap a marble heading through is let in: more
// than a marble can move in one step at the speed clamp
const ONEWAY_REACH = 12;

const boosted = new Set();
const pushed = new Map();    // marble -> summed push direction this step
const belts = new Map();     // marble -> the belt (push with a speed) it is on this step
const launched = new Map();  // marble -> { v, piece }
const lastLaunch = new WeakMap(); // marble -> sim time of its last launch
const lapped = new WeakMap();     // marble -> loop piece whose apex it passed
const tiltLimited = new Map();    // moving plank body -> max |angle|
const oneways = new Map();        // one-way flap body -> its half sizes
const passing = new Map();        // marble -> the one-way flap it is going through
const flipflops = new Set();      // flip-flop pieces
const flipBusy = new Set();       // ...with a marble in their zone this step
const flipWasBusy = new WeakSet(); // ...and the step before
let goals = new WeakMap();        // goal piece -> { count, seen: marble ids }

let emit = (..._args) => {};

/** world.js hands over its event emitter (launches play a sound). */
export function init(emitter) {
  emit = emitter;
}

/** Half a body's extent along the unit vector d. */
function halfExtent(body, d) {
  let lo = Infinity, hi = -Infinity;
  for (const v of body.vertices) {
    const s = v.x * d.x + v.y * d.y;
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return (hi - lo) / 2;
}

export function onPieceAdded(piece) {
  const maxTilt = piece.entry.dynamic?.maxTilt;
  if (maxTilt && piece.dynamicBody) tiltLimited.set(piece.dynamicBody, maxTilt);
  for (const b of piece.bodies) {
    const type = b.plugin.behavior?.type;
    if (type === 'gate') b.collisionFilter.category = GATE_CATEGORY;
    else if (type === 'oneway') {
      const d = b.plugin.behavior.dir;
      b.collisionFilter.category = ONEWAY_CATEGORY;
      oneways.set(b, { thick: halfExtent(b, d), long: halfExtent(b, { x: -d.y, y: d.x }) });
    } else if (type === 'flap') {
      flipflops.add(piece);
    }
  }
}

export function onPieceRemoved(piece) {
  if (piece.dynamicBody) tiltLimited.delete(piece.dynamicBody);
  flipflops.delete(piece);
  for (const b of piece.bodies) {
    if (!oneways.delete(b)) continue;
    // marbles halfway through it are solid to other flaps again
    for (const [m, flap] of passing) {
      if (flap === b) {
        m.collisionFilter.mask |= ONEWAY_CATEGORY;
        passing.delete(m);
      }
    }
  }
}

/** How many marbles have reached a goal cup since the run (re)started. */
export function goalCount(piece) {
  return goals.get(piece)?.count ?? 0;
}

/** Start every goal cup's count again. */
export function resetGoals() {
  goals = new WeakMap();
}

/** A marble touches (or, for a sensor, overlaps) a piece part this step. */
export function contact(m, part, now) {
  const behavior = part.plugin.behavior;
  if (!behavior) return;
  switch (behavior.type) {
    case 'push': {
      if (behavior.speed) {
        belts.set(m, behavior);
        return;
      }
      const acc = pushed.get(m) || { x: 0, y: 0 };
      acc.x += behavior.dir.x;
      acc.y += behavior.dir.y;
      pushed.set(m, acc);
      return;
    }
    case 'launch':
      // fires on entry and keeps firing while a marble stays inside
      if (now - (lastLaunch.get(m) ?? -Infinity) >= LAUNCH_COOLDOWN_MS) {
        launched.set(m, { v: behavior.vel, piece: part.plugin.piece });
      }
      return;
    case 'boost':
    case 'gate': {
      const piece = part.plugin.piece;
      const loop = piece?.entry.loop;
      if (loop) {
        const dx = m.position.x - (piece.x + loop.center[0]);
        const dy = m.position.y - (piece.y + loop.center[1]);
        // just past the apex, on the inside: this marble has lapped, so
        // its gate opens
        if (dy < -20 && dx < -10 && Math.hypot(dx, dy) < loop.apexRadius) {
          lapped.set(m, piece);
          m.collisionFilter.mask &= ~GATE_CATEGORY;
        }
      }
      boosted.add(m);
      return;
    }
    case 'flipzone':
      flipBusy.add(part.plugin.piece);
      return;
    case 'goal': {
      const piece = part.plugin.piece;
      let g = goals.get(piece);
      if (!g) goals.set(piece, g = { count: 0, seen: new Set() });
      if (!g.seen.has(m.id)) {
        g.seen.add(m.id);
        g.count++;
        emit('goal', piece, g.count);
      }
    }
  }
}

/** Let marbles heading through a one-way flap the allowed way pass it, and
 *  make it solid to them again once they're clear. */
function oneWayFlaps(marbles) {
  for (const m of [...passing.keys()]) if (!marbles.includes(m)) passing.delete(m);
  for (const [flap, size] of oneways) {
    const d = flap.plugin.behavior.dir;
    const c = flap.position;
    const reach = MARBLE_R + size.thick;
    for (const m of marbles) {
      const rx = m.position.x - c.x, ry = m.position.y - c.y;
      const s = rx * d.x + ry * d.y;    // along the way through
      const t = -rx * d.y + ry * d.x;   // along the flap
      const across = Math.abs(t) < size.long + MARBLE_R;
      if (passing.get(m) === flap) {
        // through it, backed away, or gone round it: solid to this marble again
        if (!across || s > reach + 2 || s < -(reach + ONEWAY_REACH + 2)) {
          m.collisionFilter.mask |= ONEWAY_CATEGORY;
          passing.delete(m);
        }
      } else if (!passing.has(m) && across && s < 0 && s > -(reach + ONEWAY_REACH) &&
                 m.velocity.x * d.x + m.velocity.y * d.y > 0.05) {
        m.collisionFilter.mask &= ~ONEWAY_CATEGORY;
        passing.set(m, flap);
        emit('pass', flap.plugin.piece);
      }
    }
  }
}

/** A flip-flop tips the other way once the last marble has left it. */
function flipFlops() {
  for (const piece of flipflops) {
    const busy = flipBusy.has(piece);
    if (!busy && flipWasBusy.has(piece)) {
      const flap = piece.bodies.find(b => b.plugin.behavior?.type === 'flap');
      Body.setAngle(flap, -flap.angle);
      emit('flip', piece);
    }
    if (busy) flipWasBusy.add(piece);
    else flipWasBusy.delete(piece);
  }
  flipBusy.clear();
}

/** Apply this step's nudges; called after every physics step. */
export function afterStep(marbles, dt, now) {
  const nudge = NUDGE * (dt / PHYS_DT);
  for (const b of boosted) {
    const s = b.speed;
    if (s >= BOOST_MIN_SPEED && s <= NUDGE_MAX_SPEED) {
      Body.setVelocity(b, {
        x: b.velocity.x * (1 + nudge / s),
        y: b.velocity.y * (1 + nudge / s),
      });
    }
  }
  boosted.clear();
  // no low-speed gate: a marble must never come to rest on a mover
  for (const [b, dir] of pushed) {
    if (b.speed <= NUDGE_MAX_SPEED) {
      Body.setVelocity(b, {
        x: b.velocity.x + nudge * dir.x,
        y: b.velocity.y + nudge * dir.y,
      });
    }
  }
  pushed.clear();
  for (const [b, l] of launched) {
    Body.setVelocity(b, { x: l.v.x, y: l.v.y });
    lastLaunch.set(b, now);
    emit('chime', 'tramp', 9, l.piece);
  }
  launched.clear();
  // a limited plank that reaches its stop stays there, with a small rebound
  for (const [body, maxTilt] of tiltLimited) {
    if (Math.abs(body.angle) > maxTilt) {
      Body.setAngle(body, Math.sign(body.angle) * maxTilt);
      Body.setAngularVelocity(body, -body.angularVelocity * 0.2);
    }
  }
  // once clear of a lapped loop, gates are solid again for that marble
  for (const b of marbles) {
    const lp = lapped.get(b);
    if (lp && Math.abs(b.position.x - (lp.x + lp.entry.loop.center[0])) > lp.entry.loop.exitWindow) {
      lapped.delete(b);
      b.collisionFilter.mask |= GATE_CATEGORY;
    }
  }
  if (oneways.size) oneWayFlaps(marbles);
  if (flipflops.size) flipFlops();
  else flipBusy.clear();
  // a belt drags what's on it toward its own speed, faster or slower
  for (const [b, belt] of belts) {
    const d = belt.dir;
    const along = b.velocity.x * d.x + b.velocity.y * d.y;
    const change = Math.max(-nudge, Math.min(nudge, belt.speed - along));
    Body.setVelocity(b, { x: b.velocity.x + change * d.x, y: b.velocity.y + change * d.y });
  }
  belts.clear();
}
