// @ts-check
// Plays and measures the game's sound effects (see sound-sheet.html).

import { mixer } from '../js/audio/engine.js';
import {
  KNOCKS, renderKnock, knockChain, playKnock, knockStrength, rumbleLoop, rumbleVoice,
  rollLevel, rollCutoff, rollFlutter, swirl, fmNote, toBuffer, LOWEST_NOTE_HZ,
} from '../js/audio/recipes.js';
import { NOTES } from '../js/music.js';
import { spectrum, levels, shareAbove, centroid, flatness } from './audio-measure.js';

const SR = 48000;
const NOTE_SPEED = 3.5;                          // a marble rolling along Melody Lane's bars
const NOTE_VOL = Math.min(0.35 + NOTE_SPEED / 12, 1); // as chimes.pieceSound sets it
const KNOCK_SPEEDS = { soft: 2, medium: 4, hard: 8 };
const ROLL_SPEEDS = { slow: 3, medium: 8, fast: 14 };

// ---- scenes: each schedules sounds on a context's buses from time t ----

const cache = new WeakMap(); // context -> its knock and rumble buffers
function buffersFor(ctx) {
  if (!cache.has(ctx)) {
    const knocks = {};
    for (const [name, recipe] of Object.entries(KNOCKS)) {
      knocks[name] = toBuffer(ctx, renderKnock(ctx.sampleRate, recipe));
    }
    cache.set(ctx, { knocks, rumble: toBuffer(ctx, rumbleLoop(ctx.sampleRate)) });
  }
  return cache.get(ctx);
}

const scenes = {
  knock: (material, into) => (ctx, buses, t) => {
    const chain = knockChain(ctx, buses.impact);
    playKnock(ctx, chain, buffersFor(ctx).knocks[material], KNOCKS[material].level, knockStrength(into), t);
  },
  roll: (speed, seconds = 2) => (ctx, buses, t) => {
    const v = rumbleVoice(ctx, buses.rolling, buffersFor(ctx).rumble);
    for (const f of v.lows) f.frequency.setValueAtTime(rollCutoff(speed), t);
    v.lfo.frequency.setValueAtTime(rollFlutter(speed), t);
    v.level.gain.setValueAtTime(0, t);
    v.level.gain.setTargetAtTime(rollLevel(speed), t, 0.05);
    v.level.gain.setTargetAtTime(0, t + seconds, 0.05);
  },
  funnel: () => (ctx, buses, t) => {
    swirl(rumbleVoice(ctx, buses.rolling, buffersFor(ctx).rumble), t);
  },
  note: (hz = NOTES[2].hz) => (ctx, buses, t) => {
    fmNote(ctx, buses.chime, t, hz, NOTE_VOL, 1.2);
  },
  // Melody Lane's run: its six notes, a marble rolling under them
  melody: (withRolling) => (ctx, buses, t) => {
    if (withRolling) scenes.roll(ROLL_SPEEDS.medium, 2.2)(ctx, buses, t);
    NOTES.forEach((n, i) => scenes.note(n.hz)(ctx, buses, t + 0.25 + i * 0.3));
  },
};

// ---- listening ----

let live = null;
function play(scene) {
  if (!live) {
    const ctx = new AudioContext();
    live = { ctx, ...mixer(ctx) };
  }
  live.ctx.resume();
  scene(live.ctx, live.buses, live.ctx.currentTime + 0.05);
}

function button(parent, label, scene) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => play(scene));
  document.getElementById(parent).appendChild(b);
}

for (const material of Object.keys(KNOCKS)) {
  for (const [how, into] of Object.entries(KNOCK_SPEEDS)) button('knocks', `${material}, ${how}`, scenes.knock(material, into));
}
for (const [how, speed] of Object.entries(ROLL_SPEEDS)) button('rolling', `${how} (speed ${speed})`, scenes.roll(speed));
button('other', 'Funnel', scenes.funnel());
button('other', 'A note', scenes.note());
button('other', 'Melody, rolling under it', scenes.melody(true));
button('other', 'Melody alone', scenes.melody(false));

// ---- measuring ----

const T0 = 0.05;
async function render(scene, seconds = 1.2) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const { buses } = mixer(ctx);
  scene(ctx, buses, T0);
  return (await ctx.startRendering()).getChannelData(0);
}
const at = (s) => Math.round(s * SR);
const round = (v, digits = 1) => Number(v.toFixed(digits));

