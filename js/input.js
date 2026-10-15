// @ts-check
// Pointer state machine: tap a piece to turn it, hold it to mirror it, drag
// to place, move or delete pieces, tap the sky for a marble, grab and fling
// marbles. Single-pointer — the first active pointer wins.

import { GRID, BOARD_W, BOARD_H, COLS, ROWS, MARBLE_R } from './config.js';
import { board } from './board.js';
import * as world from './world.js';
import { placePiece, removePiece, snapshot, commitEdit, undo } from './actions.js';
import { ghostCell, isTrash } from './placement.js';
import { Piece } from './pieces/piece.js';
import * as fx from './fx.js';
import * as chimes from './audio/chimes.js';
import { unlock } from './audio/engine.js';
import { toast } from './ui/toast.js';

const { Body } = window.Matter;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('playfield'));
const trayEl = /** @type {HTMLElement} */ (document.getElementById('tray'));

const TAP_MS = 500;         // shorter presses on a piece turn it
const LONG_PRESS_MS = 500;  // holding a piece this long mirrors it
const TAP_DIST = 8;         // px of movement before a press becomes a drag
const TOUCH_LIFT = 60;      // a new piece floats above the finger on touch
const FLING_GAIN = 0.8;     // share of the finger's speed a thrown marble keeps
const MS_PER_VELOCITY_UNIT = 1000 / 60; // Matter velocities are px per 16.7 ms

let state = 'idle'; // idle | pressed | held | dragNew | dragExisting | dragMarble
let pointerId = null;
let downPos = null;
let downTime = 0;
let pressedPiece = null;
let longPressTimer = 0;
let editBefore = null; // board snapshot from when the current drag began

/**
 * ox/oy: offset from the pointer to the ghost's top-left corner.
 * @type {null | {piece: Piece, x:number, y:number, ox:number, oy:number,
 *   snapped:boolean, valid:boolean, trash:boolean, origin: null|{col:number,row:number}}}
 */
let ghost = null;

let grabbedMarble = null;
const grabTrail = []; // recent {x, y, t} for fling velocity

export function getGhost() { return ghost; }

/** True while a press or drag is in progress (toolbar buttons wait). */
export function isBusy() { return state !== 'idle'; }

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * BOARD_W,
    y: ((e.clientY - r.top) / r.height) * BOARD_H,
  };
}

function updateGhost(e) {
  if (!ghost) return;
  const p = toWorld(e);
  const gx = p.x + ghost.ox;
  const gy = p.y + ghost.oy;
  const { fw, fh } = ghost.piece;
  ghost.trash = isTrash(ghost.origin ? 'existing' : 'new', gx, gy, fw, fh);
  trayEl.classList.toggle('trash-mode', ghost.trash);
  const cell = ghost.trash ? null : ghostCell(gx, gy, fw, fh);
  if (cell) {
    ghost.snapped = true;
    ghost.valid = board.canPlace(ghost.piece, cell.col, cell.row);
    ghost.piece.col = cell.col;
    ghost.piece.row = cell.row;
    ghost.x = ghost.piece.x;
    ghost.y = ghost.piece.y;
  } else {
    ghost.snapped = false;
    ghost.valid = false;
    ghost.x = gx;
    ghost.y = gy;
  }
}

/** Called by the palette when a tray item is pressed. */
export function beginTrayDrag(entry, flip, e) {
  if (state !== 'idle') return;
  unlock();
  state = 'dragNew';
  pointerId = e.pointerId;
  const piece = new Piece(entry, 0, 0, 0, flip);
  ghost = {
    piece,
    x: 0, y: 0,
    // centred on the pointer, and lifted clear of a finger
    ox: -(piece.fw * GRID) / 2,
    oy: -(piece.fh * GRID) / 2 - (e.pointerType === 'touch' ? TOUCH_LIFT : 0),
    snapped: false, valid: false, trash: false, origin: null,
  };
  editBefore = snapshot();
  chimes.ui.pickup();
  updateGhost(e);
}

function beginExistingDrag(piece, e) {
  state = 'dragExisting';
  editBefore = snapshot();
  removePiece(piece);
  ghost = {
    piece,
    x: piece.x, y: piece.y,
    // keep the piece where it was grabbed, so it doesn't jump
    ox: piece.x - downPos.x,
    oy: piece.y - downPos.y,
    snapped: true, valid: true, trash: false,
    origin: { col: piece.col, row: piece.row },
  };
  chimes.ui.pickup();
  updateGhost(e);
}

