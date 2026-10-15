// @ts-check
// What the sounds are made of: a knock for each material a marble can
// strike, the rumble of a rolling marble and how it follows the marble's
// speed, the funnel's swirl, and the bells' and bars' note. The game plays
// them through its buses; tools/sound-sheet.html plays and measures them
// through its own copy of the mix. The numbers are DOM-free so the tests can
// check them, and the builders only touch an audio context when called.

import { MARBLE_R, HIT_MIN_SPEED } from '../config.js';

/** The lowest note (C5): rumbles and knocks stay under it, so the music
 *  pieces have their notes to themselves. */
export const LOWEST_NOTE_HZ = 523.25;

// ---- knocks ----

/**
 * A knock for each material: damped partials [Hz, level, decay time
 * constant in s], the click where marble meets surface, and how loud it is
 * against the others. The fundamentals sit under the lowest note, tuned
 * into the bars' scale (they ring long enough to be heard as a pitch); the
 * upper partials are gone within ~10 ms, so a knock reads as a "tok".
 */
export const KNOCKS = {
  // track pieces: a warm wooden tok, on G4
  track: { partials: [[392, 1, 0.020], [941, 0.45, 0.008], [1607, 0.2, 0.004]], click: 0.25, level: 1 },
  // blocks, pegs and tubes, and the side walls: deeper, on D4
  wood: { partials: [[294, 1, 0.026], [823, 0.4, 0.010], [1470, 0.15, 0.005]], click: 0.2, level: 1 },
  // the floor: a soft thud on G3, with G4 above it for an iPad's speakers
  floor: { partials: [[196, 1, 0.030], [392, 0.55, 0.014]], click: 0.15, level: 1 },
  // marble on marble: a small glassy tick
  marble: { partials: [[2350, 1, 0.012], [3700, 0.5, 0.007], [5600, 0.25, 0.004]], click: 0.1, level: 0.35 },
};

/** A full-strength knock's gain, before the impact bus. */
export const KNOCK_MAX = 0.19;
/** Knocks quieter than this aren't worth a voice. */
export const KNOCK_MIN_GAIN = 0.01;
/** Speed into a surface, px per physics step (see HIT_MIN_SPEED), that
 *  gives a full-strength knock. */
export const KNOCK_FULL_SPEED = 8;

/** What a marble knocked against: 'marble', 'floor', 'wood' (blocks, pegs,
 *  tubes and the side walls) or 'track' (every other piece). */
export function materialOf(body) {
  if (body.label === 'marble') return 'marble';
  if (body.label === 'floor') return 'floor';
  if (body.label === 'wall') return 'wood';
  const piece = body.plugin?.piece || body.parent?.plugin?.piece;
  return piece?.entry.role === 'structure' ? 'wood' : 'track';
}

/** How hard a knock is (0..1) from the marble's speed into the surface:
 *  nothing at HIT_MIN_SPEED, full at KNOCK_FULL_SPEED. */
export function knockStrength(into) {
  const s = (into - HIT_MIN_SPEED) / (KNOCK_FULL_SPEED - HIT_MIN_SPEED);
  return Math.max(0, Math.min(1, s));
}

/** A knock's gain at strength s. */
export function knockGain(s, level = 1) {
  return KNOCK_MAX * level * s;
}

/** Seconds until a knock's slowest partial is ~70 dB down. */
function knockSeconds(recipe) {
  return Math.max(...recipe.partials.map(([, , tau]) => tau)) * 8;
}

/**
 * Render a knock: its partials, and a ~1.5 ms burst of softened noise for
 * the click of contact. Peak-normalised to 1.
 * @returns {Float32Array}
 */
