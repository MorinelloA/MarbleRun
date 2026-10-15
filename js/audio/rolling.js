// @ts-check
// The sound of marbles rolling: a soft rumble for each marble rolling on a
// track. A pool of voices is handed to the loudest marbles each frame; a
// voice's loudness, brightness and flutter follow its marble's speed.
// Marbles rolling on bars or bells are left quiet (their notes are the
// sound), and airborne ones fade out, so landings stand out.

import { ROLL_VOICES } from '../config.js';
import { onReady, buses, context, rumbleBuffer } from './engine.js';
import { rumbleVoice, rollLevel, rollCutoff, rollFlutter } from './recipes.js';

/** @type {{lows:BiquadFilterNode[], lfo:OscillatorNode, level:GainNode, rate:number, marbleId:number|null, score:number, last:number[]}[]} */
const voices = [];

onReady((ctx) => {
  for (let i = 0; i < ROLL_VOICES; i++) {
    voices.push({
      ...rumbleVoice(ctx, buses.rolling, rumbleBuffer()),
      rate: 0.95 + Math.random() * 0.1, // marbles side by side don't flutter in step
      marbleId: null, score: 0, last: [0, 0, 0],
    });
  }
});

/** Schedule a change only when the value moved noticeably: this runs for
 *  every voice on every frame. */
function steer(v, i, params, value, t) {
  if (Math.abs(value - v.last[i]) <= Math.max(0.0005, Math.abs(v.last[i]) * 0.02)) return;
  v.last[i] = value;
  for (const p of params) p.setTargetAtTime(value, t, 0.05);
}

/** Free a removed marble's voice right away instead of on the next frame. */
export function releaseMarble(marbleId) {
  for (const v of voices) {
    if (v.marbleId === marbleId) {
      v.marbleId = null;
      v.score = 0;
      v.last[0] = 0;
      if (context()) v.level.gain.setTargetAtTime(0, context().currentTime, 0.03);
    }
  }
}

/**
 * @param {any[]} marbles Matter marble bodies
 * @param {(id: number) => string | null} rollingOn what each marble rolls on
 */
export function update(marbles, rollingOn) {
  const ctx = context();
  if (!ctx || voices.length === 0) return;
  const t = ctx.currentTime;

  // score every marble: only marbles moving on a track make a rumble
  const byId = new Map();
  for (const m of marbles) {
    byId.set(m.id, { m, score: rollingOn(m.id) === 'solid' ? m.speed : 0 });
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
      v.last[0] = 0;
      v.level.gain.setTargetAtTime(0, t, 0.03);
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
    steer(v, 0, [v.level.gain], e.score > 0 ? rollLevel(speed) : 0, t);
    steer(v, 1, v.lows.map(f => f.frequency), rollCutoff(speed), t);
    steer(v, 2, [v.lfo.frequency], rollFlutter(speed) * v.rate, t);
  }
}

export function activeVoices() {
  return voices.filter(v => v.marbleId !== null).length;
}
