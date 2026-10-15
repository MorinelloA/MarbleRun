// @ts-check
// Splash screen: pick one of the designed tracks, continue the last build,
// or start from a blank board.

import { BOARD_W, BOARD_H } from '../config.js';
import { PRESETS } from '../presets.js';
import { board } from '../board.js';
import { loadPieces } from '../actions.js';
import * as world from '../world.js';
import * as save from '../save.js';
import { unlock } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';
import { paintPiece } from '../render.js';

const overlay = document.getElementById('splash');
const grid = document.getElementById('splash-grid');

/** Paint a preset's pieces into a small card thumbnail. */
function makeThumb(pieces) {
  const canvas = document.createElement('canvas');
  const W = 232, H = 130;
  canvas.width = W * 2;
  canvas.height = H * 2;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  const s = Math.min((W * 2) / BOARD_W, (H * 2) / BOARD_H);
  g.setTransform(s, 0, 0, s, (W * 2 - BOARD_W * s) / 2, (H * 2 - BOARD_H * s) / 2);
  const sky = g.createLinearGradient(0, 0, 0, BOARD_H);
  sky.addColorStop(0, '#cdeefb');
  sky.addColorStop(1, '#aadcf2');
  g.fillStyle = sky;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  for (const piece of board.deserialize(pieces)) {
    paintPiece(g, piece, piece.x, piece.y);
  }
  return canvas;
}

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
    onPick();
    hide();
  });
  return el;
}

function emptyThumb(icon) {
  const d = document.createElement('div');
  d.className = 'splash-thumb-empty';
  d.textContent = icon;
  return d;
}

function rebuild() {
  grid.innerHTML = '';

  const auto = save.readAutosave();
  if (auto) {
    grid.appendChild(card('Keep Building', '🔨', 'Back to your last run',
      makeThumb(auto.pieces), () => {
        loadPieces(auto.pieces);
      }));
  }

  for (const preset of PRESETS) {
    grid.appendChild(card(preset.name, preset.emoji, preset.blurb,
      makeThumb(preset.pieces), () => {
        loadPieces(preset.pieces);
        for (const [x, y] of preset.spawn) world.spawnMarble(x, y);
      }));
  }

  grid.appendChild(card('Start Your Own', '✨', 'An empty board, all yours',
    emptyThumb('🖌️'), () => {
      loadPieces([]);
    }));
}

export function show() {
  rebuild();
  overlay.classList.remove('hidden');
}

export function hide() {
  overlay.classList.add('hidden');
}

export function isOpen() {
  return !overlay.classList.contains('hidden');
}
