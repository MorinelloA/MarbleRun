// @ts-check
// Pointer state machine: tap to rotate / spawn marbles, drag to place,
// move or delete pieces, grab-and-fling marbles. Single-pointer — the
// first active pointer wins.

import { GRID, GRID_X, GRID_Y, BOARD_W, BOARD_H, COLS, ROWS } from './config.js';
import { board } from './board.js';
import * as world from './world.js';
import { placePiece, removePiece } from './actions.js';
import { Piece } from './pieces/piece.js';
import * as chimes from './audio/chimes.js';
import { unlock } from './audio/engine.js';

const { Query, Body } = window.Matter;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playfield'));
const trayEl = /** @type {HTMLElement} */ (document.getElementById('tray'));

const TAP_MS = 300;
const TAP_DIST = 8;
const TOUCH_LIFT = 60; // ghost floats above the finger on touch

let state = 'idle'; // idle | pressed | dragNew | dragExisting | dragMarble
let pointerId = null;
let downPos = null;
let downTime = 0;
let pressedPiece = null;

/** @type {null | {piece: Piece, x:number, y:number, snapped:boolean, valid:boolean, origin: null|{col:number,row:number}}} */
let ghost = null;

let grabbedMarble = null;
const grabTrail = []; // recent {x, y, t} for fling velocity

export function getGhost() { return ghost; }

export function isOverTray(clientY) {
  return clientY >= trayEl.getBoundingClientRect().top;
}

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * BOARD_W,
    y: ((e.clientY - r.top) / r.height) * BOARD_H,
  };
}

function liftedPos(e) {
  const p = toWorld(e);
  if (e.pointerType === 'touch') p.y -= TOUCH_LIFT;
  return p;
}

function updateGhost(e) {
  if (!ghost) return;
  const p = liftedPos(e);
  const fwPx = ghost.piece.fw * GRID;
  const fhPx = ghost.piece.fh * GRID;
  const col = Math.round((p.x - fwPx / 2 - GRID_X) / GRID);
  const row = Math.round((p.y - fhPx / 2 - GRID_Y) / GRID);
  if (board.inBounds(col, row, ghost.piece.fw, ghost.piece.fh) && !isOverTray(e.clientY)) {
    ghost.snapped = true;
    ghost.valid = board.canPlace(ghost.piece, col, row);
    ghost.piece.col = col;
    ghost.piece.row = row;
    ghost.x = GRID_X + col * GRID;
    ghost.y = GRID_Y + row * GRID;
  } else {
    ghost.snapped = false;
    ghost.valid = false;
    ghost.x = p.x - fwPx / 2;
    ghost.y = p.y - fhPx / 2;
  }
}

/** Called by the palette when a tray item is pressed. */
export function beginTrayDrag(entry, flip, e) {
  if (state !== 'idle') return;
  unlock();
  state = 'dragNew';
  pointerId = e.pointerId;
  ghost = {
    piece: new Piece(entry, 0, 0, 0, flip),
    x: 0, y: 0, snapped: false, valid: false, origin: null,
  };
  chimes.ui.pickup();
  trayEl.classList.add('trash-mode');
  updateGhost(e);
}

function beginExistingDrag(piece) {
  state = 'dragExisting';
  removePiece(piece);
  ghost = {
    piece,
    x: piece.x, y: piece.y, snapped: true, valid: true,
    origin: { col: piece.col, row: piece.row },
  };
  chimes.ui.pickup();
  trayEl.classList.add('trash-mode');
}

function endDrag(e) {
  trayEl.classList.remove('trash-mode');
  if (!ghost) { state = 'idle'; return; }
  const overTray = isOverTray(e.clientY);

  if (state === 'dragExisting' && overTray) {
    chimes.ui.delete(); // dropped on the tray = throw it away
  } else if (ghost.snapped && ghost.valid) {
    placePiece(ghost.piece);
    chimes.ui.place();
  } else if (ghost.origin) {
    // invalid drop of an existing piece — put it back where it was
    ghost.piece.col = ghost.origin.col;
    ghost.piece.row = ghost.origin.row;
    placePiece(ghost.piece);
    chimes.ui.deny();
  } else {
    chimes.ui.deny();
  }
  ghost = null;
  state = 'idle';
  pointerId = null;
}

