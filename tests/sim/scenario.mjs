// Simulates one preset headlessly and prints a JSON report on stdout.
//
//   node tests/sim/scenario.mjs <presetId> [--seconds N] [--extra N]
//        [--every S] [--seed N] [--svg FILE]
//
// One preset per process: the game's modules hold the world, the board and
// Matter's id counters as singletons, and the trace hash must not depend on
// what ran before.
//
// Hits and sensor entries are measured geometrically with Matter's Query as
// well as counted from the game's own events, so a report shows when the
// event pipeline drops something (chimes vs hardHits, launches vs
// cannonEnters, unbalanced sensor enter/exit pairs).

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadGame } from './matter.mjs';

const opts = parseArgs(process.argv.slice(2));
const { Matter, config, world, board, actions, presets } = await loadGame();
const { Query } = Matter;
const { PHYS_DT, BOARD_W, BOARD_H, MAX_MARBLES } = config;

const preset = presets.PRESETS.find(p => p.id === opts.id);
if (!preset) {
  console.error(`unknown preset: ${opts.id}`);
  process.exit(2);
}
const expect = preset.expect || {};
const seconds = opts.seconds ?? expect.seconds ?? 40;
const extra = opts.extra ?? expect.extra ?? 0;
const every = opts.every ?? expect.every ?? 1.5;
const rand = mulberry32(opts.seed ?? 1);

actions.loadPieces(preset.pieces);

// ---- piece index ----
const infos = [...board.board.pieces].map(p => {
  const solids = [], sensors = [];
  for (const b of p.bodies) {
    for (const part of (b.parts.length > 1 ? b.parts.slice(1) : [b])) {
      (part.isSensor ? sensors : solids).push(part);
    }
  }
  return {
    piece: p,
    key: `${p.entry.id}@${p.col},${p.row}${p.flip ? 'f' : ''}`,
    t: p.entry.id,
    solids, sensors,
    dyn: p.dynamicBody || null,
    stats: { hits: 0, hardHits: 0, enters: 0, chimes: 0, launches: 0, sensorEnterEv: 0, sensorExitEv: 0 },
  };
});
const byPiece = new Map(infos.map(i => [i.piece, i]));
const pieceOf = (body) => body?.plugin?.piece || body?.parent?.plugin?.piece || null;
const loops = infos.filter(i => i.t === 'loop').map(i => i.piece);
const baskets = infos.filter(i => i.t === 'basket').map(i => i.piece);
const droppers = infos.filter(i => i.t === 'dropper').map(i => i.piece);

// ---- the game's own events ----
const sensorBalance = new Map(); // "marbleId:sensorId" -> enters - exits
world.on('chime', (note, speed, piece) => {
  const info = piece && byPiece.get(piece);
  if (!info) return;
  info.stats.chimes++;
  if (info.t === 'cannon') info.stats.launches++;
});
world.on('sensorEnter', (label, body, m) => {
  const info = byPiece.get(pieceOf(body));
  if (info) info.stats.sensorEnterEv++;
  const k = `${m.id}:${body.id}`;
  sensorBalance.set(k, (sensorBalance.get(k) || 0) + 1);
});
world.on('sensorExit', (label, body, m) => {
  const info = byPiece.get(pieceOf(body));
  if (info) info.stats.sensorExitEv++;
  const k = `${m.id}:${body.id}`;
  sensorBalance.set(k, (sensorBalance.get(k) || 0) - 1);
});

// ---- marbles ----
const tracked = [];
let nan = false;

function spawn(x, y, step) {
  if (world.marbles.length >= MAX_MARBLES) {
    const oldest = tracked.find(m => m.body === world.marbles[0]);
    if (oldest) oldest.evicted = true;
  }
  const body = world.spawnMarble(x, y);
  tracked.push({
    body, i: tracked.length, spawnStep: step,
    laps: 0, loopState: new Map(),
    still: 0, maxStill: 0, everFloor: false,
    touch: new Map(), lastTouch: new Map(), inside: new Map(),
    gone: null, evicted: false, path: [],
  });
}

