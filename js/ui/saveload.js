// @ts-check
// Save/load dialog: a "save current run" card, one card per saved slot, and
// a row of earlier boards (builds that were replaced by something else).
// Cards are built with DOM APIs; nothing stored is ever parsed as HTML.

import { BOARD_W, BOARD_H } from '../config.js';
import * as save from '../save.js';
import { replaceBoard, undo } from '../actions.js';
import { board } from '../board.js';
import { setPaused } from '../pause.js';
import { renderThumb } from './thumbs.js';
import { toast } from './toast.js';

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

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function thumbFor(doc) {
  if (doc.thumb) {
    const img = /** @type {HTMLImageElement} */ (el('img'));
    img.alt = '';
    img.src = doc.thumb;
    return img;
  }
  const c = renderThumb(doc.pieces, 240, 158);
  c.className = 'slot-thumb';
  c.style.width = '';   // sized by the card's CSS instead
  c.style.height = '';
  return c;
}

function loadDoc(doc) {
  const replacing = board.pieces.size > 0;
  replaceBoard(doc.pieces, { source: 'slot' });
  hide();
  toast(`Opened “${doc.name}”`, replacing ? { action: { label: 'Undo', fn: undo } } : {});
}

function rebuild() {
  grid.textContent = '';

  // "save current" card
  const newCard = el('div', 'slot-card new-slot');
  newCard.appendChild(el('div', 'thumb-empty', '➕'));
  newCard.appendChild(el('div', 'slot-name', 'Save this run'));
  newCard.addEventListener('click', () => {
    if (board.pieces.size === 0) { toast('Build something first!'); return; }
    const id = save.saveSlot(save.nextDefaultName(), makeThumb());
    if (id) { toast('Saved! ⭐'); rebuild(); }
    else toast('Storage full — delete an old save');
  });
  grid.appendChild(newCard);

  for (const { id, doc } of save.listSlots()) {
    const card = el('div', 'slot-card');
    card.appendChild(thumbFor(doc));
    card.appendChild(el('div', 'slot-name', doc.name));
    card.appendChild(el('div', 'slot-date', fmtDate(doc.ts)));
    const del = el('button', 'slot-del', '🗑');
    del.setAttribute('aria-label', `Delete ${doc.name}`);
    card.appendChild(del);

    card.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.slot-del')) return;
      loadDoc(doc);
    });
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

  const backups = save.listBackups();
  if (backups.length) {
    grid.appendChild(el('div', 'slot-section', 'Earlier boards'));
    for (const doc of backups) {
      const card = el('div', 'slot-card backup');
      card.appendChild(thumbFor(doc));
      card.appendChild(el('div', 'slot-name', doc.name));
      card.appendChild(el('div', 'slot-date', fmtDate(doc.ts)));
      card.addEventListener('click', () => loadDoc(doc));
      grid.appendChild(card);
    }
  }
}

export function show() {
  rebuild();
  dialog.classList.remove('hidden');
  setPaused('menu', true);
}

export function hide() {
  dialog.classList.add('hidden');
  setPaused('menu', false);
}

document.getElementById('dlg-close').addEventListener('click', hide);
dialog.addEventListener('click', (e) => { if (e.target === dialog) hide(); });
