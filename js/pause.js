// @ts-check
// Why the board's physics is on hold. Each reason (the portrait overlay, an
// open menu, a hidden tab, the player's pause button) is tracked separately
// so they can overlap; sound is ducked while any of them holds.

import { setDuck } from './audio/engine.js';

const reasons = new Set();
const listeners = [];

/** @param {string} reason @param {boolean} on */
export function setPaused(reason, on) {
  if (on === reasons.has(reason)) return;
  if (on) reasons.add(reason);
  else reasons.delete(reason);
  setDuck(reason, on);
  for (const fn of listeners) fn();
}

export function isPaused() { return reasons.size > 0; }
export function pausedBy(reason) { return reasons.has(reason); }
export function onPauseChange(fn) { listeners.push(fn); }
