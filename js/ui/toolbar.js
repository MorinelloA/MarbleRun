// @ts-check
// Top-right buttons.

import { BOARD_W } from '../config.js';
import * as world from '../world.js';
import { clearBoard, snapshot, commitEdit, undo, redo } from '../actions.js';
import * as history from '../history.js';
import { board } from '../board.js';
import { isBusy } from '../input.js';
import { unlock, setMuted, isMuted } from '../audio/engine.js';
import * as chimes from '../audio/chimes.js';
import { toast } from './toast.js';
import { armable } from './confirm.js';

/** Click handler that waits out an in-progress drag (a second finger). */
function onTap(id, fn) {
  document.getElementById(id).addEventListener('click', () => {
    if (isBusy()) return;
    fn();
  });
}

export function buildToolbar(openSaveDialog, openSplash) {
  onTap('btn-home', () => {
    unlock();
    openSplash();
  });

  let dropIdx = 0;
  onTap('btn-marble', () => {
    unlock();
    // spawners (droppers) pin the course start: release from them when any
    // are placed, otherwise rain marbles from random sky positions
    const spawners = [...board.pieces].filter(p => p.entry.spawner);
    if (spawners.length) {
      const d = spawners[dropIdx++ % spawners.length];
      const at = d.entry.spawner;
      // small jitter: back-to-back taps must not stack marbles on the
      // exact same point (coincident bodies separate explosively)
      world.spawnMarble(d.x + at.x + (Math.random() * 10 - 5), d.y + at.y - Math.random() * 8);
    } else {
      const x = BOARD_W * 0.2 + Math.random() * BOARD_W * 0.6;
      world.spawnMarble(x, 30);
    }
    chimes.ui.spawn();
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
    openSaveDialog();
  });

  const muteBtn = document.getElementById('btn-mute');
  const syncMute = () => {
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', isMuted());
  };
  onTap('btn-mute', () => {
    setMuted(!isMuted());
    unlock();
    syncMute();
  });
  syncMute();
}
