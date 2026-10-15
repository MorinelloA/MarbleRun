// @ts-check
// The piece tray: one button per tray item, its icon drawn by the same art
// as the board, so the tray always matches what gets placed.

import { TRAY_ITEMS, BY_ID } from '../pieces/catalog.js';
import { view } from '../viewport.js';
import { paintIcon } from '../art/draw.js';
import { beginTrayDrag } from '../input.js';

const ICON_SIZE = 56; // CSS px, inside the scaled game stage
const icons = [];     // { canvas, entry, flip }

export function buildPalette() {
  const holder = document.getElementById('tray-items');
  for (const item of TRAY_ITEMS) {
    const entry = BY_ID[item.type];
    const btn = document.createElement('button');
    btn.className = 'tray-item';

    const canvas = document.createElement('canvas');
    paintIcon(canvas, entry, item.flip, ICON_SIZE, view.rs);
    icons.push({ canvas, entry, flip: item.flip });

    const label = document.createElement('span');
    label.textContent = entry.name + (item.flip ? ' ⇄' : '');

    btn.appendChild(canvas);
    btn.appendChild(label);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      beginTrayDrag(entry, item.flip, e);
    });
    holder.appendChild(btn);
  }
}

/** Redraw every icon at the current render scale. */
export function refreshIcons() {
  for (const { canvas, entry, flip } of icons) paintIcon(canvas, entry, flip, ICON_SIZE, view.rs);
}
