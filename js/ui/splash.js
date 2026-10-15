// @ts-check
// Splash screen: pick one of the designed tracks, continue the last build,
// or start from a blank board. Opened from Home it can also just be closed.

import { PRESETS } from '../presets.js';
import { replaceBoard, undo, session } from '../actions.js';
import * as world from '../world.js';
import * as save from '../save.js';
import { setPaused } from '../pause.js';
import { unlock } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';
import { renderThumb } from './thumbs.js';
import { toast } from './toast.js';

const overlay = document.getElementById('splash');
const grid = document.getElementById('splash-grid');
const closeBtn = document.getElementById('splash-close');

function card(title, emoji, blurb, thumbEl, onPick) {
  const el = document.createElement('button');
  el.className = 'splash-card';
  const head = document.createElement('div');
  head.className = 'splash-card-title';
  head.textContent = `${emoji} ${title}`;
  const sub = document.createElement('div');
  sub.className = 'splash-card-blurb';
  sub.textContent = blurb;
  el.appendChild(thumbEl);
  el.appendChild(head);
  el.appendChild(sub);
  el.addEventListener('click', () => {
    unlock();            // splash tap is the audio-unlock gesture
    chimes.ui.place();
    const replacing = session.dirty;
    onPick();
    hide();
    if (replacing) toast(`Opened ${title}`, { action: { label: 'Undo', fn: undo } });
  });
  return el;
}

function emptyThumb(icon) {
  const d = document.createElement('div');
  d.className = 'splash-thumb-empty';
  d.textContent = icon;
  return d;
}

function safeThumb(pieces) {
  try {
    return renderThumb(pieces);
  } catch (err) {
    console.warn('thumbnail failed:', err);
    return emptyThumb('');
  }
}

function rebuild() {
  grid.textContent = '';

  const auto = save.readAutosave();
  if (auto) {
    grid.appendChild(card('Keep Building', '🔨', 'Back to your last run',
      safeThumb(auto.pieces), () => {
        replaceBoard(auto.pieces, { source: 'autosave' });
      }));
  }

  for (const preset of PRESETS) {
    grid.appendChild(card(preset.name, preset.emoji, preset.blurb,
      safeThumb(preset.pieces), () => {
        replaceBoard(preset.pieces, { source: `preset:${preset.id}` });
        for (const [x, y] of preset.spawn) world.spawnMarble(x, y);
      }));
  }

  grid.appendChild(card('Start Your Own', '✨', 'An empty board, all yours',
    emptyThumb('🖌️'), () => {
      replaceBoard([], { source: 'empty' });
    }));
}

/** @param {{closable?: boolean}} [opts] closable when opened over a board */
export function show({ closable = false } = {}) {
  rebuild();
  closeBtn.classList.toggle('hidden', !closable);
  overlay.classList.remove('hidden');
  setPaused('menu', true);
}

export function hide() {
  overlay.classList.add('hidden');
  setPaused('menu', false);
}

closeBtn.addEventListener('click', () => {
  unlock();
  hide();
});
