// @ts-check
// Small previews of a board drawn from its piece list, for the start screen
// and the save dialog.

import { BOARD_W, BOARD_H } from '../config.js';
import { board } from '../board.js';
import { paintPiece } from '../render.js';

/** A w x h (CSS px) canvas showing the given serialized pieces. */
export function renderThumb(pieces, w = 232, h = 130) {
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d');
  const s = Math.min((w * 2) / BOARD_W, (h * 2) / BOARD_H);
  g.setTransform(s, 0, 0, s, (w * 2 - BOARD_W * s) / 2, (h * 2 - BOARD_H * s) / 2);
  const sky = g.createLinearGradient(0, 0, 0, BOARD_H);
  sky.addColorStop(0, '#cdeefb');
  sky.addColorStop(1, '#aadcf2');
  g.fillStyle = sky;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  for (const piece of board.deserialize(pieces)) paintPiece(g, piece, piece.x, piece.y);
  return canvas;
}
