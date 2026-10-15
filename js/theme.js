// @ts-check
// Colour tokens for everything drawn on canvas. DOM-free, so Node tests
// can load it. For now the only theme is the original look.

import { MARBLE_COLORS } from './config.js';

const THEMES = {
  legacy: {
    skyTop: '#cdeefb',
    skyBottom: '#aadcf2',
    gridDot: 'rgba(45, 74, 117, 0.18)',
    ghostOk: '#3ddc84',
    ghostBad: '#ff5252',
    marbles: MARBLE_COLORS,
  },
};

let active = THEMES.legacy;
const listeners = [];

export function current() { return active; }

/** @param {string} name */
export function set(name) {
  const next = THEMES[name];
  if (!next || next === active) return;
  active = next;
  for (const fn of listeners) fn(active);
}

export function onChange(fn) { listeners.push(fn); }

/** Colour of the i-th marble dropped. */
export function marble(i) { return active.marbles[i % active.marbles.length]; }
