// @ts-check
// The piece tray: a pill per kind of piece (TRAY_GROUPS) and a tile per
// piece of the chosen kind, its icon drawn by the board's own art. Every
// tile stays in the page, those of other kinds hidden, and a tile's text is
// exactly the piece's name (the mirror mark is an icon), which the site's
// walkthrough recorder relies on.

import { TRAY_GROUPS, BY_ID } from '../pieces/catalog.js';
import { view } from '../viewport.js';
import { paintIcon } from '../art/draw.js';
import { beginTrayDrag } from '../input.js';
import { getPref, setPref } from '../prefs.js';
import { icon } from './icons.js';

const ICON_SIZE = 56; // CSS px, inside the scaled game stage
/** @type {{el: HTMLElement, canvas: HTMLCanvasElement, entry: any, flip: number, group: string}[]} */
const tiles = [];
/** @type {HTMLElement[]} */
const pills = [];

export function buildPalette() {
  const groupsEl = document.getElementById('tray-groups');
  const itemsEl = document.getElementById('tray-items');
  for (const group of TRAY_GROUPS) {
    const pill = document.createElement('button');
    pill.className = 'group-pill';
    pill.dataset.group = group.id;
    pill.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span');
    name.textContent = group.name;
    pill.append(icon(group.icon), name);
    pill.addEventListener('click', () => select(group.id));
    groupsEl.appendChild(pill);
    pills.push(pill);

    for (const item of group.items) {
      const entry = BY_ID[item.type];
      const tile = document.createElement('button');
      tile.className = 'tray-item';
      tile.dataset.group = group.id;
      tile.setAttribute('aria-label', item.flip ? `${entry.name}, mirrored` : entry.name);
      const canvas = document.createElement('canvas');
      paintIcon(canvas, entry, item.flip, ICON_SIZE, view.rs);
      const label = document.createElement('span');
      label.textContent = entry.name;
      tile.append(canvas, label);
      if (item.flip) tile.appendChild(icon('mirror', 'mirror'));
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        beginTrayDrag(entry, item.flip, e);
      });
      itemsEl.appendChild(tile);
      tiles.push({ el: tile, canvas, entry, flip: item.flip, group: group.id });
    }
  }
  select(getPref('trayGroup', TRAY_GROUPS[0].id));
}

/** Show one kind of piece. */
export function select(id) {
  if (!TRAY_GROUPS.some(g => g.id === id)) id = TRAY_GROUPS[0].id;
  for (const pill of pills) pill.setAttribute('aria-pressed', String(pill.dataset.group === id));
  for (const t of tiles) t.el.classList.toggle('off', t.group !== id);
  document.getElementById('tray-items').scrollLeft = 0;
  setPref('trayGroup', id);
}

/** Redraw every icon at the current render scale. */
export function refreshIcons() {
  for (const t of tiles) paintIcon(t.canvas, t.entry, t.flip, ICON_SIZE, view.rs);
}
