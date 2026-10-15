// @ts-check
// Top-right buttons + toast helper.

import { BOARD_W } from '../config.js';
import * as world from '../world.js';
import { clearBoard } from '../actions.js';
import { board } from '../board.js';
import { unlock, setMuted, isMuted } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';

const toastEl = document.getElementById('toast');
let toastTimer = 0;

export function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

/** Two-tap confirm helper for destructive buttons. */
function armable(btn, onConfirm, hint) {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('armed')) {
      btn.classList.remove('armed');
      onConfirm();
    } else {
      btn.classList.add('armed');
      toast(hint);
      setTimeout(() => btn.classList.remove('armed'), 2500);
    }
  });
}

export function buildToolbar(openSaveDialog, openSplash) {
  document.getElementById('btn-home').addEventListener('click', () => {
    unlock();
    openSplash();
  });

  let dropIdx = 0;
  document.getElementById('btn-marble').addEventListener('click', () => {
    unlock();
    // droppers pin the course start: release from them when any are placed,
    // otherwise rain marbles from random sky positions
    const droppers = [...board.pieces].filter(p => p.entry.id === 'dropper');
    if (droppers.length) {
      const d = droppers[dropIdx++ % droppers.length];
      // small jitter: back-to-back taps must not stack marbles on the
      // exact same point (coincident bodies separate explosively)
      world.spawnMarble(d.x + 32 + (Math.random() * 10 - 5), d.y + 30 - Math.random() * 8);
    } else {
      const x = BOARD_W * 0.2 + Math.random() * BOARD_W * 0.6;
      world.spawnMarble(x, 30);
    }
    chimes.ui.spawn();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    world.resetMarbles();
    chimes.ui.delete();
  });

  armable(document.getElementById('btn-clear'), () => {
    clearBoard();
    world.resetMarbles();
    chimes.ui.delete();
  }, 'Tap again to clear the whole board');

  document.getElementById('btn-save').addEventListener('click', () => {
    unlock();
    openSaveDialog();
  });

  const muteBtn = document.getElementById('btn-mute');
  muteBtn.addEventListener('click', () => {
    unlock();
    const m = !isMuted();
    setMuted(m);
    muteBtn.textContent = m ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', m);
  });
}
