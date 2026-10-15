// @ts-check
// Musical / special piece sounds: FM bells and xylophone bars, bumper boing,
// trampoline sweep, funnel swirl, basket plink — plus tiny UI blips for
// placing / rotating / deleting pieces.

import { CHIME_VOICES } from '../config.js';
import { onReady, buses, soundContext, rumbleBuffer } from './engine.js';
import { fmNote, rumbleVoice, swirl } from './recipes.js';

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880]; // C5 D5 E5 G5 A5
let liveChimes = 0;

/** FM bell strike. freq in Hz; vol 0..1. */
export function strike(freq, vol = 0.8, decay = 1.8) {
  const ctx = soundContext();
  if (!ctx || liveChimes >= CHIME_VOICES) return;
  liveChimes++;
  const carrier = fmNote(ctx, buses.chime, ctx.currentTime, freq, vol, decay);
  carrier.onended = () => { liveChimes--; };
}

const lastChime = new WeakMap(); // piece -> performance.now() of its last sound

/** A music piece's note: bells ring on, bars are short. */
function ring(hz, vol, piece) {
  strike(hz, vol, piece?.entry.role === 'bell' ? 1.8 : 1.2);
}

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
  if (f > 0) ring(f, vol, piece);
}

/** Play a music piece's note right away (tuning it), whatever its cooldown. */
export function playNote(hz, piece) {
  if (piece) lastChime.set(piece, performance.now());
  ring(hz, 0.6, piece);
}

/** A marble reached a goal: a quick rising arpeggio. */
export function goal() {
  strike(523.25, 0.45, 0.5);
  setTimeout(() => strike(659.25, 0.45, 0.5), 70);
  setTimeout(() => strike(783.99, 0.5, 0.8), 140);
}

export function boing(vol = 0.7) {
  const ctx = soundContext();
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
  const ctx = soundContext();
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

// ---- funnel swirl: one shared voice, a whirr each time a marble drops in ----
// A rumble, like the rolling sound's (and on its bus, under the notes).
let swirlVoice = null;

onReady((ctx) => {
  swirlVoice = rumbleVoice(ctx, buses.rolling, rumbleBuffer());
});

export function funnel() {
  const ctx = soundContext();
  if (ctx && swirlVoice) swirl(swirlVoice, ctx.currentTime);
}

// ---- UI blips ----
function blip(freq, dur = 0.07, vol = 0.5, type = 'triangle') {
  const ctx = soundContext();
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
  tick: () => blip(1200, 0.025, 0.18, 'square'), // a gate or switch clicking over
};
