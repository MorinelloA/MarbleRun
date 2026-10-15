// @ts-check
// Boot + main loop.
//
// URL flags: ?debug shows the HUD from the start (the D key toggles it);
// ?test runs no animation loop and skips the start screen, so screenshots
// and checks can step the game deterministically with __mr.tick(n).

import { GAME_W, GAME_H, PHYS_DT, MAX_SUBSTEPS } from './config.js';
import * as world from './world.js';
import * as render from './render.js';
import * as input from './input.js';
import { board } from './board.js';
import * as actions from './actions.js';
import * as save from './save.js';
import { buildPalette } from './ui/palette.js';
import { buildToolbar } from './ui/toolbar.js';
import * as saveload from './ui/saveload.js';
import * as splash from './ui/splash.js';
import { initOrientation } from './orientation.js';
import { isPaused, setPaused } from './pause.js';
import { unlock } from './audio/engine.js';
import * as rolling from './audio/rolling.js';
import * as impacts from './audio/impacts.js';
import * as chimes from './audio/chimes.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// ---------- scale the fixed-size game to the window ----------
const gameEl = document.getElementById('game');
function layout() {
  let s = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
  if (!isFinite(s) || s <= 0) s = 1;
  gameEl.style.transform = `scale(${s})`;
  gameEl.style.left = `${(window.innerWidth - GAME_W * s) / 2}px`;
  gameEl.style.top = `${(window.innerHeight - GAME_H * s) / 2}px`;
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 100));

// ---------- audio wiring ----------
world.on('impact', (speed, marbleOnMarble, marble) => {
  impacts.trigger(speed, marbleOnMarble, marble);
});
world.on('chime', (note, speed, piece) => chimes.pieceSound(note, speed, piece));
world.on('sensorEnter', (label, sensor, marble) => {
  if (label === 'funnel') chimes.funnelEnter(marble.id);
  else if (label === 'basket') chimes.plink();
});
world.on('sensorExit', (label, sensor, marble) => {
  if (label === 'funnel') chimes.funnelExit(marble.id);
});
world.on('marbleRemoved', (marble) => {
  rolling.releaseMarble(marble.id);
  impacts.forget(marble.id);
  chimes.forgetMarble(marble.id);
});
// iOS starts audio only inside a gesture; a touch's pointerdown may not
// count as one, so unlock on the release too
for (const type of ['pointerdown', 'pointerup', 'touchend']) {
  document.addEventListener(type, () => unlock(), { capture: true });
}

// ---------- board and session wiring ----------
board.onChange(() => render.rebuildStatic());

// save the build before the tab goes away (pagehide alone is unreliable on iOS)
document.addEventListener('visibilitychange', () => {
  setPaused('hidden', document.hidden);
  if (document.hidden) save.flushAutosave();
});
window.addEventListener('pagehide', () => save.flushAutosave());

// ---------- debug HUD ----------
let hudOn = params.has('debug');
let frameMs = 16.7;
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') hudOn = !hudOn;
});

function hud() {
  return hudOn ? {
    line1: `frame ${frameMs.toFixed(1)}ms  bodies ${world.bodyCount()}`,
    line2: `marbles ${world.marbles.length}  rollvoices ${rolling.activeVoices()}`,
  } : null;
}

// ---------- main loop ----------
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  const t0 = performance.now();

  if (!isPaused()) {
    input.tick();
    acc += dt;
    let steps = 0;
    while (acc >= PHYS_DT && steps < MAX_SUBSTEPS) {
      world.step(PHYS_DT);
      acc -= PHYS_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) acc = 0; // don't spiral after a long stall

    rolling.update(world.marbles, world.isRolling);
  }

  render.frame(input.getGhost(), hud());

  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  requestAnimationFrame(frame);
}

/** Test mode: advance n physics steps, then draw one frame. */
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    input.tick();
    world.step(PHYS_DT);
  }
  render.frame(input.getGhost(), hud());
}

// debug/testing handle (the site's walkthrough recorder uses loadPieces)
window.__mr = { world, board, save, actions, loadPieces: actions.loadPieces, render, input, tick };

// ---------- boot ----------
render.setupCanvas();
buildPalette();
buildToolbar(saveload.show, () => splash.show({ closable: true }));
initOrientation();
layout();

if (TEST) {
  render.frame(null, hud());
} else {
  // the loop runs first, so a failure building the start screen can't
  // leave a frozen game
  requestAnimationFrame(frame);
  try {
    splash.show(); // the start screen owns what loads first
  } catch (err) {
    console.error('start screen failed:', err);
    splash.hide();
    actions.loadPieces([]);
  }
}
