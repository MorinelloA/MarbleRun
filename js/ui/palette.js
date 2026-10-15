// @ts-check
// The piece tray: one button per tray item, icon painted from the piece's
// own geometry so visuals always match physics.

import { GRID } from '../config.js';
import { TRAY_ITEMS, BY_ID } from '../pieces/catalog.js';
import { Piece } from '../pieces/piece.js';
import { paintPiece } from '../render.js';
import { beginTrayDrag } from '../input.js';

export function buildPalette() {
  const holder = document.getElementById('tray-items');
  for (const item of TRAY_ITEMS) {
    const entry = BY_ID[item.type];
    const btn = document.createElement('button');
    btn.className = 'tray-item';

    const icon = document.createElement('canvas');
    const iconSize = 56;
    icon.width = iconSize * 2;
    icon.height = iconSize * 2;
    icon.style.width = `${iconSize}px`;
    icon.style.height = `${iconSize}px`;
    const g = icon.getContext('2d');
    const piece = new Piece(entry, 0, 0, 0, item.flip);
    const px = Math.max(piece.fw, piece.fh) * GRID;
    const s = (iconSize * 2) / px;
    g.setTransform(s, 0, 0, s, 0, 0);
    // center smaller dimension
    g.translate((px - piece.fw * GRID) / 2, (px - piece.fh * GRID) / 2);
    paintPiece(g, piece, 0, 0);

    const label = document.createElement('span');
    label.textContent = entry.name + (item.flip ? ' ⇄' : '');

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      beginTrayDrag(entry, item.flip, e);
    });
    holder.appendChild(btn);
  }
}
