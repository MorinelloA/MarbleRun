// The sound recipes keep their promises: knocks are short tones, not static;
// knocks and the rolling rumble stay under the notes; loudness follows speed
// up to a cap; the rumble's loop has no seam to tick at; and every piece
// knocks with a material the game has a sound for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, rootUrl } from '../sim/matter.mjs';

const { catalog, config } = await loadGame();
const { Piece } = await import(rootUrl('js/pieces/piece.js'));
const recipes = await import(rootUrl('js/audio/recipes.js'));
const { spectrum, flatness, shareAbove } = await import(rootUrl('tools/audio-measure.js'));

const SR = 48000;

/** A seeded random source, so any failure reproduces. */
function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('every knock is a short tone that dies away, not a burst of static', () => {
  const random = seeded(7);
  const white = Float32Array.from({ length: 8192 }, () => random() * 2 - 1);
  const noise = flatness(spectrum(white, SR, { window: false }));
  assert.ok(noise > 0.4, `(the measure tells static apart: white noise scores ${noise})`);

  for (const [name, recipe] of Object.entries(recipes.KNOCKS)) {
    const d = recipes.renderKnock(SR, recipe, seeded(3));
    let peak = 0, sum = 0;
    for (const v of d) {
      assert.ok(Number.isFinite(v), `${name}: not a number`);
      peak = Math.max(peak, Math.abs(v));
      sum += v;
    }
    assert.ok(Math.abs(peak - 1) < 1e-6, `${name}: peak ${peak}`);
    assert.ok(Math.abs(sum / d.length) < 0.01, `${name}: offset ${sum / d.length}`);
    assert.ok(d.length / SR <= 0.25, `${name}: ${d.length / SR} s long`);
    let tail = 0;
    for (const v of d.subarray(Math.floor(d.length * 0.99))) tail = Math.max(tail, Math.abs(v));
    assert.ok(tail < 10 ** (-50 / 20), `${name}: still sounding at its end (${tail})`);
    const f = flatness(spectrum(d, SR, { window: false }));
    assert.ok(f < 0.05, `${name}: flatness ${f}`);
  }
});

test('knocks on pieces, and the rolling rumble at any speed, stay under the notes', () => {
  for (const name of ['track', 'wood', 'floor']) {
    const recipe = recipes.KNOCKS[name];
    assert.ok(recipe.partials[0][0] < recipes.LOWEST_NOTE_HZ, `${name}: its pitch`);
    const d = recipes.renderKnock(SR, recipe, seeded(3));
    const above = shareAbove(spectrum(d, SR, { window: false }), recipes.LOWEST_NOTE_HZ);
    assert.ok(above < 0.15, `${name}: ${Math.round(above * 100)}% of it among the notes`);
  }
  for (let speed = 0; speed <= config.SPEED_CLAMP; speed += 0.5) {
    assert.ok(recipes.rollCutoff(speed) < recipes.LOWEST_NOTE_HZ, `the rumble's top at speed ${speed}`);
  }
});

test('loudness grows with speed, from silence up to a cap', () => {
  assert.equal(recipes.rollLevel(0), 0);
  assert.equal(recipes.rollLevel(0.4), 0, 'a marble barely moving is silent');
  let last = 0;
  for (let speed = 0; speed <= config.SPEED_CLAMP; speed += 0.25) {
    const level = recipes.rollLevel(speed);
    assert.ok(level >= last && level <= recipes.ROLL_MAX, `rolling at ${speed}: ${level}`);
    last = level;
  }
  assert.equal(recipes.knockStrength(config.HIT_MIN_SPEED), 0, 'a graze is silent');
  assert.equal(recipes.knockStrength(recipes.KNOCK_FULL_SPEED), 1);
  last = 0;
  for (let into = 0; into <= 20; into += 0.25) {
    const s = recipes.knockStrength(into);
    assert.ok(s >= last && s <= 1, `a knock at ${into}: ${s}`);
    last = s;
  }
});

test("the rumble's loop has no seam to tick at", () => {
  const d = recipes.rumbleLoop(SR, seeded(5));
  let steps = 0, sum = 0;
  for (let i = 1; i < d.length; i++) steps += (d[i] - d[i - 1]) ** 2;
  for (const v of d) sum += v * v;
  const typical = Math.sqrt(steps / (d.length - 1));
  const seam = Math.abs(d[0] - d[d.length - 1]);
  assert.ok(seam < 4 * typical, `the loop jumps ${seam} where a step is typically ${typical}`);
  assert.ok(Math.abs(Math.sqrt(sum / d.length) - 1) < 1e-3, 'unit RMS');
});

test('every piece knocks with a known material: blocks and pegs like wood', () => {
  const materials = (id) => {
    const bodies = new Piece(catalog.BY_ID[id], 0, 0).buildBodies()
      .flatMap(b => (b.parts.length > 1 ? b.parts.slice(1) : [b]))
      .filter(b => !b.isSensor);
    return [...new Set(bodies.map(b => recipes.materialOf(b)))];
  };
  for (const entry of catalog.CATALOG) {
    for (const m of materials(entry.id)) assert.ok(m in recipes.KNOCKS, `${entry.id}: ${m}`);
  }
  for (const id of ['block', 'half', 'peg', 'tube']) assert.deepEqual(materials(id), ['wood'], id);
  for (const id of ['straight', 'ramp', 'steep', 'curve', 'loop', 'goal']) assert.deepEqual(materials(id), ['track'], id);
  assert.equal(recipes.materialOf({ label: 'floor' }), 'floor');
  assert.equal(recipes.materialOf({ label: 'wall' }), 'wood');
  assert.equal(recipes.materialOf({ label: 'marble' }), 'marble');
});
