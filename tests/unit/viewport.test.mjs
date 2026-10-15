// The canvas backing store follows the screen: one canvas pixel per device
// pixel, never below 1x, capped for memory.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rootUrl } from '../sim/matter.mjs';

const { fit } = await import(rootUrl('js/viewport.js'));
const { BOARD_W, RS_MAX, RS_FLOOR } = await import(rootUrl('js/config.js'));

const backing = (iw, ih, dpr, cap) => Math.round(BOARD_W * fit(iw, ih, dpr, cap).rs);

test('backing width matches the device pixels the board covers', () => {
  assert.equal(backing(1024, 768, 1), 1133);   // shrunk below 1x: stays at 1x
  assert.equal(backing(1366, 768, 1), 1170);
  assert.equal(backing(1920, 1080, 1), 1645);
  assert.equal(backing(1133, 744, 2), 2266);   // iPad mini
  assert.equal(backing(1366, 1024, 2), 2732);  // 12.9-inch iPad Pro
});

test('the scale is capped on big screens and by the quality step-down', () => {
  assert.equal(fit(3840, 2160, 2).rs, RS_MAX);
  assert.equal(fit(1133, 744, 2, RS_FLOOR).rs, RS_FLOOR);
  assert.equal(fit(100, 60, 1).rs, 1);
});

test('the stage sits on whole device pixels', () => {
  for (const [iw, ih, dpr] of [[1366, 768, 1], [1000, 701, 1.5], [1287, 905, 2], [817, 611, 3]]) {
    const v = fit(iw, ih, dpr);
    assert.ok(Math.abs(v.left * dpr - Math.round(v.left * dpr)) < 1e-9, `left ${v.left} at ${dpr}x`);
    assert.ok(Math.abs(v.top * dpr - Math.round(v.top * dpr)) < 1e-9, `top ${v.top} at ${dpr}x`);
  }
});
