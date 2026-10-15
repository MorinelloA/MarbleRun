// @ts-check
// Save/load dialog: a "save current run" card plus one card per saved slot.

import { BOARD_W, BOARD_H } from '../config.js';
import * as save from '../save.js';
import { loadPieces } from '../actions.js';
import { board } from '../board.js';
import { toast } from './toolbar.js';

const dialog = document.getElementById('save-dialog');
const grid = document.getElementById('slot-grid');

function makeThumb() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playfield'));
  const t = document.createElement('canvas');
  t.width = 240;
  t.height = 158;
  const g = t.getContext('2d');
  const s = Math.min(240 / BOARD_W, 158 / BOARD_H);
  g.fillStyle = '#bfe7f7';
  g.fillRect(0, 0, 240, 158);
  g.drawImage(canvas, (240 - BOARD_W * s) / 2, (158 - BOARD_H * s) / 2, BOARD_W * s, BOARD_H * s);
  return t.toDataURL('image/jpeg', 0.6);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function rebuild() {
  grid.innerHTML = '';

  // "save current" card
  const newCard = document.createElement('div');
  newCard.className = 'slot-card new-slot';
  newCard.innerHTML = `<div class="thumb-empty">➕</div><div class="slot-name">Save this run</div>`;
  newCard.addEventListener('click', () => {
    if (board.pieces.size === 0) { toast('Build something first!'); return; }
    const id = save.saveSlot(save.nextDefaultName(), makeThumb());
    if (id) { toast('Saved! ⭐'); rebuild(); }
    else toast('Storage full — delete an old save');
  });
  grid.appendChild(newCard);

  for (const { id, doc } of save.listSlots()) {
    const card = document.createElement('div');
    card.className = 'slot-card';
    const img = doc.thumb
      ? `<img src="${doc.thumb}" alt="">`
      : `<div class="thumb-empty">🎢</div>`;
    card.innerHTML = `${img}
      <div class="slot-name">${escapeHtml(doc.name)}</div>
      <div class="slot-date">${fmtDate(doc.ts)}</div>
      <button class="slot-del">🗑</button>`;

    card.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.slot-del')) return;
      loadPieces(doc.pieces);
      hide();
      toast(`Loaded “${doc.name}”`);
    });

    const del = card.querySelector('.slot-del');
    del.addEventListener('click', () => {
      if (del.classList.contains('armed')) {
        save.deleteSlot(id);
        rebuild();
      } else {
        del.classList.add('armed');
        setTimeout(() => del.classList.remove('armed'), 2000);
      }
    });
    grid.appendChild(card);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function show() { rebuild(); dialog.classList.remove('hidden'); }
export function hide() { dialog.classList.add('hidden'); }

document.getElementById('dlg-close').addEventListener('click', hide);
dialog.addEventListener('click', (e) => { if (e.target === dialog) hide(); });