export function renderKnock(sampleRate, recipe, random = Math.random) {
  const d = new Float32Array(Math.ceil(knockSeconds(recipe) * sampleRate));
  for (const [hz, level, tau] of recipe.partials) {
    const w = (2 * Math.PI * hz) / sampleRate;
    const fall = Math.exp(-1 / (tau * sampleRate));
    let env = level;
    for (let i = 0; i < d.length; i++) {
      d[i] += env * Math.sin(w * i);
      env *= fall;
    }
  }
  const clickLen = Math.round(0.0015 * sampleRate);
  let y = 0;
  for (let i = 0; i < clickLen; i++) {
    y = y * 0.6 + (random() * 2 - 1) * 0.4;
    d[i] += recipe.click * y * Math.sin((Math.PI * i) / clickLen);
  }
  let peak = 0;
  for (const v of d) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < d.length; i++) d[i] /= peak;
  return d;
}

/** One knock voice: lowpass -> gain -> out. @param {BaseAudioContext} ctx */
export function knockChain(ctx, out) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  filter.connect(gain).connect(out);
  return { filter, gain };
}

/**
 * Play a rendered knock through a chain at strength s (0..1) at time t:
 * lighter knocks are quieter and duller, and no two are quite alike.
 * @param {BaseAudioContext} ctx
 * @returns {number} how long it sounds, in s
 */
export function playKnock(ctx, chain, buffer, level, s, t, random = Math.random) {
  chain.filter.frequency.setValueAtTime(1500 + 5500 * s, t);
  chain.gain.gain.setValueAtTime(knockGain(s, level), t);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 2 ** ((random() - 0.5) * 0.085); // within ±3%, near the key
  src.connect(chain.filter);
  src.start(t);
  return buffer.duration / src.playbackRate.value;
}

// ---- rolling ----

/** A rolling voice's gain at full speed, before the rolling bus. */
export const ROLL_MAX = 0.14;
/** Speeds where the rumble starts, and where it's loudest (body.speed, px
 *  per 16.7 ms, as for all the rolling curves). */
const ROLL_MIN_SPEED = 0.5;
const ROLL_FULL_SPEED = 14;
/** The rumble's band: from here up to rollCutoff(). */
const ROLL_LOW_HZ = 200;
/** The rumble's top, kept a little under the lowest note. */
export const ROLL_TOP_HZ = 440;
/** How deep the flutter is: the level swings between 1 - this and 1. */
const FLUTTER_DEPTH = 0.3;
/** Filter Q for the band's edges: Web Audio reads a lowpass's or highpass's
 *  Q in dB, and -3 dB is flat (no resonant peak to hum). */
const FLAT_Q = -3;

/** How loud a marble rolling at `speed` is: silent at rest, then growing
 *  with its speed, quickest at first, so slow marbles are faintly heard
 *  and fast ones never roar. */
export function rollLevel(speed) {
  const s = (speed - ROLL_MIN_SPEED) / (ROLL_FULL_SPEED - ROLL_MIN_SPEED);
  return ROLL_MAX * Math.max(0, Math.min(1, s)) ** 0.7;
}

/** The rumble's top frequency: brighter as the marble speeds up, never up
 *  among the notes. */
export function rollCutoff(speed) {
  return Math.min(240 + 18 * speed, ROLL_TOP_HZ);
}

/** How many times a second the marble turns over (speed·60 px a second, a
 *  turn every 2π·r px): the rumble flutters at this rate, within 1–15 Hz. */
export function rollFlutter(speed) {
  return Math.max(1, Math.min(15, (speed * 60) / (2 * Math.PI * MARBLE_R)));
}

/**
 * The rumble's raw material: softened noise, 2 s long, whose end runs on
 * seamlessly into its start, so a looping voice never ticks. Unit RMS.
 * @returns {Float32Array}
 */
export function rumbleLoop(sampleRate, random = Math.random) {
  const len = Math.round(2 * sampleRate);
  const fade = Math.round(0.05 * sampleRate);
  const raw = new Float32Array(len + fade);
  let y = 0;
  for (let i = 0; i < raw.length; i++) {
    y = y * 0.85 + (random() * 2 - 1) * 0.15;
    raw[i] = y;
  }
  // the extra tail crossfades into the start: the loop's last sample is
  // followed by raw[len], just as it was when the noise was made
  const d = raw.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const a = ((i / fade) * Math.PI) / 2;
    d[i] = raw[len + i] * Math.cos(a) + raw[i] * Math.sin(a);
  }
  let sum = 0;
  for (const v of d) sum += v * v;
  const k = 1 / Math.sqrt(sum / len);
  for (let i = 0; i < len; i++) d[i] *= k;
  return d;
}

