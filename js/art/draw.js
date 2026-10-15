// @ts-check
// Drawing entry points shared by the board renderer, the tray icons and the
// board previews. A piece's art is drawn in its entry's own coordinates
// under pieceMatrix, so one drawing serves every turn and mirror image.

import {
  GRID, BOARD_W, BOARD_H, COLS, ROWS, GRID_X, GRID_Y, MARBLE_R, RS_MAX, FLOOR_Y,
} from '../config.js';
import { Piece, pieceMatrix, transformPoint } from '../pieces/piece.js';
import { board } from '../board.js';
import { ART } from './pieces.js';
import { knockColor } from './shapes.js';
import * as theme from '../theme.js';

/** Drawing state for a piece at rest: no time, the first marble next. */
export const AT_REST = { t: 0, next: 0 };

/** Board drawing order: top row first, left to right. */
export function byCell(a, b) { return a.row - b.row || a.col - b.col; }

function pivotOf(piece) {
  return transformPoint(piece.entry, piece.entry.dynamic.pivot, piece.rot, piece.flip);
}

/** Move g into a piece's own coordinates, its footprint at (ox, oy). */
function enter(g, piece, ox, oy) {
  g.translate(ox, oy);
  g.transform(...pieceMatrix(piece.entry, piece.rot, piece.flip));
}

/** Into a moving piece's own coordinates, turned by `angle` about its
 *  pivot (turned in board space, as the physics turns it). */
function enterTurned(g, piece, ox, oy, angle) {
  const [px, py] = pivotOf(piece);
  g.translate(ox + px, oy + py);
  g.rotate(angle);
  g.translate(-px, -py);
  g.transform(...pieceMatrix(piece.entry, piece.rot, piece.flip));
}

/** The part of a placed piece that goes in the cached board layer.
 *  @param {CanvasRenderingContext2D} g */
export function drawStatic(g, piece) {
  const art = ART[piece.entry.id];
  const paint = art.mode === 'dynamic' ? art.base : art.mode === 'live' ? null : art.draw;
  if (!paint) return;
  g.save();
  enter(g, piece, piece.x, piece.y);
  paint(g, piece, AT_REST);
  g.restore();
}

/** The part of a placed piece drawn every frame. @param {CanvasRenderingContext2D} g */
export function drawLive(g, piece, env) {
  const art = ART[piece.entry.id];
  g.save();
  if (art.mode === 'dynamic') {
    const b = piece.dynamicBody;
    const [px, py] = pivotOf(piece);
    // the body's position is the pivot (a catalog test holds every moving
    // piece to that)
    enterTurned(g, piece, b.position.x - px, b.position.y - py, b.angle);
    art.draw(g, piece, env);
  } else {
    enter(g, piece, piece.x, piece.y);
    if (art.mode === 'overlay') art.overlay(g, piece, env);
    else if (art.mode === 'live') art.draw(g, piece, env);
  }
  g.restore();
}

/**
 * A whole piece at rest, its footprint at (ox, oy) (by default where it
 * sits on the board): tray icons, previews, the drag ghost. Moving pieces
 * show the angle they take when placed.
 * @param {CanvasRenderingContext2D} g
 */
export function drawPiece(g, piece, ox = piece.x, oy = piece.y, env = AT_REST) {
  const art = ART[piece.entry.id];
  g.save();
  enter(g, piece, ox, oy);
  if (art.mode === 'dynamic') {
    if (art.base) art.base(g, piece, env);
  } else {
    art.draw(g, piece, env);
    if (art.overlay) art.overlay(g, piece, env);
  }
  g.restore();
  if (art.mode === 'dynamic') {
    g.save();
    enterTurned(g, piece, ox, oy, piece.entry.dynamic.angle0 || 0);
    art.draw(g, piece, env);
    g.restore();
  }
}

/** A marble as the toy draws one: fill, knockout, glint. @param {CanvasRenderingContext2D} g */
export function drawMarble(g, m) {
  const { x, y } = m.position;
  g.beginPath();
  g.arc(x, y, MARBLE_R, 0, Math.PI * 2);
  g.fillStyle = theme.marble(m.plugin.ci || 0);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = knockColor(g);
  g.stroke();
  g.beginPath();
  g.arc(x - MARBLE_R * 0.35, y - MARBLE_R * 0.35, MARBLE_R * 0.28, 0, Math.PI * 2);
  g.fillStyle = theme.current().shine;
  g.fill();
}

/** The piece being dragged, and once it snaps, a dashed footprint: lime
 *  where it fits, red where it doesn't. @param {CanvasRenderingContext2D} g */
export function drawGhost(g, ghost) {
  const th = theme.current();
  const { piece } = ghost;
  g.globalAlpha = ghost.snapped && !ghost.valid ? 0.45 : 0.8;
  drawPiece(g, piece, ghost.x, ghost.y);
  g.globalAlpha = 1;
  if (!ghost.snapped) return;
  g.save();
  g.setLineDash([6, 5]);
  g.lineWidth = 2;
  g.strokeStyle = ghost.valid ? th.ghostOk : th.ghostBad;
  g.beginPath();
  g.roundRect(ghost.x + 2, ghost.y + 2, piece.fw * GRID - 4, piece.fh * GRID - 4, 10);
  g.stroke();
  g.restore();
}

let gridDots = null;

function dotsPath() {
  const path = new Path2D();
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r <= ROWS; r++) {
      const x = GRID_X + c * GRID, y = GRID_Y + r * GRID;
      path.moveTo(x + 1.75, y);
      path.arc(x, y, 1.75, 0, Math.PI * 2);
    }
  }
  return path;
}

/** The stage, grid dots and the floor, in board coordinates. @param {CanvasRenderingContext2D} g */
export function drawBoardBackground(g, { grid = true } = {}) {
  const th = theme.current();
  g.fillStyle = th.stage;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  if (grid) {
    gridDots ||= dotsPath();
    g.fillStyle = th.dot;
    g.fill(gridDots);
  }
  g.fillStyle = th.floor;
  g.fillRect(0, FLOOR_Y, BOARD_W, BOARD_H - FLOOR_Y);
}

/**
 * Paint a tray icon into canvas c: `size` CSS px square, `scale` canvas
 * pixels per CSS px. Repainting resizes the canvas, which also clears it.
 * @param {HTMLCanvasElement} c
 */
export function paintIcon(c, entry, flip, size, scale) {
  const px = Math.round(size * scale);
  c.width = px;
  c.height = px;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const g = c.getContext('2d');
  const piece = new Piece(entry, 0, 0, 0, flip);
  // a little margin, so outlines and caps that reach past the footprint fit
  const k = (px * 0.92) / (Math.max(piece.fw, piece.fh) * GRID);
  g.setTransform(k, 0, 0, k, (px - piece.fw * GRID * k) / 2, (px - piece.fh * GRID * k) / 2);
  drawPiece(g, piece, 0, 0);
}

/** Canvas pixels per CSS px for pictures outside the scaled game stage. */
export function screenScale() {
  return Math.max(1, Math.min(RS_MAX, window.devicePixelRatio || 1));
}

/** A w × h (CSS px) picture of a saved board. */
export function renderPreview(pieces, w, h, scale = screenScale()) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const g = c.getContext('2d');
  const k = Math.min(c.width / BOARD_W, c.height / BOARD_H);
  g.setTransform(k, 0, 0, k, (c.width - BOARD_W * k) / 2, (c.height - BOARD_H * k) / 2);
  drawBoardBackground(g, { grid: false });
  for (const piece of board.deserialize(pieces).sort(byCell)) drawPiece(g, piece);
  return c;
}
