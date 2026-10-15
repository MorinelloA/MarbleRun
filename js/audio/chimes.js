// @ts-check
// Musical / special piece sounds: FM bells and xylophone bars, bumper boing,
// trampoline sweep, funnel swirl, basket plink — plus tiny UI blips for
// placing / rotating / deleting pieces.

import { CHIME_VOICES } from '../config.js';
import { onReady, buses, context, getNoiseBuffer } from './engine.js';

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880]; // C5 D5 E5 G5 A5
let liveChimes = 0;

/** FM bell strike. freq in Hz; vol 0..1. */
export function strike(freq, vol = 0.8, decay = 1.8) {
  const ctx = context();
  if (!ctx || liveChimes >= CHIME_VOICES) return;
  liveChimes++;
  const t = ctx.currentTime;

  const carrier = ctx.createOscillator();
  carrier.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.frequency.value = freq * 1.41; // inharmonic — bell-like
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(90, t);
  modGain.gain.exponentialRampToValueAtTime(1, t + 0.4);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(vol * 0.5, t + 0.002);
  out.gain.exponentialRampToValueAtTime(0.001, t + decay);

  mod.connect(modGain).connect(carrier.frequency);
  carrier.connect(out).connect(buses.chime);
  mod.start(t); carrier.start(t);
  mod.stop(t + decay + 0.05); carrier.stop(t + decay + 0.05);
  carrier.onended = () => { liveChimes--; };
}

const lastChime = new WeakMap(); // piece -> performance.now() of its last sound

/** Routed from world 'chime' events. note is 'bumper' | 'tramp' | '*' | Hz string. */
export function pieceSound(note, speed, piece) {
  const now = performance.now();
  if (piece) {
    // one sound per piece per 250 ms, so a marble rattling on a bar
    // doesn't machine-gun it
    if (now - (lastChime.get(piece) ?? -Infinity) < 250) return;
    lastChime.set(piece, now);
  }
  const vol = Math.min(0.35 + speed / 12, 1);
  if (note === 'bumper') return boing(vol);
  if (note === 'tramp') return sweep(vol);
  if (note === '*') {
    const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    return strike(f, vol);
  }
  const f = parseFloat(note);
  if (f > 0) strike(f, vol, 1.2);
}

export function boing(vol = 0.7) {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(g).connect(buses.chime);
  osc.start(t); osc.stop(t + 0.2);
}

export function sweep(vol = 0.7) {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(g).connect(buses.chime);
  osc.start(t); osc.stop(t + 0.22);
}

export function plink() {
  strike(660, 0.4, 0.5);
}

// ---- funnel swirl: one shared voice, on while any marble is in a funnel ----
let swirl = null;
const inFunnel = new Set(); // marble ids currently inside a funnel throat

onReady((ctx) => {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 500;
  filter.Q.value = 3;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(buses.chime);
  src.start();
  swirl = { filter, gain };
});

export function funnelEnter(marbleId) {
  inFunnel.add(marbleId);
  const ctx = context();
  if (!ctx || !swirl) return;
  const t = ctx.currentTime;
  swirl.gain.gain.setTargetAtTime(0.35, t, 0.05);
  swirl.filter.frequency.cancelScheduledValues(t);
  swirl.filter.frequency.setValueAtTime(400, t);
  swirl.filter.frequency.exponentialRampToValueAtTime(1400, t + 0.6);
}

export function funnelExit(marbleId) {
  inFunnel.delete(marbleId);
  const ctx = context();
  if (!ctx || !swirl || inFunnel.size > 0) return;
  swirl.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
}

/** A removed marble can't leave the swirl running. */
export function forgetMarble(marbleId) {
  if (inFunnel.has(marbleId)) funnelExit(marbleId);
}

// ---- UI blips ----
function blip(freq, dur = 0.07, vol = 0.5, type = 'triangle') {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = /** @type {OscillatorType} */ (type);
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(buses.ui);
  osc.start(t); osc.stop(t + dur + 0.02);
}

export const ui = {
  place: () => blip(520, 0.08, 0.5),
  rotate: () => blip(700, 0.05, 0.35),
  delete: () => { blip(300, 0.09, 0.5); setTimeout(() => blip(200, 0.1, 0.4), 60); },
  pickup: () => blip(440, 0.05, 0.3),
  spawn: () => blip(880, 0.06, 0.35, 'sine'),
  deny: () => blip(160, 0.12, 0.4, 'square'),
};
