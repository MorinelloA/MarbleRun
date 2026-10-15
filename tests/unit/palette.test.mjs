// The owner's rule: no pink, anywhere. And every colour drawn straight on
// the dark stage must stand out from it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, rootUrl, loadGame } from '../sim/matter.mjs';

const { catalog } = await loadGame();
const theme = await import(rootUrl('js/theme.js'));

// colours that read as pink here: the old palette's pinks and roses, and a
// light red that flashes pink
const DENIED = ['#f15bb5', '#ef476f', '#b5838d', '#ff6b6b'];

function files(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, exts));
    else if (exts.some(e => name.endsWith(e))) out.push(p);
  }
  return out;
}

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/** Pink: a hue between purple and red (the old #ef476f sits at 345.7°,
 *  the game's red at 355.5°), with real colour in it. */
function isPink(rgb) {
  const { h, s, l } = hsl(rgb);
  return h >= 285 && h <= 350 && s >= 0.2 && l >= 0.15 && l <= 0.95;
}

function colorsIn(text) {
  const out = [];
  for (const m of text.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g)) {
    out.push({ text: m[0], rgb: hexToRgb(m[0]) });
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
    out.push({ text: m[0], rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  return out;
}

const SOURCES = [
  path.join(ROOT, 'index.html'),
  ...files(path.join(ROOT, 'css'), ['.css']),
  ...files(path.join(ROOT, 'js'), ['.js']),
  ...files(path.join(ROOT, 'tools'), ['.js', '.html']),
];

test('no pink anywhere in the game', () => {
  const found = [];
  for (const file of SOURCES) {
    const text = readFileSync(file, 'utf8');
    for (const c of colorsIn(text)) {
      if (DENIED.includes(c.text.toLowerCase()) || isPink(c.rgb)) {
        found.push(`${path.relative(ROOT, file)}: ${c.text}`);
      }
    }
    if (file.endsWith('.css')) {
      for (const m of text.matchAll(/:\s*[^;{}]*\b(pink|hotpink|deeppink|lightpink|magenta|fuchsia|orchid|plum|violet)\b/gi)) {
        found.push(`${path.relative(ROOT, file)}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('the pink check knows pink when it sees it', () => {
  for (const hex of DENIED.slice(0, 2)) assert.ok(isPink(hexToRgb(hex)), hex);
  for (const hex of ['#e63946', '#9b5de5', '#7248BD', '#FFC845', '#2c2c31']) assert.ok(!isPink(hexToRgb(hex)), hex);
});

function luminance([r, g, b]) {
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('everything drawn on the stage stands out from it (3:1)', () => {
  const th = theme.current();
  const onStage = {
    ...Object.fromEntries(Object.entries(th.role).map(([k, v]) => [`role ${k}`, v])),
    ...Object.fromEntries(Object.entries(th.notes).map(([k, v]) => [`note ${k}`, v])),
    ...Object.fromEntries(th.marbles.map((v, i) => [`marble ${i}`, v])),
    ink: th.ink, muted: th.muted, ghostOk: th.ghostOk, ghostBad: th.ghostBad,
  };
  const weak = Object.entries(onStage)
    .map(([name, color]) => [name, color, contrast(color, th.stage)])
    .filter(([, , ratio]) => ratio < 3)
    .map(([name, color, ratio]) => `${name} ${color} ${ratio.toFixed(2)}:1`);
  assert.deepEqual(weak, []);
});

test('every catalog role has a colour', () => {
  const th = theme.current();
  for (const entry of catalog.CATALOG) {
    assert.ok(th.role[entry.role], `${entry.id}: no colour for role ${entry.role}`);
  }
});
