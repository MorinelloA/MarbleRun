// @ts-check
// Builders for piece collision parts, expressed as plain descriptors in
// piece-local coordinates (origin = top-left of the piece footprint,
// x right, y down). piece.js transforms these for flip/rotation and
// turns them into Matter bodies.
//
//   { kind: 'rect',   x, y, w, h, a, opts }   x,y = center, a = angle rad
//   { kind: 'circle', x, y, r,       opts }
//
// opts: { sensor, restitution, friction, color, a, behavior }
//   behavior: what the part does to marbles (see behaviors.js)

export function rect(x, y, w, h, opts = {}) {
  return { kind: 'rect', x, y, w, h, a: opts.a || 0, opts };
}

export function circle(x, y, r, opts = {}) {
  return { kind: 'circle', x, y, r, opts };
}

/** A slanted bar from point (x1,y1) to (x2,y2) with given thickness.
 *  The bar's top surface runs along the segment (it is offset half the
 *  thickness toward +normal, i.e. downward for left-to-right segments). */
export function bar(x1, y1, x2, y2, thickness = 12, opts = {}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  // normal pointing to the RIGHT of the travel direction (screen coords,
  // y down) — so a left-to-right bar puts its material below the line.
  const nx = -dy / len, ny = dx / len;
  const cx = (x1 + x2) / 2 + nx * (thickness / 2);
  const cy = (y1 + y2) / 2 + ny * (thickness / 2);
  return { kind: 'rect', x: cx, y: cy, w: len + thickness * 0.4, h: thickness, a, opts };
}

/** Approximate an arc with short bars. Center (cx,cy), radius to the
 *  rolling surface; the bar thickness extends outward from the surface.
 *  Angles in radians, standard screen orientation (y down, 0 = +x axis,
 *  positive = clockwise on screen). */
export function arcChain(cx, cy, radius, a0, a1, segments = 8, thickness = 12, opts = {}) {
  const parts = [];
  const step = (a1 - a0) / segments;
  for (let i = 0; i < segments; i++) {
    const s = a0 + step * i;
    const e = s + step;
    const mid = (s + e) / 2;
    // chord length for this segment, padded slightly so segments overlap
    const chord = 2 * radius * Math.sin(Math.abs(step) / 2) + thickness * 0.5;
    // place the bar so its inner face lies on the arc of `radius`
    const r = radius + thickness / 2;
    const x = cx + Math.cos(mid) * r;
    const y = cy + Math.sin(mid) * r;
    // bar runs tangent to the arc
    const a = mid + Math.PI / 2;
    parts.push({ kind: 'rect', x, y, w: chord, h: thickness, a, opts });
  }
  return parts;
}
