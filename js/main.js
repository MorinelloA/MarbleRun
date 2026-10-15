// @ts-check
// Boot + main loop.

import { GAME_W, GAME_H, PHYS_DT, MAX_SUBSTEPS } from './config.js';
import * as world from './world.js';
import * as render from './render.js';
import * as input from './input.js';
import { board } from './board.js';
import { loadPieces } from './actions.js';
import * as save from './save.js';
import { buildPalette } from './ui/palette.js';
import { buildToolbar } from './ui/toolbar.js';
import * as saveload from './ui/saveload.js';
import * as splash from './ui/splash.js';
import { initOrientation, isPaused } from './orientation.js';
import { unlock } from './audio/engine.js';
import * as rolling from './audio/rolling.js';
import * as impacts from './audio/impacts.js';
import * as chimes from './audio/chimes.js';

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
world.on('sensorEnter', (label) => {
  if (label === 'funnel') chimes.funnelEnter();
  else if (label === 'basket') chimes.plink();
});
world.on('sensorExit', (label) => {
  if (label === 'funnel') chimes.funnelExit();
});
document.addEventListener('pointerdown', () => unlock(), { capture: true });

// ---------- board wiring ----------
board.onChange(() => {
  render.rebuildStatic();
  save.scheduleAutosave();
});

// ---------- boot ----------
render.setupCanvas();
buildPalette();
buildToolbar(saveload.show, splash.show);
initOrientation();
layout();

// the splash screen owns what loads first (a preset, the autosave, or a blank board)
splash.show();

// ---------- debug HUD ----------
let hudOn = false;
let frameMs = 16.7;
window.addEventListener('keydown', (e) => { if (e.key === 'd') hudOn = !hudOn; });
let cornerTaps = [];
document.addEventListener('pointerdown', (e) => {
  if (e.clientX < 90 && e.clientY < 90) {
    const now = performance.now();
    cornerTaps = cornerTaps.filter(t => now - t < 900);
    cornerTaps.push(now);
    if (cornerTaps.length >= 3) { hudOn = !hudOn; cornerTaps = []; }
  }
});

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

  const hud = hudOn ? {
    line1: `frame ${frameMs.toFixed(1)}ms  bodies ${world.bodyCount()}`,
    line2: `marbles ${world.marbles.length}  rollvoices ${rolling.activeVoices()}`,
  } : null;
  render.frame(input.getGhost(), hud);

  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug/testing handle
window.__mr = { world, board, save, loadPieces, render, input };
