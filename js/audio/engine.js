// @ts-check
// AudioContext lifecycle + master bus chain. Everything audible routes
// through buses -> masterGain -> compressor -> destination, so many
// simultaneous marbles can never clip.

let ctx = null;
let master = null;
let muted = false;

export const buses = { rolling: null, impact: null, chime: null, ui: null };
const readyCallbacks = [];

export function isReady() { return !!ctx; }
export function context() { return ctx; }

/** Register work to run once the AudioContext exists (voice pool setup). */
export function onReady(fn) {
  if (ctx) fn(ctx);
  else readyCallbacks.push(fn);
}

/** Call from the first user gesture (iOS requirement). Safe to call repeatedly. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(comp);

    for (const [name, gain] of [['rolling', 0.7], ['impact', 0.9], ['chime', 0.8], ['ui', 0.5]]) {
      const bus = ctx.createGain();
      bus.gain.value = gain;
      bus.connect(master);
      buses[name] = bus;
    }

    for (const fn of readyCallbacks) fn(ctx);
    readyCallbacks.length = 0;
  }
  if (ctx.state === 'suspended') ctx.resume();
  // one silent tick fully unlocks output on iOS
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  src.connect(ctx.destination);
  src.start(0);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}
export function isMuted() { return muted; }

/** Duck everything (portrait overlay / hidden tab). */
export function suspendOutput() {
  if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
}
export function resumeOutput() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (master && !muted) master.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resumeOutput();
});

/** Shared noise buffer (2s, softened white noise) used by rolling + impacts. */
let noiseBuffer = null;
export function getNoiseBuffer() {
  if (!noiseBuffer) {
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // one-pole lowpassed white noise ≈ brown-ish rumble source
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      d[i] = last * 6; // make up for lowpass level loss
    }
  }
  return noiseBuffer;
}
