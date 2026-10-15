// @ts-check
// Knocks: a marble striking something sounds like what it struck, a warm
// wooden "tok" on track, deeper on blocks, a thud on the floor and a glassy
// tick on another marble, as loud as it struck (its speed into the
// surface, so rolling over a seam stays quiet). Each material's knock is
// rendered once; pooled filter/gain chains play them, rate-limited so
// marble pile-ups don't machine-gun.

import { IMPACT_VOICES } from '../config.js';
import { onReady, buses, soundContext } from './engine.js';
import {
  KNOCKS, KNOCK_MIN_GAIN, renderKnock, knockChain, playKnock, knockStrength, knockGain, materialOf, toBuffer,
} from './recipes.js';

/** @type {{filter:BiquadFilterNode, gain:GainNode, busyUntil:number}[]} */
const chains = [];
/** material -> its rendered knock and level */
const knocks = {};

// rate limiting
const recent = []; // timestamps of recent triggers
const perMarble = new Map(); // marble.id -> {t, gain} of its last knock

onReady((ctx) => {
  for (const [name, recipe] of Object.entries(KNOCKS)) {
    knocks[name] = { buffer: toBuffer(ctx, renderKnock(ctx.sampleRate, recipe)), level: recipe.level };
  }
  for (let i = 0; i < IMPACT_VOICES; i++) {
    chains.push({ ...knockChain(ctx, buses.impact), busyUntil: 0 });
  }
});

/** Drop a removed marble's cooldown entry. */
export function forget(marbleId) {
  perMarble.delete(marbleId);
}

/**
 * @param {number} into the marble's speed into the surface it struck
 * @param {any} other the body it struck
 * @param {any} marble the marble body (for per-marble cooldown)
 */
export function trigger(into, other, marble) {
  const ctx = soundContext();
  if (!ctx || chains.length === 0) return;
  const knock = knocks[materialOf(other)];
  const s = knockStrength(into);
  const gain = knockGain(s, knock.level);
  if (gain < KNOCK_MIN_GAIN) return;
  const now = performance.now();

  // global: max 6 per 50ms window
  while (recent.length && now - recent[0] > 50) recent.shift();
  if (recent.length >= 6) return;
  // per-marble 60ms cooldown, unless this knock is much the harder
  const last = perMarble.get(marble.id);
  if (last && now - last.t < 60 && gain < 2 * last.gain) return;

  const chain = chains.find(c => c.busyUntil <= now);
  if (!chain) return;
  recent.push(now);
  perMarble.set(marble.id, { t: now, gain });

  const seconds = playKnock(ctx, chain, knock.buffer, knock.level, s, ctx.currentTime);
  chain.busyUntil = now + seconds * 1000;
}
