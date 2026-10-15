// Runs preset scenarios in parallel child processes and summarizes them.
//
//   node tests/sim/run.mjs [--only a,b] [--seconds N] [--extra N]
//        [--baseline] [--check] [--check-hash] [--write-golden] [--trace-svg]
//
// --baseline      write tests/baseline/<id>.json, a record of today's behaviour
// --check         evaluate each preset's `expect` block; exit 1 on a failure
// --check-hash    rerun each preset with its golden settings and compare the
//                 trace hash with tests/golden/<id>.json; exit 1 on drift
// --write-golden  record the current runs as the golden ones
// --trace-svg     draw each run's marble paths to tests/out/<id>.svg

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, rootUrl } from './matter.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const { PRESETS } = await import(rootUrl('js/presets.js'));
const only = val('--only')?.split(',');
const list = PRESETS.filter(p => !only || only.includes(p.id));
const scenario = path.join(ROOT, 'tests', 'sim', 'scenario.mjs');
const goldenDir = path.join(ROOT, 'tests', 'golden');
const baselineDir = path.join(ROOT, 'tests', 'baseline');

const readGolden = (id) => {
  const f = path.join(goldenDir, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};

function runOne(preset) {
  const a = [scenario, preset.id];
  const golden = flag('--check-hash') ? readGolden(preset.id) : null;
  if (golden) {
    a.push('--seconds', golden.seconds, '--extra', golden.extra, '--every', golden.every);
  } else {
    if (val('--seconds')) a.push('--seconds', val('--seconds'));
    if (val('--extra')) a.push('--extra', val('--extra'));
  }
  if (flag('--trace-svg')) a.push('--svg', path.join(ROOT, 'tests', 'out', `${preset.id}.svg`));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, a.map(String), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', (code) => {
      if (code !== 0) return resolve({ preset: preset.id, error: err.trim() || `exit ${code}` });
      try { resolve(JSON.parse(out)); } catch (e) { resolve({ preset: preset.id, error: `bad JSON: ${e.message}` }); }
    });
  });
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

/** Failures of a run against its preset's `expect` block (empty = pass). */
export function checkExpect(preset, r) {
  const e = preset.expect;
  if (!e) return [];
  const t = r.totals;
  const fails = [];
  for (const type of e.reach || []) {
    if (!r.reachedTypes.includes(type)) fails.push(`never reaches ${type}`);
  }
  if (e.reachAll) {
    const ignore = new Set(e.ignore || []);
    const miss = r.untouched.filter(k => !ignore.has(k) && !ignore.has(k.split('@')[0]));
    if (miss.length) fails.push(`untouched: ${miss.join(', ')}`);
  }
  if (e.minLaps != null && t.laps < e.minLaps) fails.push(`laps ${t.laps} < ${e.minLaps}`);
  if (e.lapsEach != null) {
    const short = r.marbles.slice(0, preset.spawn.length).filter(m => m.laps < e.lapsEach);
    if (short.length) fails.push(`marble ${short.map(m => m.i).join(', ')} lapped < ${e.lapsEach}`);
  }
  if (e.noLeaks && t.leaked > 0) fails.push(`${t.leaked} leaked`);
  if (e.maxLeaks != null && t.leaked > e.maxLeaks) fails.push(`${t.leaked} leaked > ${e.maxLeaks}`);
  if (e.maxStallS != null && t.maxStallS > e.maxStallS) fails.push(`stalled ${t.maxStallS}s > ${e.maxStallS}s`);
  if (e.minInBasket != null) {
    const n = r.marbles.filter(m => m.final === 'basket').length;
    if (n < e.minInBasket) fails.push(`${n} in a basket < ${e.minInBasket}`);
  }
  if (t.cannonEnters && t.launches < t.cannonEnters) fails.push(`cannons fired ${t.launches}/${t.cannonEnters}`);
  if (t.stuckSensorPairs) fails.push(`${t.stuckSensorPairs} sensor exit(s) lost`);
  if (t.nan) fails.push('NaN positions');
  return fails;
}

const results = await pool(list, Math.max(1, os.cpus().length - 1), runOne);

const pad = (s, n) => String(s).padEnd(n);
const rows = [];
let failed = false;
console.log(pad('preset', 15) + pad('sec', 5) + pad('marb', 6) + pad('laps', 6) + pad('leak', 6) +
  pad('cull', 6) + pad('stall', 7) + pad('chime/hit', 11) + pad('fire/enter', 12) + pad('lostExit', 10) +
  pad('untouched', 11) + 'hash');
for (let i = 0; i < list.length; i++) {
  const p = list[i], r = results[i];
  if (r.error) {
    failed = true;
    console.log(`${pad(p.id, 15)}ERROR ${r.error}`);
    continue;
  }
  const t = r.totals;
  console.log(pad(p.id, 15) + pad(r.seconds, 5) + pad(t.marbles, 6) + pad(t.laps, 6) + pad(t.leaked, 6) +
    pad(t.culled, 6) + pad(t.maxStallS, 7) + pad(`${t.chimes}/${t.hardHits}`, 11) +
    pad(`${t.launches}/${t.cannonEnters}`, 12) + pad(t.stuckSensorPairs, 10) +
    pad(r.untouched.length, 11) + r.traceHash.slice(0, 10));
  rows.push([p, r]);
}

if (flag('--check')) {
  for (const [p, r] of rows) {
    const fails = checkExpect(p, r);
    if (!p.expect) console.log(`  ${p.id}: no expect block`);
    else if (fails.length) { failed = true; console.log(`  FAIL ${p.id}: ${fails.join('; ')}`); }
    else console.log(`  ok   ${p.id}`);
  }
}

if (flag('--check-hash')) {
  for (const [p, r] of rows) {
    const g = readGolden(p.id);
    if (!g) { failed = true; console.log(`  FAIL ${p.id}: no golden file`); }
    else if (g.traceHash !== r.traceHash) { failed = true; console.log(`  FAIL ${p.id}: trace drifted (${g.traceHash.slice(0, 10)} -> ${r.traceHash.slice(0, 10)})`); }
    else console.log(`  same ${p.id}`);
  }
}

if (flag('--write-golden')) {
  mkdirSync(goldenDir, { recursive: true });
  for (const [p, r] of rows) {
    const g = { id: p.id, seconds: r.seconds, extra: r.extra, every: r.every, traceHash: r.traceHash, totals: r.totals };
    writeFileSync(path.join(goldenDir, `${p.id}.json`), JSON.stringify(g, null, 2) + '\n');
  }
  console.log(`  wrote ${rows.length} golden file(s)`);
}

if (flag('--baseline')) {
  mkdirSync(baselineDir, { recursive: true });
  for (const [p, r] of rows) writeFileSync(path.join(baselineDir, `${p.id}.json`), JSON.stringify(r, null, 2) + '\n');
  console.log(`  wrote ${rows.length} baseline file(s)`);
}

process.exit(failed ? 1 : 0);
