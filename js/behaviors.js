// @ts-check
// What pieces do to marbles beyond plain collisions. Parts declare a
// behavior in the catalog, already turned and mirrored with the piece by
// transformParts:
//   push   {dir}    conveyors, lift fields: shove touching marbles along dir
//   launch {vel}    cannons: set the velocity of a marble inside
//   boost           loop arcs: speed riders along their direction of travel
//   gate            the loop's scoop: solid until a marble passes the apex
//   chime, bounce, sensor: sound and sensor events only (see world.js)
//
// world.js forwards every marble contact here during Matter's collision
// events and calls afterStep() once per physics step. Velocity changes are
// collected during the events and applied after the step, because Matter
// discards forces set inside collision callbacks.

import { PHYS_DT } from './config.js';

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

const boosted = new Set();
const pushed = new Map();    // marble -> summed push direction this step
const launched = new Map();  // marble -> { v, piece }
const lastLaunch = new WeakMap(); // marble -> sim time of its last launch
const lapped = new WeakMap();     // marble -> loop piece whose apex it passed
const tiltLimited = new Map();    // moving plank body -> max |angle|

let emit = (..._args) => {};

/** world.js hands over its event emitter (launches play a sound). */
export function init(emitter) {
  emit = emitter;
}

export function onPieceAdded(piece) {
  const maxTilt = piece.entry.dynamic?.maxTilt;
  if (maxTilt && piece.dynamicBody) tiltLimited.set(piece.dynamicBody, maxTilt);
  for (const b of piece.bodies) {
    if (b.plugin.behavior?.type === 'gate') b.collisionFilter.category = GATE_CATEGORY;
  }
}

export function onPieceRemoved(piece) {
  if (piece.dynamicBody) tiltLimited.delete(piece.dynamicBody);
}

/** A marble touches (or, for a sensor, overlaps) a piece part this step. */
export function contact(m, part, now) {
  const behavior = part.plugin.behavior;
  if (!behavior) return;
  switch (behavior.type) {
    case 'push': {
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
    }
  }
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
}
