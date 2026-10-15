// @ts-check
// Drawing entry points shared by the board renderer, the tray icons and the
// board previews. A piece's art is drawn in its entry's own coordinates
// under pieceMatrix, so one drawing serves every turn and mirror image.

import { GRID, BOARD_W, BOARD_H, COLS, ROWS, GRID_X, GRID_Y, MARBLE_R, RS_MAX } from '../config.js';
import { Piece, pieceMatrix, transformPoint } from '../pieces/piece.js';
import { board } from '../board.js';
import { ART } from './pieces.js';
import * as theme from '../theme.js';

/** Board drawing order: top row first, left to right. */
export function byCell(a, b) { return a.row - b.row || a.col - b.col; }

function pivotOf(piece) {
  return transformPoint(piece.entry, piece.entry.dynamic.pivot, piece.rot, piece.flip);
}

/**
 * A piece at rest with its footprint at (ox, oy), by default where it sits
 * on the board. Moving pieces show their resting angle, as when placed.
 * @param {CanvasRenderingContext2D} g
 */
export function drawPiece(g, piece, ox = piece.x, oy = piece.y, t = 0) {
  g.save();
  g.translate(ox, oy);
  const angle0 = piece.entry.dynamic?.angle0;
  if (angle0) {
    const [px, py] = pivotOf(piece);
    g.translate(px, py);
    g.rotate(angle0);
    g.translate(-px, -py);
  }
  g.transform(...pieceMatrix(piece.entry, piece.rot, piece.flip));
  ART[piece.entry.id].draw(g, piece, t);
  g.restore();
}

/** The per-frame layer of an overlay piece. @param {CanvasRenderingContext2D} g */
export function drawOverlay(g, piece, t) {
  g.save();
  g.translate(piece.x, piece.y);
  g.transform(...pieceMatrix(piece.entry, piece.rot, piece.flip));
  ART[piece.entry.id].overlay(g, piece, t);
  g.restore();
}

/** A moving piece, following its physics body. The body's position is the
 *  pivot (a catalog test holds every moving piece to that).
 *  @param {CanvasRenderingContext2D} g */
export function drawDynamic(g, piece, t) {
  const b = piece.dynamicBody;
  const [px, py] = pivotOf(piece);
  g.save();
  g.translate(b.position.x, b.position.y);
  g.rotate(b.angle);
  g.translate(-px, -py);
  g.transform(...pieceMatrix(piece.entry, piece.rot, piece.flip));
  ART[piece.entry.id].draw(g, piece, t);
  g.restore();
}

/** @param {CanvasRenderingContext2D} g */
export function drawMarble(g, m) {
  const { x, y } = m.position;
  g.beginPath();
  g.arc(x, y, MARBLE_R, 0, Math.PI * 2);
  g.fillStyle = m.plugin.color;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  g.arc(x - 4, y - 4, 3.5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fill();
}

/** @param {CanvasRenderingContext2D} g */
export function drawGhost(g, ghost) {
  g.globalAlpha = 0.65;
  drawPiece(g, ghost.piece, ghost.x, ghost.y);
  if (ghost.snapped) {
    const th = theme.current();
    g.globalAlpha = 0.3;
    g.fillStyle = ghost.valid ? th.ghostOk : th.ghostBad;
    g.fillRect(ghost.x, ghost.y, ghost.piece.fw * GRID, ghost.piece.fh * GRID);
  }
  g.globalAlpha = 1;
}

let gridDots = null;

/** Sky and grid dots, in board coordinates. @param {CanvasRenderingContext2D} g */
export function drawBoardBackground(g, { grid = true } = {}) {
  const th = theme.current();
  const sky = g.createLinearGradient(0, 0, 0, BOARD_H);
  sky.addColorStop(0, th.skyTop);
  sky.addColorStop(1, th.skyBottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  if (!grid) return;
  if (!gridDots) {
    gridDots = new Path2D();
    for (let c = 0; c <= COLS; c++) {
      for (let r = 0; r <= ROWS; r++) {
        const x = GRID_X + c * GRID, y = GRID_Y + r * GRID;
        gridDots.moveTo(x + 2, y);
        gridDots.arc(x, y, 2, 0, Math.PI * 2);
      }
    }
  }
  g.fillStyle = th.gridDot;
  g.fill(gridDots);
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
  const k = px / (Math.max(piece.fw, piece.fh) * GRID);
  g.setTransform(k, 0, 0, k, (px - piece.fw * GRID * k) / 2, (px - piece.fh * GRID * k) / 2);
  drawPiece(g, piece, 0, 0);
}

export function renderIcon(entry, flip, size, scale) {
  const c = document.createElement('canvas');
  paintIcon(c, entry, flip, size, scale);
  return c;
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