function rotatePiece(piece) {
  if (!piece.entry.rotatable) { chimes.ui.deny(); return; }
  removePiece(piece);
  const next = new Piece(piece.entry, piece.col, piece.row, piece.rot + 1, piece.flip);
  // nudge back into bounds if the rotated footprint pokes out
  next.col = Math.min(next.col, Math.max(0, COLS - next.fw));
  next.row = Math.min(next.row, Math.max(0, ROWS - next.fh));
  if (board.canPlace(next, next.col, next.row)) {
    placePiece(next);
    chimes.ui.rotate();
  } else {
    placePiece(piece); // no room — keep the old orientation
    chimes.ui.deny();
  }
}

function grabMarble(m, p) {
  state = 'dragMarble';
  grabbedMarble = m;
  grabTrail.length = 0;
  grabTrail.push({ x: p.x, y: p.y, t: performance.now() });
}

/** Called from the main loop each frame so a held marble tracks the finger. */
export function tick() {
  if (grabbedMarble && grabTrail.length) {
    const last = grabTrail[grabTrail.length - 1];
    Body.setPosition(grabbedMarble, { x: last.x, y: last.y });
    Body.setVelocity(grabbedMarble, { x: 0, y: 0 });
  }
}

function flingMarble() {
  if (!grabbedMarble) return;
  if (grabTrail.length >= 2) {
    const a = grabTrail[0];
    const b = grabTrail[grabTrail.length - 1];
    const dt = Math.max(16, b.t - a.t);
    // px/ms -> px/step (steps are ~8.33ms)
    const k = 8.33 / dt;
    Body.setVelocity(grabbedMarble, {
      x: (b.x - a.x) * k * 1.2,
      y: (b.y - a.y) * k * 1.2,
    });
  }
  grabbedMarble = null;
}

// ---------- canvas pointer handlers ----------

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'idle') return;
  unlock();
  pointerId = e.pointerId;
  downPos = toWorld(e);
  downTime = performance.now();

  // marbles first — grabbing and flinging them is half the fun
  const hit = Query.point(world.marbles, downPos);
  if (hit.length) {
    grabMarble(hit[0], downPos);
    return;
  }

  const { col, row } = board.worldToCell(downPos.x, downPos.y);
  pressedPiece = board.pieceAt(col, row);
  state = 'pressed';
});

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;

  if (state === 'pressed') {
    const p = toWorld(e);
    if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > TAP_DIST) {
      if (pressedPiece) {
        beginExistingDrag(pressedPiece);
        pressedPiece = null;
        updateGhost(e);
      } else {
        state = 'idle'; // drag on empty space does nothing
        pointerId = null;
      }
    }
  } else if (state === 'dragNew' || state === 'dragExisting') {
    updateGhost(e);
  } else if (state === 'dragMarble') {
    const p = toWorld(e);
    grabTrail.push({ x: p.x, y: p.y, t: performance.now() });
    while (grabTrail.length > 5) grabTrail.shift();
  }
});

window.addEventListener('pointerup', (e) => {
  if (e.pointerId !== pointerId) return;

  if (state === 'pressed') {
    const isTap = performance.now() - downTime < TAP_MS;
    if (isTap) {
      if (pressedPiece) {
        rotatePiece(pressedPiece);
      } else if (downPos.y < BOARD_H - 20) {
        world.spawnMarble(downPos.x, downPos.y); // tap empty sky = drop a marble!
        chimes.ui.spawn();
      }
    }
    pressedPiece = null;
    state = 'idle';
    pointerId = null;
  } else if (state === 'dragNew' || state === 'dragExisting') {
    endDrag(e);
  } else if (state === 'dragMarble') {
    flingMarble();
    state = 'idle';
    pointerId = null;
  }
});

window.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== pointerId) return;
  // the browser took the gesture (tray scroll, system gesture) — bail out
  // quietly: restore a moved piece, discard a new ghost
  trayEl.classList.remove('trash-mode');
  if (ghost && ghost.origin) {
    ghost.piece.col = ghost.origin.col;
    ghost.piece.row = ghost.origin.row;
    placePiece(ghost.piece);
  }
  ghost = null;
  if (state === 'dragMarble') flingMarble();
  state = 'idle';
  pointerId = null;
  pressedPiece = null;
});

// ---------- Safari gesture suppression ----------
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
