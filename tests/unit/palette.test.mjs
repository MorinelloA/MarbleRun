// Every colour drawn straight on the dark stage must stand out from it,
// and a struck piece flashes the right way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rootUrl, loadGame } from '../sim/matter.mjs';

const { catalog } = await loadGame();
const theme = await import(rootUrl('js/theme.js'));

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

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

test('a struck red flashes to gold, anything else to ink', () => {
  const th = theme.current();
  assert.equal(theme.flash(th.role.bounce, 1).toLowerCase(), th.role.track.toLowerCase(), 'reds flash to gold');
  assert.equal(theme.flash(th.role.basket, 1).toLowerCase(), th.ink.toLowerCase(), 'others flash to ink');
});

test('every catalog role has a colour', () => {
  const th = theme.current();
  for (const entry of catalog.CATALOG) {
    assert.ok(th.role[entry.role], `${entry.id}: no colour for role ${entry.role}`);
  }
});