async function measure() {
  const out = { note: {}, rolling: {}, knocks: {}, funnel: {} };
  const note = await render(scenes.note());
  const noteLv = levels(note, at(T0), at(T0 + 0.3));
  out.note = { peakDb: round(noteLv.peakDb), rmsDb: round(noteLv.rmsDb) };

  for (const [how, speed] of Object.entries(ROLL_SPEEDS)) {
    const x = await render(scenes.roll(speed, 1.5), 1.6);
    const lv = levels(x, at(0.6), at(1.4));
    const sp = spectrum(x, SR, { start: at(0.6) });
    out.rolling[how] = {
      speed, rmsDb: round(lv.rmsDb), underNoteDb: round(noteLv.rmsDb - lv.rmsDb),
      aboveLowestNote: round(shareAbove(sp, LOWEST_NOTE_HZ) * 100, 0), centroidHz: Math.round(centroid(sp)),
    };
  }

  for (const material of Object.keys(KNOCKS)) {
    out.knocks[material] = {};
    for (const [how, into] of Object.entries(KNOCK_SPEEDS)) {
      const x = await render(scenes.knock(material, into), 0.5);
      const lv = levels(x, at(T0), at(T0 + 0.3));
      const sp = spectrum(x, SR, { start: at(T0), window: false });
      out.knocks[material][how] = {
        into, peakDb: round(lv.peakDb), underNotePeakDb: round(noteLv.peakDb - lv.peakDb),
        flatness: round(flatness(sp), 3), aboveLowestNote: round(shareAbove(sp, LOWEST_NOTE_HZ) * 100, 0),
      };
    }
  }

  const funnel = await render(scenes.funnel(), 0.8);
  const fLv = levels(funnel, at(T0 + 0.05), at(T0 + 0.35));
  const fSp = spectrum(funnel, SR, { start: at(T0), n: 16384 });
  out.funnel = { rmsDb: round(fLv.rmsDb), underNoteDb: round(noteLv.rmsDb - fLv.rmsDb), aboveLowestNote: round(shareAbove(fSp, LOWEST_NOTE_HZ) * 100, 0) };

  // the targets the effects keep against the note
  const r = out.rolling.medium, k = out.knocks.track;
  out.checks = [
    ['Rolling at speed 8 is heard, 15–20 dB under the note', r.underNoteDb >= 15 && r.underNoteDb <= 20, `${r.underNoteDb} dB`],
    ['Even fast rolling (a steep drop) is at least 12 dB under', out.rolling.fast.underNoteDb >= 12, `${out.rolling.fast.underNoteDb} dB`],
    ['…with under 10% of it up among the notes', r.aboveLowestNote < 10, `${r.aboveLowestNote}%`],
    ['A medium knock is about 10 dB under the note (8–12)', k.medium.underNotePeakDb >= 8 && k.medium.underNotePeakDb <= 12, `${k.medium.underNotePeakDb} dB`],
    ['The hardest knock stays at least 3 dB under the note', Object.values(out.knocks).every(m => m.hard.underNotePeakDb >= 3), `${Math.min(...Object.values(out.knocks).map(m => m.hard.underNotePeakDb))} dB`],
    ['Knocks are tones, not static (flatness ≤ 0.05)', Object.values(out.knocks).every(m => Object.values(m).every(h => h.flatness <= 0.05)), `${Math.max(...Object.values(out.knocks).flatMap(m => Object.values(m).map(h => h.flatness)))}`],
    ['The funnel is heard, but 12–18 dB under the note', out.funnel.underNoteDb >= 12 && out.funnel.underNoteDb <= 18 && out.funnel.aboveLowestNote < 10, `${out.funnel.underNoteDb} dB, ${out.funnel.aboveLowestNote}%`],
  ];
  return out;
}

function show(out) {
  const table = document.getElementById('measured');
  table.textContent = '';
  const row = (cells, head = false) => {
    const tr = document.createElement('tr');
    for (const c of cells) {
      const td = document.createElement(head ? 'th' : 'td');
      if (c instanceof Node) td.appendChild(c); else td.textContent = String(c);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  };
  row(['Check', 'Result', 'Measured'], true);
  for (const [what, ok, value] of out.checks) {
    const mark = document.createElement('span');
    mark.className = ok ? 'pass' : 'fail';
    mark.textContent = ok ? 'pass' : 'FAIL';
    row([what, mark, value]);
  }
  row(['', '', ''], false);
  row(['Sound', 'Level', 'Detail'], true);
  row([`Note (E5, speed ${NOTE_SPEED})`, `peak ${out.note.peakDb} dB`, `RMS ${out.note.rmsDb} dB over 300 ms`]);
  for (const [how, v] of Object.entries(out.rolling)) {
    row([`Rolling, ${how} (speed ${v.speed})`, `${v.underNoteDb} dB under`, `${v.aboveLowestNote}% above C5, centred at ${v.centroidHz} Hz`]);
  }
  for (const [material, hows] of Object.entries(out.knocks)) {
    for (const [how, v] of Object.entries(hows)) {
      row([`Knock, ${material}, ${how} (${v.into})`, `${v.underNotePeakDb} dB under`, `flatness ${v.flatness}, ${v.aboveLowestNote}% above C5`]);
    }
  }
  row(['Funnel', `${out.funnel.underNoteDb} dB under`, `${out.funnel.aboveLowestNote}% above C5`]);
}

measure().then((out) => {
  show(out);
  window.__soundSheet = out;
});
