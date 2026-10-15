// @ts-check
// Boards as links: the pieces go in the URL's hash, five characters each,
// so a whole run fits in a message.
//
//   #b=1.<piece><piece>...   piece = type, column, row, turn, note
//     type    one letter per piece type (CODES: fixed for good, so old links
//             keep working; new pieces take new letters)
//     column  0-g, row 0-8 (base 36)
//     turn    rot * 2 + mirror, 0-7
//     note    0-5, or - for the piece's own starting note
//
// A link's board goes through parseDoc like any saved board, so a mangled
// or hostile link can't do more than fail to open.

import { parseDoc } from './save.js';

const FORMAT = '1';

export const CODES = {
  dropper: 'a', straight: 'b', ramp: 'c', steep: 'd', zigzag: 'e', curve: 'f', uturn: 'g',
  funnel: 'h', tube: 'i', loop: 'j', escalator: 'k', lift: 'l', cannon: 'm', stairs: 'n',
  spinner: 'o', seesaw: 'p', bumper: 'q', tramp: 'r', bell: 's', xylo1: 't', xylo2: 'u',
  xylo3: 'v', peg: 'w', block: 'x', half: 'y', basket: 'z', windmill: 'A', conveyor: 'B',
  gate: 'C', flipflop: 'D', goal: 'E',
};
const TYPES = Object.fromEntries(Object.entries(CODES).map(([t, code]) => [code, t]));

/** @param {{t: string, c: number, r: number, rot?: number, f?: number, n?: number}[]} pieces */
export function encode(pieces) {
  let out = '';
  for (const p of pieces) {
    const code = CODES[p.t];
    if (!code) continue;
    out += code + p.c.toString(36) + p.r.toString(36) + String(((p.rot || 0) & 3) * 2 + (p.f ? 1 : 0)) +
      (Number.isInteger(p.n) ? String(p.n) : '-');
  }
  return `${FORMAT}.${out}`;
}

/** A board document from a link's data, or null if it isn't one. */
export function decode(data) {
  const m = /^1\.([A-Za-z0-9-]*)$/.exec(data);
  if (!m || m[1].length % 5) return null;
  const pieces = [];
  for (let i = 0; i < m[1].length; i += 5) {
    const [code, c, r, turn, note] = m[1].slice(i, i + 5);
    const t = TYPES[code];
    if (!t) continue;
    const piece = { t, c: parseInt(c, 36), r: parseInt(r, 36), rot: Number(turn) >> 1, f: Number(turn) & 1 };
    if (note !== '-') piece.n = Number(note);
    pieces.push(piece);
  }
  return parseDoc({ v: 2, name: 'Shared board', ts: Date.now(), pieces });
}

/** A link that opens these pieces in this copy of the game. */
export function linkFor(pieces) {
  return `${location.origin}${location.pathname}${location.search}#b=${encode(pieces)}`;
}

/** The board in the page's own address, if it carries one (null for a
 *  link that's been mangled, even into bad escapes like a stray %). */
export function fromLocation() {
  const m = /^#b=(.+)$/.exec(location.hash);
  if (!m) return null;
  try {
    return decode(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

/** Take a board out of the address, so a reload doesn't open it again. */
export function clearLocation() {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}
