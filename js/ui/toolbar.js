// @ts-check
// The toolbar along the top of the board.

import { BOARD_W } from '../config.js';
import * as world from '../world.js';
import { clearBoard, snapshot, commitEdit, undo, redo } from '../actions.js';
import * as history from '../history.js';
import { board } from '../board.js';
import { isBusy } from '../input.js';
import { pausedBy, setPaused, onPauseChange } from '../pause.js';
import { unlock, setMuted, isMuted } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';
import { toast } from './toast.js';
import { armable } from './confirm.js';
import { setIcon } from './icons.js';

/** Click handler that waits out an in-progress drag (a second finger). */
function onTap(id, fn) {
  document.getElementById(id).addEventListener('click', () => {
    if (isBusy()) return;
    fn();
  });
}

let dropIdx = 0;

/** Drop a marble: from the droppers in turn when there are any (they pin
 *  the course's start), otherwise from a random spot in the sky. */
export function dropMarble() {
  const spawners = [...board.pieces].filter(p => p.entry.spawner);
  if (spawners.length) {
    const d = spawners[dropIdx++ % spawners.length];
    const at = d.entry.spawner;
    // small jitter: back-to-back taps must not stack marbles on the exact
    // same point (coincident bodies separate explosively)
    world.spawnMarble(d.x + at.x + (Math.random() * 10 - 5), d.y + at.y - Math.random() * 8);
  } else {
    world.spawnMarble(BOARD_W * 0.2 + Math.random() * BOARD_W * 0.6, 30);
  }
  chimes.ui.spawn();
}

/** Pause or resume play (the player's own pause, not a menu's). */
export function togglePause() {
  setPaused('user', !pausedBy('user'));
}

export function buildToolbar(openSaveDialog, openSplash) {
  onTap('btn-home', () => {
    unlock();
    openSplash(document.getElementById('btn-home'));
  });

  onTap('btn-marble', () => {
    unlock();
    dropMarble();
  });

  onTap('btn-reset', () => {
    world.resetMarbles({ fade: true });
    chimes.ui.delete();
  });

  armable(document.getElementById('btn-clear'), () => {
    const before = snapshot();
    clearBoard();
    world.resetMarbles({ fade: true });
    chimes.ui.delete();
    if (commitEdit(before)) toast('Board cleared', { action: { label: 'Undo', fn: undo } });
  }, {
    when: () => !isBusy(),
    onArm: () => toast('Tap again to clear the whole board'),
  });

  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  onTap('btn-undo', () => {
    if (undo()) chimes.ui.rotate(); else chimes.ui.deny();
  });
  onTap('btn-redo', () => {
    if (redo()) chimes.ui.rotate(); else chimes.ui.deny();
  });
  const syncHistory = () => {
    undoBtn.classList.toggle('inactive', !history.canUndo());
    redoBtn.classList.toggle('inactive', !history.canRedo());
  };
  history.onHistoryChange(syncHistory);
  syncHistory();

  onTap('btn-save', () => {
    unlock();
    openSaveDialog(document.getElementById('btn-save'));
  });

  const pauseBtn = document.getElementById('btn-pause');
  const syncPause = () => {
    const on = pausedBy('user');
    pauseBtn.classList.toggle('on', on);
    pauseBtn.setAttribute('aria-pressed', String(on));
    pauseBtn.setAttribute('aria-label', on ? 'Play' : 'Pause');
    pauseBtn.title = on ? 'Play' : 'Pause';
    setIcon(pauseBtn.querySelector('svg'), on ? 'play' : 'pause');
  };
  onTap('btn-pause', () => {
    unlock();
    togglePause();
  });
  onPauseChange(syncPause);
  syncPause();

  const muteBtn = document.getElementById('btn-mute');
  const syncMute = () => {
    muteBtn.setAttribute('aria-pressed', String(!isMuted()));
    setIcon(muteBtn.querySelector('svg'), isMuted() ? 'sound-off' : 'sound');
  };
  onTap('btn-mute', () => {
    setMuted(!isMuted());
    unlock();
    syncMute();
  });
  syncMute();
}

const countEl = document.getElementById('marble-count');
let shownCount = -1;

/** Keep the marble count on the drop button current (cheap: called every frame). */
export function syncMarbleCount() {
  const n = world.marbles.length;
  if (n === shownCount) return;
  shownCount = n;
  countEl.textContent = String(n);
}
