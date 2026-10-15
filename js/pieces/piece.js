// @ts-check
// A placed piece: catalog entry + grid cell + rotation + flip.
// Transforms the entry's local part descriptors into board coordinates
// and builds the Matter bodies for them.

import { GRID, GRID_X, GRID_Y } from '../config.js';

const { Bodies, Body, Constraint } = window.Matter;

export class Piece {
  /**
   * @param {object} entry catalog entry
   * @param {number} col @param {number} row
   * @param {number} rot 0-3 quarter turns clockwise
   * @param {number} flip 0|1 mirrored horizontally
   */
  constructor(entry, col, row, rot = 0, flip = 0) {
    this.entry = entry;
    this.col = col;
    this.row = row;
    this.rot = entry.rotatable ? rot & 3 : 0;
    // only pieces with a mirrored twin can be mirrored; the loop's geometry
    // (and its gate logic) assumes it never is
    this.flip = entry.hasMirror && flip ? 1 : 0;
    this.bodies = [];
    this.constraint = null;
    this.dynamicBody = null;

    const [cw, ch] = entry.cells;
    // footprint in cells after rotation
    this.fw = (this.rot % 2 === 0) ? cw : ch;
    this.fh = (this.rot % 2 === 0) ? ch : cw;
    this.parts = transformParts(entry, this.rot, this.flip);
  }

  /** Board-pixel origin of this piece's footprint. */
  get x() { return GRID_X + this.col * GRID; }
  get y() { return GRID_Y + this.row * GRID; }

  /** Cells covered, as "c,r" keys. */
  footprintKeys(col = this.col, row = this.row) {
    const keys = [];
    for (let c = 0; c < this.fw; c++)
      for (let r = 0; r < this.fh; r++)
        keys.push(`${col + c},${row + r}`);
    return keys;
  }

  /** Create Matter bodies at the piece's board position. */
  buildBodies() {
    const ox = this.x, oy = this.y;
    const entry = this.entry;

    const makeBody = (p, opts) => {
      if (p.kind === 'circle') {
        return Bodies.circle(ox + p.x, oy + p.y, p.r, opts);
      }
      return Bodies.rectangle(ox + p.x, oy + p.y, p.w, p.h, {
        ...opts,
        angle: p.a,
        chamfer: p.opts.sensor ? undefined : { radius: 3 },
      });
    };

    if (entry.dynamic) {
      // one compound body pinned to the world at the pivot
      const parts = this.parts.map(p => makeBody(p, {
        friction: 0.05,
        restitution: 0.2,
        density: entry.dynamic.density,
      }));
      const body = Body.create({
        parts,
        frictionAir: entry.dynamic.frictionAir,
        friction: 0.05,
        restitution: 0.2,
        label: 'piece-dyn',
      });
      const pivot = transformPoint(entry, entry.dynamic.pivot, this.rot, this.flip);
      Body.setPosition(body, { x: ox + pivot[0], y: oy + pivot[1] });
      if (entry.dynamic.angle0) Body.setAngle(body, entry.dynamic.angle0);
      this.constraint = Constraint.create({
        pointA: { x: ox + pivot[0], y: oy + pivot[1] },
        bodyB: body,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: 0.9,
      });
      body.plugin.piece = this;
      this.dynamicBody = body;
      this.bodies = [body];
    } else {
      this.bodies = this.parts.map(p => {
        const b = makeBody(p, {
          isStatic: true,
          isSensor: !!p.opts.sensor,
          friction: p.opts.friction ?? 0.03,
          restitution: p.opts.restitution ?? 0.1,
          label: p.behavior ? p.behavior.type : 'track',
        });
        b.plugin.piece = this;
        b.plugin.behavior = p.behavior;
        return b;
      });
    }
    return this.bodies;
  }

  serialize() {
    return { t: this.entry.id, c: this.col, r: this.row, rot: this.rot, f: this.flip };
  }
}

/** Rotate/flip the entry's local part descriptors. Flip first, then
 *  quarter-turn clockwise `rot` times about the evolving footprint. A
 *  part's behavior comes along with its direction vectors turned the same
 *  way (on the part, not in opts, which arcChain shares between parts). */
export function transformParts(entry, rot, flip) {
  const defs = entry.build(null).map(p => ({ ...p, opts: p.opts || {} }));
  let w = entry.cells[0] * GRID;
  let h = entry.cells[1] * GRID;

  if (flip) {
    for (const p of defs) {
      p.x = w - p.x;
      if (p.kind === 'rect') p.a = -p.a;
    }
  }
  for (let i = 0; i < rot; i++) {
    for (const p of defs) {
      const nx = h - p.y, ny = p.x;
      p.x = nx; p.y = ny;
      if (p.kind === 'rect') p.a += Math.PI / 2;
    }
    [w, h] = [h, w];
  }
  for (const p of defs) p.behavior = orientBehavior(p.opts.behavior, rot, flip);
  return defs;
}

/** A direction in piece-local space, mirrored then turned like the part. */
export function orientVector(v, rot, flip) {
  let x = flip ? -v[0] : v[0];
  let y = v[1];
  for (let i = 0; i < rot; i++) [x, y] = [-y, x];
  return { x, y };
}

function orientBehavior(behavior, rot, flip) {
  if (!behavior) return null;
  const out = { ...behavior };
  if (behavior.dir) out.dir = orientVector(behavior.dir, rot, flip);
  if (behavior.vel) out.vel = orientVector(behavior.vel, rot, flip);
  return out;
}

/** Same transform for a single local point (used for dynamic pivots). */
export function transformPoint(entry, pt, rot, flip) {
  let [x, y] = pt;
  let w = entry.cells[0] * GRID;
  let h = entry.cells[1] * GRID;
  if (flip) x = w - x;
  for (let i = 0; i < rot; i++) {
    [x, y] = [h - y, x];
    [w, h] = [h, w];
  }
  return [x, y];
}
