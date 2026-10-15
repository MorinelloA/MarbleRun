// The stage size lives in config.js (the physics uses it) and in the CSS
// (the layout uses it); they must agree.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, rootUrl } from '../sim/matter.mjs';

const css = readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const config = await import(rootUrl('js/config.js'));

function block(selector) {
  const escaped = selector.replace(/[#.]/g, c => '\\' + c);
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no CSS block for ${selector}`);
  return m[1];
}

function px(decls, prop) {
  const m = decls.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*(\\d+)px`));
  return m ? Number(m[1]) : null;
}

test('stage, board and tray sizes in the CSS match config.js', () => {
  assert.equal(px(block('#game'), 'width'), config.GAME_W);
  assert.equal(px(block('#game'), 'height'), config.GAME_H);
  assert.equal(px(block('#playfield'), 'width'), config.BOARD_W);
  assert.equal(px(block('#playfield'), 'height'), config.BOARD_H);
  assert.equal(px(block('#tray'), 'height'), config.TRAY_H);
});
