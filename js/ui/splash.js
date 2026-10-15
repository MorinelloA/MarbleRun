// @ts-check
// The start screen: pick one of the designed tracks, carry on with the
// last build, or start from an empty board, on the toy's stage. Opened from
// Home it can also just be closed.

import { GRID, BOARD_W, BOARD_H } from '../config.js';
import { PRESETS } from '../presets.js';
import { replaceBoard, undo, session } from '../actions.js';
import * as world from '../world.js';
import * as save from '../save.js';
import * as theme from '../theme.js';
import { setPaused } from '../pause.js';
import { unlock } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';
import { renderPreview, releaseCanvases } from '../art/draw.js';
import { toast } from './toast.js';
import { trapTab } from './focus.js';
import { createSplashToy } from './splashToy.js';
import * as coach from './coach.js';

const overlay = document.getElementById('splash');
const grid = document.getElementById('splash-grid');
const closeBtn = document.getElementById('splash-close');
const helpBtn = document.getElementById('splash-help');
const toy = createSplashToy(document.getElementById('splash-stage'),
  /** @type {HTMLCanvasElement} */ (document.getElementById('splash-toy')));

const THUMB_W = 232, THUMB_H = 130;
let closable = false;
/** @type {Element | null} */
let returnFocus = null;

function card(title, blurb, thumbEl, onPick) {
  const el = document.createElement('button');
  el.className = 'splash-card';
  const name = document.createElement('span');
  name.className = 'splash-card-title';
  name.textContent = title;
  const sub = document.createElement('span');
  sub.className = 'splash-card-blurb';
  sub.textContent = blurb;
  el.append(thumbEl, name, sub);
  el.addEventListener('click', () => {
    unlock(); // a card tap is the audio-unlock gesture
    chimes.ui.place();
    const replacing = session.dirty;
    onPick();
    hide();
    if (replacing) toast(`Opened ${title}`, { action: { label: 'Undo', fn: undo } });
  });
  return el;
}

/** A card's picture, sized by the card's CSS (fluid), not inline. */
function fluid(c) {
  c.style.width = '';
  c.style.height = '';
  return c;
}

function preview(pieces) {
  try {
    return fluid(renderPreview(pieces, THUMB_W, THUMB_H));
  } catch (err) {
    console.warn('preview failed:', err);
    return fluid(renderPreview([], THUMB_W, THUMB_H));
  }
}

/** An empty board with a dashed footprint, where the first piece goes. */
function emptyBoardPreview() {
  const c = renderPreview([], THUMB_W, THUMB_H);
  const g = c.getContext('2d'); // still in board coordinates
  const px = BOARD_W / THUMB_W; // board units per CSS px of the picture
  g.setLineDash([6 * px, 5 * px]);
  g.lineWidth = 2 * px;
  g.strokeStyle = theme.current().ghostOk;
  g.beginPath();
  g.roundRect(BOARD_W / 2 - GRID, BOARD_H / 2 - GRID, GRID * 2, GRID * 2, 12);
  g.stroke();
  return fluid(c);
}

function rebuild() {
  releaseCanvases(grid);
  grid.textContent = '';

  const auto = save.readAutosave();
  if (auto) {
    grid.appendChild(card('Keep Building', 'Back to your last run', preview(auto.pieces), () => {
      replaceBoard(auto.pieces, { source: 'autosave' });
    }));
  }

  for (const preset of PRESETS) {
    grid.appendChild(card(preset.name, preset.blurb, preview(preset.pieces), () => {
      replaceBoard(preset.pieces, { source: `preset:${preset.id}` });
      for (const [x, y] of preset.spawn) world.spawnMarble(x, y);
    }));
  }

  grid.appendChild(card('Start Your Own', 'An empty board, all yours', emptyBoardPreview(), () => {
    replaceBoard([], { source: 'empty' });
  }));
}

/**
 * @param {{closable?: boolean, opener?: Element | null}} [opts] closable
 *   when opened over a board; opener gets focus back on close
 */
export function show({ closable: canClose = false, opener = document.activeElement } = {}) {
  closable = canClose;
  returnFocus = opener;
  rebuild();
  helpBtn.setAttribute('aria-pressed', 'false');
  closeBtn.classList.toggle('hidden', !closable);
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
  setPaused('menu', true);
  toy.start();
  /** @type {HTMLElement} */ (grid.firstElementChild)?.focus({ preventScroll: true });
}

export function isOpen() {
  return !overlay.classList.contains('hidden');
}

export function hide() {
  overlay.classList.add('hidden');
  toy.stop();
  setPaused('menu', false);
  if (returnFocus instanceof HTMLElement && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
  coach.boardShown();
}

// "How to play" turns the tips on (from the start) for when the board shows.
// It only ever turns them on, so a first-time player can't switch them off
// by asking for help; "Skip tips" is the way to stop them.
helpBtn.addEventListener('click', () => {
  unlock();
  coach.setPending(true);
  helpBtn.setAttribute('aria-pressed', 'true');
});

export const toyDebug = toy.debug;

closeBtn.addEventListener('click', () => {
  unlock();
  hide();
});

overlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && closable) {
    e.preventDefault();
    hide();
  } else {
    trapTab(overlay, e);
  }
});
