// @ts-check
// Two-layer renderer: static pieces (+ background) are pre-painted into an
// offscreen canvas and blitted once per frame; marbles, dynamic pieces and
// the drag ghost are drawn on top each frame.

import { BOARD_W, BOARD_H, GRID, COLS, ROWS, GRID_X, GRID_Y, MARBLE_R, MAX_DPR } from './config.js';
import { board } from './board.js';
import { marbles } from './world.js';

// roundRect landed in Safari 16 — polyfill for older iPads
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : 4, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playfield'));
const ctx = canvas.getContext('2d');

const staticLayer = document.createElement('canvas');
const sctx = staticLayer.getContext('2d');

let RS = 1; // backing-store resolution scale

export function setupCanvas() {
  RS = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  for (const c of [canvas, staticLayer]) {
    c.width = BOARD_W * RS;
    c.height = BOARD_H * RS;
  }
  rebuildStatic();
}

// ---------- painting helpers ----------

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Paint one transformed part descriptor at a piece's board position. */
function paintPart(g, p, ox, oy, color) {
  const fill = p.opts.color || color;
  if (p.opts.sensor) return; // sensors are invisible
  g.fillStyle = fill;
  g.strokeStyle = shade(fill, 0.72);
  g.lineWidth = 2;
  if (p.kind === 'circle') {
    g.beginPath();
    g.arc(ox + p.x, oy + p.y, p.r, 0, Math.PI * 2);
    g.fill(); g.stroke();
  } else {
    g.save();
    g.translate(ox + p.x, oy + p.y);
    g.rotate(p.a);
    const w = p.w, h = p.h, r = Math.min(5, h / 2, w / 2);
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill(); g.stroke();
    g.restore();
  }
}

/** Paint a whole piece (used for static cache, ghost, and tray icons). */
export function paintPiece(g, piece, ox, oy) {
  for (const p of piece.parts) paintPart(g, p, ox, oy, piece.entry.color);
  if (piece.entry.decor && piece.rot === 0 && !piece.flip) {
    g.save();
    g.translate(ox, oy);
    piece.entry.decor(g);
    g.restore();
  }
}

// ---------- static layer ----------

export function rebuildStatic() {
  const g = sctx;
  g.setTransform(RS, 0, 0, RS, 0, 0);
  // sky
  const sky = g.createLinearGradient(0, 0, 0, BOARD_H);
  sky.addColorStop(0, '#cdeefb');
  sky.addColorStop(1, '#aadcf2');
  g.fillStyle = sky;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  // grid dots
  g.fillStyle = 'rgba(45, 74, 117, 0.18)';
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r <= ROWS; r++) {
      g.beginPath();
      g.arc(GRID_X + c * GRID, GRID_Y + r * GRID, 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // static pieces (dynamic ones are drawn per-frame)
  for (const piece of board.pieces) {
    if (piece.entry.dynamic) continue;
    paintPiece(g, piece, piece.x, piece.y);
  }
}

// ---------- per-frame ----------

/** @param {null | {piece: any, x: number, y: number, snapped: boolean, valid: boolean}} ghost */
export function frame(ghost, hud) {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.drawImage(staticLayer, 0, 0, BOARD_W, BOARD_H);

  // dynamic pieces follow their physics body
  for (const piece of board.pieces) {
    if (!piece.dynamicBody) continue;
    const b = piece.dynamicBody;
    drawBodyParts(ctx, b, piece.entry.color);
  }

  // marbles
  for (const m of marbles) {
    ctx.beginPath();
    ctx.arc(m.position.x, m.position.y, MARBLE_R, 0, Math.PI * 2);
    ctx.fillStyle = m.plugin.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m.position.x - 4, m.position.y - 4, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  // drag ghost
  if (ghost) {
    ctx.globalAlpha = 0.65;
    paintPiece(ctx, ghost.piece, ghost.x, ghost.y);
    if (ghost.snapped) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = ghost.valid ? '#3ddc84' : '#ff5252';
      ctx.fillRect(ghost.x, ghost.y, ghost.piece.fw * GRID, ghost.piece.fh * GRID);
    }
    ctx.globalAlpha = 1;
  }

  // debug HUD
  if (hud) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(6, 6, 210, 54);
    ctx.fillStyle = '#9f9';
    ctx.font = '13px monospace';
    ctx.fillText(hud.line1, 14, 26);
    ctx.fillText(hud.line2, 14, 46);
  }
}

/** Generic: draw every part of a (possibly compound) body from its live vertices. */
function drawBodyParts(g, body, color) {
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  g.fillStyle = color;
  g.strokeStyle = shade(color, 0.72);
  g.lineWidth = 2;
  for (const part of parts) {
    const v = part.vertices;
    g.beginPath();
    g.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) g.lineTo(v[i].x, v[i].y);
    g.closePath();
    g.fill(); g.stroke();
  }
  // hub dot at the pivot
  g.beginPath();
  g.arc(body.position.x, body.position.y, 6, 0, Math.PI * 2);
  g.fillStyle = shade(color, 0.6);
  g.fill();
}

export { canvas };
