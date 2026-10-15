// @ts-check
// The "My marble runs" dialog: save the board as a new run, open, rename,
// save over, copy or delete a saved one, or go back to a recent autosave
// (a build that was replaced by something else). Pictures are drawn from
// each run's pieces. Cards are built with DOM APIs; nothing stored is ever
// parsed as HTML.

import * as save from '../save.js';
import { replaceBoard, undo } from '../actions.js';
import { board } from '../board.js';
import { setPaused } from '../pause.js';
import * as chimes from '../audio/chimes.js';
import { renderPreview, releaseCanvases } from '../art/draw.js';
import { toast } from './toast.js';
import { armable } from './confirm.js';
import { icon } from './icons.js';
import { trapTab } from './focus.js';
import { linkFor } from '../share.js';

const dialog = document.getElementById('save-dialog');
const grid = document.getElementById('slot-grid');
const closeBtn = document.getElementById('dlg-close');
const THUMB_W = 240, THUMB_H = 158;
/** @type {Element | null} */
let returnFocus = null;

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function picture(doc) {
  let c;
  try {
    c = renderPreview(doc.pieces, THUMB_W, THUMB_H);
  } catch (err) {
    console.warn('preview failed:', err);
    c = renderPreview([], THUMB_W, THUMB_H);
  }
  c.style.width = ''; // sized by the card's CSS
  c.style.height = '';
  return c;
}

function loadDoc(doc) {
  const replacing = board.pieces.size > 0;
  replaceBoard(doc.pieces, { source: 'slot' });
  hide();
  toast(`Opened “${doc.name}”`, replacing ? { action: { label: 'Undo', fn: undo } } : {});
}

function actionButton(name, label) {
  const b = el('button', 'slot-act');
  b.setAttribute('aria-label', label);
  b.title = label;
  b.appendChild(icon(name));
  return b;
}

/** Turn a run's name into a text field; Return or leaving it saves, Escape
 *  cancels. The field sits outside the card's open button, so typing in it
 *  can never open the run. */
function startRename(id, nameEl) {
  const input = /** @type {HTMLInputElement} */ (el('input', 'slot-rename'));
  input.value = nameEl.textContent;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'New name');
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    const name = keep ? save.renameSlot(id, input.value) : null;
    if (name) toast(`Renamed “${name}”`);
    rebuild();
    /** @type {HTMLElement} */ (grid.querySelector(`[data-slot="${id}"] .slot-act`))?.focus();
  };
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault(); // no key press left over to land on whatever gets focus
      finish(e.key === 'Enter');
    }
  });
  input.addEventListener('blur', () => finish(true));
  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

function slotCard(id, doc) {
  const card = el('div', 'slot-card');
  card.dataset.slot = id;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', doc.name);

  const open = el('button', 'slot-open');
  open.setAttribute('aria-label', `Open ${doc.name}`);
  open.appendChild(picture(doc));
  open.addEventListener('click', () => loadDoc(doc));
  // the name opens the run too, except while it's being renamed
  const meta = el('div', 'slot-meta');
  const name = el('span', 'slot-name', doc.name);
  meta.append(name, el('span', 'slot-date', fmtDate(doc.ts)));
  meta.addEventListener('click', () => {
    if (!meta.querySelector('input')) loadDoc(doc);
  });

  const actions = el('div', 'slot-actions');
  const rename = actionButton('rename', `Rename ${doc.name}`);
  rename.addEventListener('click', () => startRename(id, name));
  const overwrite = actionButton('save-here', `Save this board over ${doc.name}`);
  armable(overwrite, () => {
    if (board.pieces.size === 0) { toast('Build something first!'); return; }
    if (save.overwriteSlot(id)) {
      chimes.ui.place();
      toast(`Saved over “${doc.name}”`);
      rebuild();
    } else {
      toast('Storage full: delete an old save');
    }
  }, { onArm: () => toast(`Tap again to save over “${doc.name}”`) });
  const copy = actionButton('copy', `Copy ${doc.name}`);
  copy.addEventListener('click', () => {
    if (save.duplicateSlot(id)) {
      chimes.ui.place();
      rebuild();
    } else {
      toast('Storage full: delete an old save');
    }
  });
  const del = actionButton('trash', `Delete ${doc.name}`);
  armable(del, () => {
    save.deleteSlot(id);
    chimes.ui.delete();
    rebuild();
  }, { ms: 2000, onArm: () => toast(`Tap again to delete “${doc.name}”`) });
  actions.append(rename, overwrite, copy, del);

  card.append(open, meta, actions);
  return card;
}

function rebuild() {
  releaseCanvases(grid);
  grid.textContent = '';

  // save the board as a new run
  const newCard = el('button', 'slot-card new-slot');
  const plus = el('span', 'slot-thumb-new');
  plus.appendChild(icon('plus'));
  newCard.append(plus, el('span', 'slot-name', 'Save this run'), el('span', 'slot-date', 'as a new one'));
  newCard.addEventListener('click', () => {
    if (board.pieces.size === 0) { toast('Build something first!'); return; }
    const id = save.saveSlot(save.nextDefaultName());
    if (id) {
      chimes.ui.place();
      toast('Saved!');
      rebuild();
    } else {
      toast('Storage full: delete an old save');
    }
  });
  grid.appendChild(newCard);

  for (const { id, doc } of save.listSlots()) grid.appendChild(slotCard(id, doc));

  const backups = save.listBackups();
  if (backups.length) {
    grid.appendChild(el('div', 'slot-section label', 'Recent autosaves'));
    for (const doc of backups) {
      const card = el('button', 'slot-card backup');
      card.setAttribute('aria-label', `Open the board from ${fmtDate(doc.ts)}`);
      card.append(picture(doc), el('span', 'slot-name', 'Earlier board'), el('span', 'slot-date', fmtDate(doc.ts)));
      card.addEventListener('click', () => loadDoc(doc));
      grid.appendChild(card);
    }
  }
}

/** @param {Element | null} [opener] gets focus back on close (Safari
 *  doesn't focus a tapped button, so the caller names it) */
export function show(opener = document.activeElement) {
  returnFocus = opener;
  rebuild();
  dialog.classList.remove('hidden');
  setPaused('menu', true);
  closeBtn.focus({ preventScroll: true });
}

export function hide() {
  dialog.classList.add('hidden');
  setPaused('menu', false);
  if (returnFocus instanceof HTMLElement && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}

closeBtn.addEventListener('click', hide);
dialog.addEventListener('click', (e) => { if (e.target === dialog) hide(); });

// share the board as a link: the system's share sheet where there is one,
// otherwise the clipboard
document.getElementById('dlg-share').addEventListener('click', async () => {
  const pieces = board.serialize();
  if (!pieces.length) { toast('Build something first!'); return; }
  const url = linkFor(pieces);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Marble Run Builder', text: 'Try my marble run!', url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // the player closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied: send it to a friend');
  } catch {
    window.prompt('Copy this link to share the board', url);
  }
});

// keyboard: Escape closes, and Tab stays inside the dialog
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    hide();
  } else {
    trapTab(dialog, e);
  }
});
