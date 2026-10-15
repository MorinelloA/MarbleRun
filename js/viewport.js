// @ts-check
// Fits the fixed-size game to the window and picks the canvas resolution.
//   s    layout scale: CSS px per game px (the #game transform)
//   dpr  device pixels per CSS px
//   rs   canvas backing pixels per board px: s × dpr, so the board maps
//        1:1 onto device pixels, clamped to [1, RS_MAX] and to a quality
//        cap that lowerQuality() can step down on slow devices

import { GAME_W, GAME_H, RS_MAX, RS_FLOOR } from './config.js';

export const view = { s: 1, dpr: 1, rs: 1 };

const listeners = [];
let gameEl = null;
let rsCap = RS_MAX;
let notifyTimer = 0;
let dprQuery = null;

/** Called when rs or dpr changes (debounced): canvases and icons redraw. */
export function onChange(fn) { listeners.push(fn); }

/**
 * Layout for a window size. Offsets are whole device pixels, so the canvas
 * never sits at a fractional position and gets resampled.
 * @param {number} iw @param {number} ih window size in CSS px
 * @param {number} dpr @param {number} [cap]
 */
export function fit(iw, ih, dpr, cap = RS_MAX) {
  let s = Math.min(iw / GAME_W, ih / GAME_H);
  if (!isFinite(s) || s <= 0) s = 1;
  const rs = Math.max(1, Math.min(cap, s * dpr));
  const left = Math.round(((iw - GAME_W * s) / 2) * dpr) / dpr;
  const top = Math.round(((ih - GAME_H * s) / 2) * dpr) / dpr;
  return { s, dpr, rs, left, top };
}

let probe = null;

/** The screen's safe-area insets in CSS px, read off a hidden element
 *  padded by them (padding resolves env() to px in every browser). */
function safeInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

function apply() {
  const dpr = window.devicePixelRatio || 1;
  // the stage fits inside the safe area, clear of the home indicator
  const inset = safeInsets();
  const v = fit(window.innerWidth - inset.left - inset.right, window.innerHeight - inset.top - inset.bottom, dpr, rsCap);
  gameEl.style.transform = `scale(${v.s})`;
  gameEl.style.left = `${Math.round((v.left + inset.left) * dpr) / dpr}px`;
  gameEl.style.top = `${Math.round((v.top + inset.top) * dpr) / dpr}px`;
  document.documentElement.style.setProperty('--game-scale', String(v.s));
  view.s = v.s;
  if (v.rs !== view.rs || v.dpr !== view.dpr) {
    view.rs = v.rs;
    view.dpr = v.dpr;
    // reallocating canvases is the expensive part: wait for a resize drag
    // to settle
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => { for (const fn of listeners) fn(view); }, 150);
  }
}

// a change of devicePixelRatio (window moved to another screen, zoom)
// doesn't always fire resize; this query flips when it changes
function watchDpr() {
  if (dprQuery) dprQuery.removeEventListener('change', onDprChange);
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprQuery.addEventListener('change', onDprChange);
}
function onDprChange() {
  watchDpr();
  apply();
}

/** @param {HTMLElement} el the fixed-size game container */
export function init(el) {
  gameEl = el;
  const fresh = fit(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, rsCap);
  view.s = fresh.s; view.dpr = fresh.dpr; view.rs = fresh.rs;
  apply();
  window.addEventListener('resize', apply);
  // iOS reports the old size during orientationchange
  window.addEventListener('orientationchange', () => setTimeout(apply, 100));
  watchDpr();
  // some embedded web views change devicePixelRatio after load without
  // firing either event
  setInterval(() => {
    if ((window.devicePixelRatio || 1) !== view.dpr) onDprChange();
  }, 1000);
}

/** Step the resolution down a notch (a device that can't keep up).
 *  Returns false once at the floor. */
export function lowerQuality() {
  const next = Math.max(RS_FLOOR, view.rs - 0.25);
  if (next >= view.rs) return false;
  rsCap = next;
  apply();
  return true;
}
