// @ts-check
// The star feature: continuous per-marble rolling sound.
// A pool of voices (looped noise -> bandpass -> gain) is assigned to the
// loudest marbles each frame; filter frequency, gain and playback rate all
// track marble speed, and airborne marbles fade to silence so landings pop.

import { ROLL_VOICES } from '../config.js';
import { onReady, buses, getNoiseBuffer, context } from './engine.js';

/** @type {{src:any, filter:any, gain:any, marbleId:number|null, score:number}[]} */
const voices = [];

onReady((ctx) => {
  for (let i = 0; i < ROLL_VOICES; i++) {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.15; // slight per-voice character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(buses.rolling);
    src.start();
    voices.push({ src, filter, gain, marbleId: null, score: 0 });
  }
});

export function releaseMarble(marbleId) {
  for (const v of voices) {
    if (v.marbleId === marbleId) {
      v.marbleId = null;
      v.score = 0;
      if (context()) v.gain.gain.setTargetAtTime(0, context().currentTime, 0.03);
    }
  }
}

/**
 * @param {any[]} marbles Matter marble bodies
 * @param {(id: number) => boolean} isRolling sticky contact test
 */
export function update(marbles, isRolling) {
  const ctx = context();
  if (!ctx || voices.length === 0) return;
  const t = ctx.currentTime;

  // score every marble: only touching + moving marbles make rolling noise
  const byId = new Map();
  for (const m of marbles) {
    byId.set(m.id, { m, score: isRolling(m.id) ? m.speed : 0 });
  }

  // keep sticky assignments that are still valid
  const assigned = new Set();
  for (const v of voices) {
    if (v.marbleId !== null && byId.has(v.marbleId)) {
      v.score = byId.get(v.marbleId).score;
      assigned.add(v.marbleId);
    } else if (v.marbleId !== null) {
      v.marbleId = null;
      v.score = 0;
      v.gain.gain.setTargetAtTime(0, t, 0.03);
    }
  }

  // candidates not yet voiced, loudest first
  const candidates = [...byId.values()]
    .filter(e => !assigned.has(e.m.id) && e.score > 0.5)
    .sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    // free voice, or steal one that is clearly quieter (hysteresis)
    let target = null;
    for (const v of voices) if (v.marbleId === null) { target = v; break; }
    if (!target) {
      let quietest = voices[0];
      for (const v of voices) if (v.score < quietest.score) quietest = v;
      if (cand.score > quietest.score * 1.5 + 1) target = quietest;
    }
    if (!target) break;
    target.marbleId = cand.m.id;
    target.score = cand.score;
  }

  // drive the assigned voices from marble state
  for (const v of voices) {
    if (v.marbleId === null) continue;
    const e = byId.get(v.marbleId);
    const speed = e.m.speed;
    const touching = e.score > 0;
    const gain = touching ? Math.min(speed / 14, 1) * 0.5 : 0;
    v.gain.gain.setTargetAtTime(gain, t, 0.05);
    v.filter.frequency.setTargetAtTime(250 + speed * 55, t, 0.05);
    v.src.playbackRate.setTargetAtTime(0.8 + speed / 30, t, 0.05);
  }
}

export function activeVoices() {
  return voices.filter(v => v.marbleId !== null).length;
}
