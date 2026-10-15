// @ts-check
// Boot + main loop.
//
// URL flags: ?debug shows the HUD from the start (the D key toggles it);
// ?test runs no animation loop and skips the start screen, so screenshots
// and checks can step the game deterministically with __mr.tick(n).

import './polyfills.js';
import { PHYS_DT, MAX_SUBSTEPS } from './config.js';
import * as viewport from './viewport.js';
import * as world from './world.js';
import * as render from './render.js';
import * as fx from './fx.js';
import * as theme from './theme.js';
import * as share from './share.js';
import { toast } from './ui/toast.js';
import { boardShown as coachBoardShown } from './ui/coach.js';
import * as input from './input.js';
import { board } from './board.js';
import * as actions from './actions.js';
import * as save from './save.js';
import { buildPalette, refreshIcons } from './ui/palette.js';
import { buildToolbar, syncMarbleCount, togglePause, restartRun } from './ui/toolbar.js';
import * as saveload from './ui/saveload.js';
import * as splash from './ui/splash.js';
import { initOrientation } from './orientation.js';
import { isPaused, pausedBy, setPaused } from './pause.js';
import { unlock } from './audio/engine.js';
import * as rolling from './audio/rolling.js';
import * as impacts from './audio/impacts.js';
import * as chimes from './audio/chimes.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// ---------- sound and reactions ----------
world.on('impact', (speed, marbleOnMarble, marble) => {
  impacts.trigger(speed, marbleOnMarble, marble);
});
world.on('chime', (note, speed, piece) => {
  chimes.pieceSound(note, speed, piece);
  if (piece) fx.strike(piece, speed, world.simTime());
});
world.on('sensorEnter', (name, sensor, marble) => {
  if (name === 'funnel') chimes.funnelEnter(marble.id);
  else if (name === 'basket') chimes.plink();
  // a catch or a funnel entry is a strike; a lift's field or a cannon's
  // breech isn't (a cannon reacts when it fires, via its 'chime')
  const piece = sensor.plugin?.piece;
  if (piece && sensor.plugin.behavior?.type === 'sensor') fx.strike(piece, 1, world.simTime());
});
world.on('sensorExit', (name, sensor, marble) => {
  if (name === 'funnel') chimes.funnelExit(marble.id);
});
world.on('pass', (piece) => {
  fx.strike(piece, 1, world.simTime());
  chimes.ui.tick();
});
world.on('flip', (piece) => {
  fx.strike(piece, 1, world.simTime());
  chimes.ui.tick();
});
world.on('goal', (piece) => {
  fx.strike(piece, 1, world.simTime());
  chimes.goal();
});
world.on('marbleRemoved', (marble, fade) => {
  rolling.releaseMarble(marble.id);
  impacts.forget(marble.id);
  chimes.forgetMarble(marble.id);
  if (fade) fx.fadeMarble(marble, world.simTime());
});
// iOS starts audio only inside a gesture; a touch's pointerdown may not
// count as one, so unlock on the release too
for (const type of ['pointerdown', 'pointerup', 'touchend']) {
  document.addEventListener(type, () => unlock(), { capture: true });
}

// ---------- board and session wiring ----------
board.onChange(() => render.invalidateStatic());

// save the build before the tab goes away (pagehide alone is unreliable on iOS)
document.addEventListener('visibilitychange', () => {
  setPaused('hidden', document.hidden);
  if (document.hidden) save.flushAutosave();
});
window.addEventListener('pagehide', () => save.flushAutosave());

// ---------- debug HUD ----------
let hudOn = params.has('debug');
let workMs = 8;  // physics + drawing per frame (smoothed)
let physMs = 0;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'd' || e.key === 'D') hudOn = !hudOn;
  else if ((e.key === 'p' || e.key === 'P') && !pausedBy('menu')) togglePause();
  else if ((e.key === 'r' || e.key === 'R') && !pausedBy('menu')) restartRun();
});

const f1 = (v) => v.toFixed(1);
function hud() {
  if (!hudOn) return null;
  const ms = render.stats.ms;
  return {
    lines: [
      `frame ${f1(workMs)} ms  physics ${f1(physMs)}  rs ${viewport.view.rs.toFixed(2)}`,
      `draw: static ${f1(ms.static)}  live ${f1(ms.overlay + ms.live)}  moving ${f1(ms.dynamic)}  marbles ${f1(ms.marbles)}`,
      `marbles ${world.marbles.length}  bodies ${world.bodyCount()}  voices ${rolling.activeVoices()}  repaints ${render.stats.staticRebuilds}`,
    ],
  };
}

// ---------- main loop ----------
let last = performance.now();
let acc = 0;

// a device that can't hold 60 fps draws at a lower resolution
const BUDGET_MS = 14;
let overBudgetSince = 0;
function watchBudget(now) {
  if (isPaused() || workMs <= BUDGET_MS) {
    overBudgetSince = 0;
  } else if (!overBudgetSince) {
    overBudgetSince = now;
  } else if (now - overBudgetSince > 3000) {
    viewport.lowerQuality();
    overBudgetSince = 0;
    workMs = BUDGET_MS * 0.8; // measure afresh at the new size
  }
}

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
  const t1 = performance.now();

  // animations run on sim time, so they hold still while the game is paused
  render.frame(input.getGhost(), hud(), world.simTime() + acc);
  syncMarbleCount();

  physMs = physMs * 0.9 + (t1 - t0) * 0.1;
  workMs = workMs * 0.95 + (performance.now() - t0) * 0.05;
  watchBudget(now);
  requestAnimationFrame(frame);
}

/** Test mode: advance n physics steps, then draw one frame. */
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    input.tick();
    world.step(PHYS_DT);
  }
  render.frame(input.getGhost(), hud(), world.simTime());
  syncMarbleCount();
}

// debug/testing handle (the site's walkthrough recorder uses loadPieces)
window.__mr = {
  world, board, save, actions, loadPieces: actions.loadPieces,
  render, viewport, fx, input, tick, splashToy: splash.toyDebug,
};

// ---------- boot ----------
viewport.init(document.getElementById('game'));
render.init();
viewport.onChange(() => {
  render.resize();
  refreshIcons();
});
theme.onChange(() => {
  render.invalidateStatic();
  refreshIcons();
});
buildPalette();
buildToolbar(saveload.show, (opener) => splash.show({ closable: true, opener }));
initOrientation();

/** Open the board a shared link carries, if the address has one. */
function openSharedLink() {
  const doc = share.fromLocation();
  if (!location.hash.startsWith('#b=')) return false;
  share.clearLocation();
  if (!doc || !doc.pieces.length) {
    toast('That link has no board in it');
    return false;
  }
  const replacing = actions.session.dirty;
  actions.replaceBoard(doc.pieces, { source: 'link' });
  toast('Opened a shared board', replacing ? { action: { label: 'Undo', fn: actions.undo } } : {});
  coachBoardShown();
  return true;
}
window.addEventListener('hashchange', () => {
  if (openSharedLink()) splash.hide();
});

if (TEST) {
  render.frame(null, hud(), world.simTime());
} else {
  // the loop runs first, so a failure building the start screen can't
  // leave a frozen game
  requestAnimationFrame(frame);
  try {
    // a shared link goes straight to its board; otherwise the start screen
    // owns what loads first
    if (!openSharedLink()) splash.show();
  } catch (err) {
    console.error('start screen failed:', err);
    splash.hide();
    actions.loadPieces([]);
  }
}