function insideBasket(x, y) {
  return baskets.some(p => x > p.x + 14 && x < p.x + 50 && y > p.y + 8 && y < p.y + 52);
}

function relSpeed(b, info) {
  if (!info.dyn) return b.speed;
  return Math.hypot(b.velocity.x - info.dyn.velocity.x, b.velocity.y - info.dyn.velocity.y);
}

function observe(s) {
  for (const m of tracked) {
    if (m.gone) continue;
    const b = m.body;
    if (!world.marbles.includes(b)) {
      m.gone = m.evicted ? 'evicted' : 'culled';
      continue;
    }
    const { x, y } = b.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) nan = true;

    for (const info of infos) {
      if (info.solids.length) {
        const now = Query.collides(b, info.solids).length > 0;
        const was = m.touch.get(info) || false;
        // a contact that broke for under ~50 ms is the same contact
        // flickering, not a new hit
        if (now && !was && s - (m.lastTouch.get(info) ?? -1e9) > 6) {
          info.stats.hits++;
          if (relSpeed(b, info) > 2.2) info.stats.hardHits++;
        }
        if (now) m.lastTouch.set(info, s);
        m.touch.set(info, now);
      }
      if (info.sensors.length) {
        const now = Query.collides(b, info.sensors).length > 0;
        if (now && !m.inside.get(info)) info.stats.enters++;
        m.inside.set(info, now);
      }
    }

    for (const lp of loops) {
      const dx = x - (lp.x + 64), dy = y - (lp.y + 68), d = Math.hypot(dx, dy);
      let st = m.loopState.get(lp) || 0;
      if (d < 48 && dy > 20) st = 1;
      else if (st === 1 && d < 55 && dy < -20 && dx < -10) { m.laps++; st = 0; }
      m.loopState.set(lp, st);
    }

    const onFloor = y > BOARD_H - 30;
    if (onFloor) m.everFloor = true;
    if (b.speed < 0.05 && !onFloor && !insideBasket(x, y)) {
      m.still++;
      if (m.still > m.maxStill) m.maxStill = m.still;
    } else {
      m.still = 0;
    }
    if (opts.svg && s % 6 === 0) m.path.push([Math.round(x), Math.round(y)]);
  }
}

// ---- run ----
const steps = Math.round(seconds * 1000 / PHYS_DT);
const extraAt = new Set();
for (let k = 1; k <= extra; k++) extraAt.add(Math.round(k * every * 1000 / PHYS_DT));
let dropIdx = 0;

for (const [x, y] of preset.spawn) spawn(x, y, 0);
const hash = createHash('sha1');

for (let s = 1; s <= steps; s++) {
  if (extraAt.has(s)) {
    if (droppers.length) {
      const d = droppers[dropIdx++ % droppers.length];
      spawn(d.x + 32 + (rand() * 10 - 5), d.y + 30 - rand() * 8, s);
    } else {
      spawn(BOARD_W * 0.2 + rand() * BOARD_W * 0.6, 30, s);
    }
  }
  world.step(PHYS_DT);
  observe(s);
  if (s % 120 === 0) {
    let line = '';
    for (const b of world.marbles) line += `${b.position.x.toFixed(2)},${b.position.y.toFixed(2)};`;
    for (const info of infos) if (info.dyn) line += `a${info.dyn.angle.toFixed(4)};`;
    hash.update(line + '|');
  }
}

// ---- report ----
const sec = (n) => Math.round(n * PHYS_DT / 10) / 100;
const finalState = (m) => {
  if (m.gone) return m.gone;
  const { x, y } = m.body.position;
  if (insideBasket(x, y)) return 'basket';
  if (y > BOARD_H - 30) return 'floor';
  return m.body.speed > 0.05 ? 'moving' : 'stuck';
};
const marbles = tracked.map(m => ({
  i: m.i,
  spawnS: sec(m.spawnStep),
  laps: m.laps,
  maxStallS: sec(m.maxStill),
  everFloor: m.everFloor,
  final: finalState(m),
  pos: m.gone ? null : [Math.round(m.body.position.x), Math.round(m.body.position.y)],
}));