/** @param {BaseAudioContext} ctx @param {BiquadFilterType} type */
function biquad(ctx, type, hz, q) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

/**
 * A rumble voice: the loop (from a random point, so voices never sum in
 * step) through a band under the notes, then a flutter at the rate the
 * marble turns over. It starts silent; set `level`, the `lows`' frequency
 * and the `lfo`'s frequency to play it. (Only one lowpass moves; a second
 * stays at the band's top, which also keeps the notes clear.)
 * @param {BaseAudioContext} ctx @param {AudioNode} out @param {AudioBuffer} loop
 */
export function rumbleVoice(ctx, out, loop) {
  const src = ctx.createBufferSource();
  src.buffer = loop;
  src.loop = true;
  const lows = [biquad(ctx, 'lowpass', ROLL_TOP_HZ, FLAT_Q)];
  const band = [
    biquad(ctx, 'highpass', ROLL_LOW_HZ, FLAT_Q), biquad(ctx, 'highpass', ROLL_LOW_HZ, FLAT_Q),
    ...lows, biquad(ctx, 'lowpass', ROLL_TOP_HZ, FLAT_Q),
  ];
  const flutter = ctx.createGain();
  flutter.gain.value = 1 - FLUTTER_DEPTH / 2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1;
  const depth = ctx.createGain();
  depth.gain.value = FLUTTER_DEPTH / 2;
  lfo.connect(depth).connect(flutter.gain);
  const level = ctx.createGain();
  level.gain.value = 0;
  /** @type {AudioNode} */
  let node = src;
  for (const f of band) node = node.connect(f);
  node.connect(flutter).connect(level).connect(out);
  src.start(0, Math.random() * loop.duration);
  lfo.start();
  return { lows, lfo, level };
}

/** @param {BaseAudioContext} ctx @param {Float32Array} data */
export function toBuffer(ctx, data) {
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
}

// ---- the funnel ----

/** The swirl's gain, before the rolling bus, and how long it spins up. */
export const SWIRL_LEVEL = 0.12;
const SWIRL_SECONDS = 0.3;

/**
 * A marble dropped into a funnel: a short whirr that spins up faster and
 * brighter, like a coin circling down a wishing well. A marble passes the
 * funnel's throat in a tenth of a second or two, so the whirr plays out
 * whole by itself.
 */
export function swirl(voice, t) {
  const level = voice.level.gain;
  level.cancelScheduledValues(t);
  level.setTargetAtTime(SWIRL_LEVEL, t, 0.02);
  level.setTargetAtTime(0, t + SWIRL_SECONDS, 0.08);
  voice.lfo.frequency.cancelScheduledValues(t);
  voice.lfo.frequency.setValueAtTime(6, t);
  voice.lfo.frequency.exponentialRampToValueAtTime(16, t + SWIRL_SECONDS);
  for (const f of voice.lows) {
    f.frequency.cancelScheduledValues(t);
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(440, t + SWIRL_SECONDS);
  }
}

// ---- notes ----

/**
 * A bell's or bar's note: FM with an inharmonic modulator (×1.41, bell-like)
 * whose brightness dies away over 0.4 s. `vol` 0..1, `decay` in s.
 * @param {BaseAudioContext} ctx
 * @returns {OscillatorNode} the carrier (its `onended` marks the note done)
 */
export function fmNote(ctx, out, t, freq, vol, decay) {
  const carrier = ctx.createOscillator();
  carrier.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.frequency.value = freq * 1.41;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(90, t);
  modGain.gain.exponentialRampToValueAtTime(1, t + 0.4);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol * 0.5, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, t + decay);
  mod.connect(modGain).connect(carrier.frequency);
  carrier.connect(env).connect(out);
  mod.start(t);
  carrier.start(t);
  mod.stop(t + decay + 0.05);
  carrier.stop(t + decay + 0.05);
  return carrier;
}
