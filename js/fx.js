// @ts-check
// Reaction state for the art: when each piece was last struck and how
// hard, in sim time. main.js feeds it from world events and the art reads
// it each frame. A strike within 80 ms of the last one only raises the
// strength, so a marble rattling on a bar doesn't restart the animation
// every step.

const RETRIGGER_MS = 80;
const hits = new WeakMap(); // piece -> { t, s }

/** @param {object} piece @param {number} s strength @param {number} t sim ms */
export function strike(piece, s, t) {
  const h = hits.get(piece);
  if (h && t - h.t < RETRIGGER_MS) {
    h.s = Math.max(h.s, s);
    return;
  }
  hits.set(piece, { t, s });
}

/** The last strike on a piece, or null. */
export function lastHit(piece) { return hits.get(piece) || null; }
