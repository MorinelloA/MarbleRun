// @ts-check
// Portrait overlay is pure CSS; this module mirrors it in JS so the game
// can pause physics and duck audio while covered.

import { suspendOutput, resumeOutput } from './audio/engine.js';

let paused = false;
export function isPaused() { return paused; }

export function initOrientation() {
  const mq = window.matchMedia('(orientation: portrait)');
  const apply = () => {
    paused = mq.matches;
    if (paused) suspendOutput();
    else resumeOutput();
  };
  mq.addEventListener('change', apply);
  window.addEventListener('resize', apply); // matchMedia change can be flaky
  apply();

  // Real lock only works in installed-PWA contexts; harmless elsewhere.
  const tryLock = () => {
    const o = /** @type {any} */ (screen.orientation);
    if (o && o.lock) o.lock('landscape').catch(() => {});
    window.removeEventListener('pointerdown', tryLock);
  };
  window.addEventListener('pointerdown', tryLock);
}