let stuckSensorPairs = 0;
for (const [k, n] of sensorBalance) {
  if (n === 0) continue;
  const [mid, sid] = k.split(':').map(Number);
  const m = tracked.find(t => t.body.id === mid);
  if (!m || m.gone) continue;
  const info = infos.find(i => i.sensors.some(sb => sb.id === sid));
  const geomInside = info ? Query.collides(m.body, info.sensors.filter(sb => sb.id === sid)).length > 0 : false;
  if (!geomInside) stuckSensorPairs++;
}

const pieces = {};
let chimes = 0, hardHits = 0, launches = 0, cannonEnters = 0, sensorEnterEv = 0, sensorExitEv = 0;
for (const info of infos) {
  pieces[info.key] = { t: info.t, ...info.stats };
  sensorEnterEv += info.stats.sensorEnterEv;
  sensorExitEv += info.stats.sensorExitEv;
  if (info.t === 'cannon') { launches += info.stats.launches; cannonEnters += info.stats.enters; continue; }
  chimes += info.stats.chimes;
  if (['bell', 'xylo1', 'xylo2', 'xylo3', 'bumper', 'tramp'].includes(info.t)) hardHits += info.stats.hardHits;
}
const touched = infos.filter(i => i.stats.hits + i.stats.enters > 0);

const report = {
  preset: preset.id,
  seconds, extra, every,
  steps,
  marbles,
  pieces,
  reachedTypes: [...new Set(touched.map(i => i.t))].sort(),
  untouched: infos.filter(i => i.stats.hits + i.stats.enters === 0).map(i => i.key),
  totals: {
    marbles: tracked.length,
    laps: tracked.reduce((n, m) => n + m.laps, 0),
    leaked: tracked.filter(m => m.everFloor || m.gone === 'culled').length,
    culled: tracked.filter(m => m.gone === 'culled').length,
    maxStallS: Math.max(0, ...marbles.map(m => m.maxStallS)),
    chimes, hardHits, launches, cannonEnters,
    sensorEnterEv, sensorExitEv, stuckSensorPairs,
    nan,
  },
  traceHash: hash.digest('hex'),
};

if (opts.svg) writeSvg(opts.svg);
process.stdout.write(JSON.stringify(report));

// ---- helpers ----
function writeSvg(file) {
  const colors = ['#e63946', '#f4a300', '#2a9d8f', '#4361ee', '#9b5de5', '#00b4d8', '#80b918', '#2d4a75'];
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_W} ${BOARD_H}" width="${BOARD_W}" height="${BOARD_H}">`;
  out += `<rect width="${BOARD_W}" height="${BOARD_H}" fill="#f4f4f0"/>`;
  for (const info of infos) {
    for (const part of [...info.solids, ...info.sensors]) {
      const pts = part.vertices.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
      out += `<polygon points="${pts}" fill="${part.isSensor ? 'none' : '#9a9a9a'}" stroke="${part.isSensor ? '#2a9d8f' : '#555'}" stroke-width="1"${part.isSensor ? ' stroke-dasharray="3 3"' : ''}/>`;
    }
    out += `<text x="${info.piece.x + 3}" y="${info.piece.y + 11}" font-size="9" fill="#333">${info.key}</text>`;
  }
  tracked.forEach((m, i) => {
    if (m.path.length < 2) return;
    out += `<polyline points="${m.path.map(p => p.join(',')).join(' ')}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="1.2" opacity="0.7"/>`;
  });
  out += '</svg>';
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, out);
}

function parseArgs(argv) {
  const o = { id: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seconds') o.seconds = Number(argv[++i]);
    else if (a === '--extra') o.extra = Number(argv[++i]);
    else if (a === '--every') o.every = Number(argv[++i]);
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--svg') o.svg = argv[++i];
    else if (!o.id) o.id = a;
  }
  return o;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
