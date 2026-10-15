// @ts-check
// Draws the app's icons (see icons.html): a marble rolling into a loop on
// the stage, or just a marble where the icon is tiny.

import '../js/polyfills.js';
import { GRID, MARBLE_R } from '../js/config.js';
import { BY_ID } from '../js/pieces/catalog.js';
import { Piece } from '../js/pieces/piece.js';
import { drawPiece, drawMarble } from '../js/art/draw.js';
import * as theme from '../js/theme.js';

const FILES = [
  { name: 'icon-512.png', size: 512, fill: 0.78 },
  { name: 'icon-192.png', size: 192, fill: 0.78 },
  // maskable: everything inside the middle 80% circle the platform keeps
  { name: 'icon-maskable-512.png', size: 512, fill: 0.56 },
  { name: 'apple-touch-icon.png', size: 180, fill: 0.74 },
  { name: 'favicon-32.png', size: 32, marbleOnly: true },
];

function loopIcon(g, size, fill) {
  const loop = new Piece(BY_ID.loop, 0, 0);
  // the loop and its floor span about 128 x 132 piece units; centre them
  const k = (size * fill) / (2 * GRID);
  g.translate(size / 2 - GRID * k, size / 2 - (GRID + 2) * k);
  g.scale(k, k);
  drawPiece(g, loop, 0, 0);
  // a red marble rolling in along the floor, under the loop's open side
  drawMarble(g, { position: { x: 30, y: 116 - MARBLE_R }, plugin: { ci: 0 } });
}

function marbleIcon(g, size) {
  const k = size / (2 * MARBLE_R + 6);
  g.translate(size / 2, size / 2);
  g.scale(k, k);
  drawMarble(g, { position: { x: 0, y: 0 }, plugin: { ci: 0 } });
}

const holder = document.getElementById('icons');
const out = {};
for (const f of FILES) {
  const c = document.createElement('canvas');
  c.width = c.height = f.size;
  const g = c.getContext('2d');
  g.fillStyle = theme.current().stage;
  g.fillRect(0, 0, f.size, f.size);
  if (f.marbleOnly) marbleIcon(g, f.size);
  else loopIcon(g, f.size, f.fill);
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = f.name;
  fig.append(c, cap);
  holder.appendChild(fig);
  out[f.name] = c.toDataURL('image/png');
}

/** @type {any} */ (window).iconFiles = () => out;
