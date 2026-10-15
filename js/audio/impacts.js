// @ts-check
// Collision transients: short filtered noise bursts. Pooled filter/gain
// chains; a fresh (cheap) BufferSource is created per hit. Rate-limited so
// marble pile-ups don't machine-gun.

import { IMPACT_VOICES } from '../config.js';
import { onReady, buses, context } from './engine.js';

/** @type {{filter:any, gain:any, busyUntil:number}[]} */
const chains = [];
let burstBuffer = null;

// rate limiting
const recent = []; // timestamps of recent triggers
const perMarble = new Map(); // marble.id -> last trigger time

onReady((ctx) => {
  const len = Math.floor(ctx.sampleRate * 0.03);
  burstBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = burstBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  for (let i = 0; i < IMPACT_VOICES; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(buses.impact);
    chains.push({ filter, gain, busyUntil: 0 });
  }
});

/** Drop a removed marble's cooldown entry. */
export function forget(marbleId) {
  perMarble.delete(marbleId);
}

/**
 * @param {number} speed relative impact speed
 * @param {boolean} marbleOnMarble glassy clack instead of a thock
 * @param {any} marble the marble body (for per-marble cooldown)
 */
export function trigger(speed, marbleOnMarble, marble) {
  const ctx = context();
  if (!ctx || !burstBuffer) return;
  const now = performance.now();

  // global: max 6 per 50ms window
  while (recent.length && now - recent[0] > 50) recent.shift();
  if (recent.length >= 6) return;
  // per-marble 60ms cooldown
  const last = perMarble.get(marble.id) || 0;
  if (now - last < 60) return;

  const chain = chains.find(c => c.busyUntil <= now);
  if (!chain) return;
  chain.busyUntil = now + 110;
  recent.push(now);
  perMarble.set(marble.id, now);

  const t = ctx.currentTime;
  const vol = Math.min(speed / 15, 1) * (marbleOnMarble ? 0.7 : 0.9);
  chain.filter.frequency.setValueAtTime(
    marbleOnMarble ? 2500 : 1000 + speed * 150, t);
  chain.gain.gain.cancelScheduledValues(t);
  chain.gain.gain.setValueAtTime(vol, t);
  chain.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  const src = ctx.createBufferSource();
  src.buffer = burstBuffer;
  src.connect(chain.filter);
  src.start(t);
}
