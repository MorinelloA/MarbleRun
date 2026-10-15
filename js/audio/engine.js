// @ts-check
// AudioContext lifecycle + master bus chain. Everything audible routes
// through buses -> masterGain -> compressor -> destination, so many
// simultaneous marbles can never clip.

import { getPref, setPref } from '../prefs.js';
import { rumbleLoop, toBuffer } from './recipes.js';

let ctx = null;
let master = null;
let muted = !!getPref('muted', false);
let unlockedOnce = false;
let suspendTimer = 0;
/** reasons the output is silenced: portrait, menu, hidden, paused */
const ducks = new Set();

export const buses = { rolling: null, impact: null, chime: null, ui: null };
const readyCallbacks = [];

export function context() { return ctx; }

/** The context, when a one-shot sound should be made now; null while muted,
 *  paused or covered by a menu. The context is suspended then, so a sound
 *  made anyway would wait and burst out with the others on resume. */
export function soundContext() { return silent() ? null : ctx; }

/** Register work to run once the AudioContext exists (voice pool setup). */
export function onReady(fn) {
  if (ctx) fn(ctx);
  else readyCallbacks.push(fn);
}

function silent() { return muted || ducks.size > 0; }

/** Fade the master gain to match the mute/duck state, and park the context
 *  while nothing should be heard (a silent context still runs every voice). */
function applyLevel() {
  if (!ctx || !master) return;
  clearTimeout(suspendTimer);
  if (silent()) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    suspendTimer = setTimeout(() => {
      if (silent() && ctx.state === 'running') ctx.suspend();
    }, 400);
  } else {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
  }
}

/**
 * The mix: buses -> master -> compressor -> out. The game builds it once;
 * tools/sound-sheet.html builds its own, to hear and measure sounds exactly
 * as the game plays them.
 * @param {BaseAudioContext} c
 */
export function mixer(c, out = c.destination) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  comp.connect(out);

  const main = c.createGain();
  main.connect(comp);

  const mix = { rolling: null, impact: null, chime: null, ui: null };
  for (const [name, gain] of Object.entries({ rolling: 0.7, impact: 0.9, chime: 0.8, ui: 0.5 })) {
    const bus = c.createGain();
    bus.gain.value = gain;
    bus.connect(main);
    mix[name] = bus;
  }
  return { master: main, buses: mix };
}

function create() {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!AC) return false;
  // play through the iPad's silent switch, like a music app (Safari 16.4+)
  try {
    const session = /** @type {any} */ (navigator).audioSession;
    if (session) session.type = 'playback';
  } catch { /* not supported */ }
  ctx = new AC();

  const mix = mixer(ctx);
  master = mix.master;
  master.gain.value = 0;
  Object.assign(buses, mix.buses);

  for (const fn of readyCallbacks) fn(ctx);
  readyCallbacks.length = 0;
  return true;
}

/**
 * Call from user gestures (iOS only starts or resumes audio inside one).
 * Safe to call repeatedly. Covers Safari's 'interrupted' state after a call
 * or screen lock, not just 'suspended'.
 */
export function unlock() {
  if (!ctx && !create()) return;
  if (ctx.state !== 'running' && (!unlockedOnce || !silent())) {
    ctx.resume().catch(() => {});
    // one silent buffer fully unlocks output on older iOS
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    unlockedOnce = true;
  }
  applyLevel();
}

export function setMuted(m) {
  muted = m;
  setPref('muted', m);
  applyLevel();
}
export function isMuted() { return muted; }

/** Silence (or restore) output for one reason; reasons can overlap. */
export function setDuck(reason, on) {
  if (on) ducks.add(reason);
  else ducks.delete(reason);
  applyLevel();
}

/** The rumble loop the rolling voices and the funnel's swirl share. */
let rumble = null;
export function rumbleBuffer() {
  rumble ||= toBuffer(ctx, rumbleLoop(ctx.sampleRate));
  return rumble;
}