function endDrag(e) {
  updateGhost(e);
  trayEl.classList.remove('trash-mode');
  const g = ghost;
  ghost = null;
  if (g) {
    if (g.trash) {
      chimes.ui.delete(); // an existing piece dropped on the tray: thrown away
    } else if (g.snapped && g.valid && board.canPlace(g.piece, g.piece.col, g.piece.row)) {
      placePiece(g.piece);
      fx.enter(g.piece, 'place', world.simTime());
      chimes.ui.place();
    } else if (g.origin) {
      // invalid drop of an existing piece — put it back where it was
      g.piece.col = g.origin.col;
      g.piece.row = g.origin.row;
      placePiece(g.piece);
      chimes.ui.deny();
    } else if (!g.snapped) {
      chimes.ui.delete(); // a new piece let go off the board goes back
    } else {
      chimes.ui.deny();
    }
    if (editBefore && commitEdit(editBefore) && g.trash) {
      toast('Piece removed', { ms: 3000, action: { label: 'Undo', fn: undo } });
    }
  }
  editBefore = null;
  state = 'idle';
  pointerId = null;
}

/** Swap a piece for a turned or mirrored copy if the copy fits. */
function reshape(piece, rot, flip) {
  const before = snapshot();
  removePiece(piece);
  const next = new Piece(piece.entry, piece.col, piece.row, rot, flip);
  // nudge back into bounds if a turned footprint pokes out
  next.col = Math.min(next.col, Math.max(0, COLS - next.fw));
  next.row = Math.min(next.row, Math.max(0, ROWS - next.fh));
  if (board.canPlace(next, next.col, next.row)) {
    placePiece(next);
    fx.enter(next, flip !== piece.flip ? 'flip' : 'turn', world.simTime());
    chimes.ui.rotate();
    commitEdit(before);
  } else {
    placePiece(piece); // no room — keep the old shape
    chimes.ui.deny();
  }
}

function rotatePiece(piece) {
  if (!piece.entry.rotatable) { chimes.ui.deny(); return; }
  reshape(piece, (piece.rot + 1) % (piece.entry.rotations || 4), piece.flip);
}

function mirrorPiece(piece) {
  if (!piece.entry.hasMirror) { chimes.ui.deny(); return; }
  reshape(piece, piece.rot, piece.flip ? 0 : 1);
}

function onLongPress() {
  if (state !== 'pressed' || !pressedPiece) return;
  state = 'held';
  mirrorPiece(pressedPiece);
  pressedPiece = null;
}

function grabMarble(m, p) {
  state = 'dragMarble';
  grabbedMarble = m;
  grabTrail.length = 0;
  grabTrail.push({ x: p.x, y: p.y, t: performance.now() });
}

/** Closest marble within `radius` of p, or null. */
function marbleAt(p, radius) {
  let best = null;
  let bestD = radius;
  for (const m of world.marbles) {
    const d = Math.hypot(m.position.x - p.x, m.position.y - p.y);
    if (d <= bestD) { best = m; bestD = d; }
  }
  return best;
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
    const k = (MS_PER_VELOCITY_UNIT / dt) * FLING_GAIN; // px/ms -> Matter units
    Body.setVelocity(grabbedMarble, { x: (b.x - a.x) * k, y: (b.y - a.y) * k });
  }
  grabbedMarble = null;
}

function reset() {
  clearTimeout(longPressTimer);
  state = 'idle';
  pointerId = null;
  pressedPiece = null;
}

// ---------- canvas pointer handlers ----------

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'idle') return;
  unlock();
  pointerId = e.pointerId;
  downPos = toWorld(e);
  downTime = performance.now();

  const { col, row } = board.worldToCell(downPos.x, downPos.y);
  const piece = board.pieceAt(col, row);
  // marbles are small: easy to grab in open sky, but over a piece only a
  // press right on the marble takes it, so a basket full of marbles can
  // still be moved
  const m = marbleAt(downPos, piece ? MARBLE_R + 2 : MARBLE_R * 2);
  if (m) {
    grabMarble(m, downPos);
    return;
  }
  pressedPiece = piece;
  state = 'pressed';
  if (piece) longPressTimer = setTimeout(onLongPress, LONG_PRESS_MS);
});

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;

  if (state === 'pressed') {
    const p = toWorld(e);
    if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > TAP_DIST) {
      clearTimeout(longPressTimer);
      if (pressedPiece) {
        const piece = pressedPiece;
        pressedPiece = null;
        beginExistingDrag(piece, e);
      } else {
        reset(); // a drag on empty space does nothing
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
    if (pressedPiece) {
      if (performance.now() - downTime < TAP_MS) rotatePiece(pressedPiece);
    } else if (downPos.y < BOARD_H - 20) {
      world.spawnMarble(downPos.x, downPos.y); // a press on empty sky drops a marble
      chimes.ui.spawn();
    }
    reset();
  } else if (state === 'held') {
    reset();
  } else if (state === 'dragNew' || state === 'dragExisting') {
    endDrag(e);
  } else if (state === 'dragMarble') {
    flingMarble();
    reset();
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
  editBefore = null;
  if (state === 'dragMarble') flingMarble();
  reset();
});

// ---------- Safari gesture suppression ----------
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
