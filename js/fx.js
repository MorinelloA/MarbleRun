// @ts-check
// Visual reaction state:
//   strikes   when each piece was last struck and how hard, in sim time (so
//             a reaction holds still while the game is paused); the art
//             reads it each frame. A strike within 80 ms of the last one
//             only raises the strength, so a marble rattling on a bar
//             doesn't restart the animation every step.
//   entering  pieces easing into place after being placed, turned or
//             mirrored (drawn every frame until they settle), and
//   fading    removed marbles shrinking away: both answer the player, so
//             they run on the clock (performance.now()), paused or not
// With prefers-reduced-motion nothing moves: reactions are a flash only,
// and pieces and marbles appear and vanish at once.

export const RETRIGGER_MS = 80;
export const ENTER_MS = 120;
export const FADE_MS = 150;

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reducedOverride = null;

export function reduced() {
  return reducedOverride ?? !!motionQuery?.matches;
}

/** Force reduced motion on or off (null follows the system); for checks. */
export function setReduced(v) { reducedOverride = v; }

// ---- strikes ----

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

// ---- pieces easing in ----

/** @type {Map<object, {kind: string, t: number}>} kind: place | turn | flip */
export const entering = new Map();

export function enter(piece, kind) {
  if (!reduced()) entering.set(piece, { kind, t: performance.now() });
}

/** Drop pieces that have settled (or left the board) by clock time t. True
 *  if any settled on the board, so the cached layer must take them back. */
export function settle(t, onBoard) {
  let settled = false;
  for (const [piece, e] of entering) {
    if (!onBoard.has(piece)) entering.delete(piece);
    else if (t - e.t >= ENTER_MS) {
      entering.delete(piece);
      settled = true;
    }
  }
  return settled;
}

// ---- marbles shrinking away ----

/** @type {{position: {x: number, y: number}, plugin: {ci: number}, t: number}[]} */
export const fading = [];

export function fadeMarble(m) {
  if (reduced()) return;
  fading.push({ position: { x: m.position.x, y: m.position.y }, plugin: { ci: m.plugin.ci }, t: performance.now() });
}

/** Forget marbles that have finished shrinking by clock time t. */
export function dropFaded(t) {
  for (let i = fading.length - 1; i >= 0; i--) {
    if (t - fading[i].t >= FADE_MS) fading.splice(i, 1);
  }
}
