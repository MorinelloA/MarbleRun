// @ts-check
// Draws the catalog sheet (see catalog-sheet.html).

import '../js/polyfills.js';
import { GRID } from '../js/config.js';
import { CATALOG } from '../js/pieces/catalog.js';
import { Piece } from '../js/pieces/piece.js';
import { drawPiece, drawBoardBackground } from '../js/art/draw.js';

const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale')) || window.devicePixelRatio || 1;
const outlines = params.get('outlines') !== '0';

const PAD = 14;
const CELL = 2 * GRID + 2 * PAD;   // fits the biggest footprint, 2 x 2
const LABEL_W = 110;
const COLS = 8;                    // 4 turns x 2 mirror images, at most

/** Every orientation the game can produce for an entry. */
function orientations(entry) {
  const turns = entry.rotatable ? (entry.rotations || 4) : 1;
  const out = [];
  for (const flip of entry.hasMirror ? [0, 1] : [0]) {
    for (let rot = 0; rot < turns; rot++) out.push([rot, flip]);
  }
  return out;
}

function drawOutlines(g, piece, ox, oy) {
  g.save();
  g.translate(ox - piece.x, oy - piece.y);
  g.lineWidth = 1;
  for (const body of piece.buildBodies()) {
    const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
    for (const part of parts) {
      g.strokeStyle = part.isSensor ? '#00b4d8' : 'rgba(255, 255, 255, 0.85)';
      g.setLineDash(part.isSensor ? [3, 3] : []);
      g.beginPath();
      part.vertices.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y)));
      g.closePath();
      g.stroke();
    }
  }
  g.restore();
}

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('sheet'));
const W = LABEL_W + COLS * CELL;
const H = CATALOG.length * CELL;
canvas.width = Math.round(W * scale);
canvas.height = Math.round(H * scale);
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const g = canvas.getContext('2d', { alpha: false });
g.scale(scale, scale);
g.fillStyle = '#1a1a1f';
g.fillRect(0, 0, W, H);
g.font = '12px system-ui, sans-serif';
g.textBaseline = 'middle';

CATALOG.forEach((entry, row) => {
  const y = row * CELL;
  g.fillStyle = '#f3f1ec';
  g.fillText(entry.name, 10, y + CELL / 2 - 8);
  g.fillStyle = '#a9a8a3';
  g.fillText(entry.id, 10, y + CELL / 2 + 8);
  orientations(entry).forEach(([rot, flip], col) => {
    const x = LABEL_W + col * CELL;
    g.save();
    g.beginPath();
    g.rect(x + 1, y + 1, CELL - 2, CELL - 2);
    g.clip();
    g.translate(x, y);
    drawBoardBackground(g, { grid: false });
    g.restore();

    const piece = new Piece(entry, 0, 0, rot, flip);
    const ox = x + PAD, oy = y + PAD;
    g.setLineDash([4, 4]);
    g.strokeStyle = '#3d3d44';
    g.strokeRect(ox, oy, piece.fw * GRID, piece.fh * GRID);
    g.setLineDash([]);
    drawPiece(g, piece, ox, oy);
    if (outlines) drawOutlines(g, piece, ox, oy);
    g.fillStyle = '#a9a8a3';
    g.fillText(`r${rot}${flip ? ' m' : ''}`, x + 4, y + CELL - 8);
  });
});

window.__sheetReady = true;
