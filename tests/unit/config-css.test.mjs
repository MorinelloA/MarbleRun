// The stage's sizes and colours live in js/config.js and js/theme.js (the
// physics and the canvas use them) and again in the CSS (the layout uses
// them); they must agree.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, rootUrl } from '../sim/matter.mjs';

const css = readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const config = await import(rootUrl('js/config.js'));
const theme = await import(rootUrl('js/theme.js'));

function block(selector) {
  const escaped = selector.replace(/[#.:]/g, c => '\\' + c);
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no CSS block for ${selector}`);
  return m[1];
}

const root = block(':root');

function rootVar(name) {
  const m = root.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  assert.ok(m, `no --${name} on :root`);
  return m[1].trim();
}

const px = (value) => {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value);
  assert.ok(m, `${value} is not a px length`);
  return Number(m[1]);
};

function uses(selector, prop, varName) {
  const decls = block(selector);
  assert.match(decls, new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*var\\(--${varName}\\)`), `${selector} ${prop} should be var(--${varName})`);
}

test('stage, board and tray sizes in the CSS match config.js', () => {
  assert.equal(px(rootVar('game-w')), config.GAME_W);
  assert.equal(px(rootVar('game-h')), config.GAME_H);
  assert.equal(px(rootVar('board-h')), config.BOARD_H);
  assert.equal(px(rootVar('tray-h')), config.TRAY_H);
  uses('#game', 'width', 'game-w');
  uses('#game', 'height', 'game-h');
  uses('#playfield', 'width', 'game-w');
  uses('#playfield', 'height', 'board-h');
  uses('#tray', 'height', 'tray-h');
});

test('the toolbar ends above the top row of the grid', () => {
  assert.ok(px(rootVar('bar-top')) + px(rootVar('control')) <= config.GRID_Y,
    'toolbar would cover row 0');
  uses('#toolbar', 'top', 'bar-top');
  uses('#toolbar', 'height', 'control');
});

test('the CSS colours are the canvas theme\'s', () => {
  const th = theme.current();
  const same = (cssName, value) => assert.equal(rootVar(cssName).toLowerCase(), value.toLowerCase(), `--${cssName}`);
  same('stage', th.stage);
  same('ink', th.ink);
  same('muted', th.muted);
  same('gold', th.role.track);
  same('red', th.ghostBad);
  same('lime', th.ghostOk);
});
