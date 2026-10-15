// @ts-check
// Colour tokens for everything drawn on canvas: the toybox palette of the
// site's hero toy, on its dark stage. DOM-free, so Node tests can load it.
// Grid dots and the floor are solid colours worked out ahead, not alpha.

const TOYBOX = {
  stage: '#0B0B0E',   // the background, and the knockout outline of every shape
  ink: '#F3F1EC',
  muted: '#A9A8A3',
  dot: '#2c2c31',     // grid dots: muted, about 20% over the stage
  floor: '#3d3d44',   // the floor band: muted, about 30% over the stage
  shine: 'rgba(255, 255, 255, 0.55)', // the glint on a marble
  ghostOk: '#80b918',
  ghostBad: '#e63946',
  /** fills by catalog role */
  role: {
    track: '#FFC845',     // gold
    ramp: '#E8A33D',      // amber
    steep: '#f4a300',     // orange
    curve: '#9b5de5',     // violet
    mover: '#00b4d8',     // cyan
    launch: '#e63946',    // red
    bounce: '#e63946',
    bell: '#FFC845',      // a bell or bar whose pitch has no colour of its own
    bar: '#FFC845',
    structure: '#BFE7F7', // sky
    dropper: '#E4E5E8',   // gray
    basket: '#2a9d8f',    // teal
    spinner: '#80b918',   // lime
    gate: '#4361ee',      // royal
    goal: '#FFC845',      // gold, like a trophy
  },
  /** small parts drawn over other shapes, not on the stage */
  detail: {
    hub: '#0F6E56',   // green: spinner hubs, the seesaw's pivot and fulcrum
    post: '#b07a1e',  // the bell's post and clapper
    core: '#2b2b33',  // the cannon's core
    field: '#065769', // the lift's rising chevrons: cyan, about 45% over the stage
  },
  /** music pieces by note (index into music.js NOTES), a rainbow up the
   *  scale: C red, D orange, E yellow, F green, G sky, A blue, B violet,
   *  and high C pink */
  notes: ['#e63946', '#f4a300', '#FFC845', '#80b918', '#00b4d8', '#4361ee', '#9b5de5', '#f15bb5'],
  marbles: ['#e63946', '#FFC845', '#4361ee', '#9b5de5', '#00b4d8', '#80b918', '#f4a300', '#2a9d8f'],
};

const THEMES = { toybox: TOYBOX };

let active = TOYBOX;
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

/** Colour of the marble with colour index i. */
export function marble(i) { return active.marbles[i % active.marbles.length]; }

/** Fill colour for a catalog role. */
export function role(name) { return active.role[name] || active.ink; }

const rgbCache = new Map();
function rgbOf(hex) {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [n >> 16, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** Red, whatever its lightness: hue within 30° of pure red. */
function isRed([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max !== r || max - min < 60) return false;
  const h = ((g - b) / (max - min)) * 60;
  return h <= 30 && h >= -30;
}

/**
 * A struck piece's fill, `k` of the way (0..1) to its flash colour. Reds
 * flash to gold and everything else to ink, so a flash never passes
 * through a lightened red (pink). Returns #rrggbb.
 */
export function flash(fill, k) {
  const from = rgbOf(fill);
  const to = rgbOf(isRed(from) ? active.role.track : active.ink);
  const ch = (i) => Math.round(from[i] + (to[i] - from[i]) * k).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}
