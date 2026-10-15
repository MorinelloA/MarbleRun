// @ts-check
// The board renderer. A cached static layer holds the background and every
// piece that never changes on its own; it is repainted only after it has
// been marked dirty (a board edit, a resize). Each frame copies it to the
// visible canvas and draws on top, in order: overlays, live pieces, moving
// pieces, pieces easing into place, marbles (and ones shrinking away), the
// drag ghost and the debug HUD. Pieces are always drawn in (row, col)
// order. A piece easing in stays out of the cached layer until it settles.

import { BOARD_W, BOARD_H } from './config.js';
import { board } from './board.js';
import { marbles, nextMarbleIndex } from './world.js';
import { view } from './viewport.js';
import * as fx from './fx.js';
import { ART, MODES } from './art/pieces.js';
import * as draw from './art/draw.js';

/** @type {HTMLCanvasElement} */ let canvas;
/** @type {CanvasRenderingContext2D} */ let ctx;
/** @type {HTMLCanvasElement} */ let staticLayer;
/** @type {CanvasRenderingContext2D} */ let sctx;
let staticDirty = true;

/** @type {Record<string, any[]>} placed pieces by art mode, in drawing order */
const lists = Object.fromEntries(MODES.map(m => [m, []]));

export const stats = {
  staticRebuilds: 0,
  /** ms per section in the last frame (static includes a repaint) */
  ms: { static: 0, overlay: 0, live: 0, dynamic: 0, marbles: 0, ghost: 0 },
};

export function init() {
  canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playfield'));
  ctx = canvas.getContext('2d', { alpha: false });
  staticLayer = document.createElement('canvas');
  sctx = staticLayer.getContext('2d', { alpha: false });
  resize();
}

/** Size both backing stores to the current render scale. */
export function resize() {
  const w = Math.round(BOARD_W * view.rs);
  const h = Math.round(BOARD_H * view.rs);
  for (const c of [canvas, staticLayer]) {
    c.width = w;
    c.height = h;
  }
  invalidateStatic();
}

/** Repaint the static layer (and re-sort the pieces) before the next frame. */
export function invalidateStatic() {
  staticDirty = true;
}

function paintStatic() {
  for (const m of MODES) lists[m].length = 0;
  const sorted = [...board.pieces].filter(p => !fx.entering.has(p)).sort(draw.byCell);
  for (const piece of sorted) lists[ART[piece.entry.id].mode].push(piece);

  sctx.setTransform(staticLayer.width / BOARD_W, 0, 0, staticLayer.height / BOARD_H, 0, 0);
  draw.drawBoardBackground(sctx);
  for (const piece of sorted) draw.drawStatic(sctx, piece);
  staticDirty = false;
  stats.staticRebuilds++;
}

const env = { t: 0, next: 0, reduced: false };

/**
 * @param {null | {piece: any, x: number, y: number, snapped: boolean, valid: boolean}} ghost
 * @param {null | {lines: string[]}} hud
 * @param {number} t sim time in ms, for animation
 */
export function frame(ghost, hud, t = 0) {
  const ms = stats.ms;
  let t0 = performance.now();
  const lap = (key) => {
    const t1 = performance.now();
    ms[key] = t1 - t0;
    t0 = t1;
  };

  const clock = performance.now(); // pieces easing in and marbles fading out
  if (fx.settle(clock, board.pieces)) invalidateStatic();
  if (staticDirty) paintStatic();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(staticLayer, 0, 0);
  lap('static');

  ctx.setTransform(canvas.width / BOARD_W, 0, 0, canvas.height / BOARD_H, 0, 0);
  env.t = t;
  env.next = nextMarbleIndex();
  env.reduced = fx.reduced();
  for (const piece of lists.overlay) draw.drawLive(ctx, piece, env);
  lap('overlay');
  for (const piece of lists.live) draw.drawLive(ctx, piece, env);
  lap('live');
  for (const piece of lists.dynamic) draw.drawLive(ctx, piece, env);
  for (const [piece, e] of fx.entering) {
    draw.drawEntering(ctx, piece, e.kind, Math.min(1, Math.max(0, (clock - e.t) / fx.ENTER_MS)), env);
  }
  lap('dynamic');
  for (const m of marbles) draw.drawMarble(ctx, m);
  fx.dropFaded(clock);
  for (const m of fx.fading) {
    const p = Math.min(1, Math.max(0, (clock - m.t) / fx.FADE_MS));
    draw.drawMarble(ctx, m, 1 - p * p);
  }
  lap('marbles');
  if (ghost) draw.drawGhost(ctx, ghost);
  lap('ghost');

  if (hud) drawHud(hud.lines);
}

function drawHud(lines) {
  ctx.font = '13px monospace';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(6, 6, w + 16, 12 + lines.length * 18);
  ctx.fillStyle = '#9f9';
  lines.forEach((line, i) => ctx.fillText(line, 14, 24 + i * 18));
}
