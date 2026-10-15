// @ts-check
// The toybox look, as on the site's hero toy: flat shapes, each filled and
// then outlined 3 px in the colour behind it (the knockout), so shapes that
// touch stay distinct. Paths are Path2D in whatever coordinates they are
// given; the art builds them in each entry's own coordinates and caches
// them.

import * as theme from '../theme.js';

const KNOCK_W = 3;
const knocks = new WeakMap(); // drawing context -> the colour behind it

/** Set the colour a context draws on (the stage unless set), for
 *  knockout outlines and die-cut details. */
export function setKnock(g, color) { knocks.set(g, color); }

export function knockColor(g) { return knocks.get(g) || theme.current().stage; }

/** Fill a shape, then outline it in the knockout colour. */
export function knock(g, path, fill) {
  g.fillStyle = fill;
  g.fill(path);
  g.lineWidth = KNOCK_W;
  g.lineJoin = 'round';
  g.strokeStyle = knockColor(g);
  g.stroke(path);
}

/** A pill: round-ended, along the centre line (x1, y1)-(x2, y2), radius r. */
export function pill(path, x1, y1, x2, y2, r) {
  const n = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
  path.moveTo(x2 + r * Math.cos(n), y2 + r * Math.sin(n));
  path.arc(x2, y2, r, n, n + Math.PI);
  path.arc(x1, y1, r, n + Math.PI, n + 2 * Math.PI);
  path.closePath();
}

/** The long axis of a rect part: centre line half-length, radius, angle. */
export function axisOf(p) {
  const long = p.w >= p.h;
  const r = (long ? p.h : p.w) / 2;
  return { half: (long ? p.w : p.h) / 2 - r, r, a: p.a + (long ? 0 : Math.PI / 2) };
}

/** The pill that fills a rect part. */
export function pillOf(path, p) {
  const { half, r, a } = axisOf(p);
  const dx = Math.cos(a) * half, dy = Math.sin(a) * half;
  pill(path, p.x - dx, p.y - dy, p.x + dx, p.y + dy, r);
}

/** A rounded rectangle centred on (x, y), turned by `a` radians. */
export function tile(path, x, y, w, h, a, r) {
  const c = Math.cos(a), s = Math.sin(a);
  const at = (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
  const corners = [at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2), at(-w / 2, -h / 2)];
  const [mx, my] = at(0, -h / 2);
  path.moveTo(mx, my);
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = corners[i];
    const [nx, ny] = corners[(i + 1) % 4];
    path.arcTo(cx, cy, nx, ny, r);
  }
  path.closePath();
}

export function disc(path, x, y, r) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, Math.PI * 2);
  path.closePath();
}

/** A convex polygon with its corners rounded to radius r. */
export function softPolygon(path, pts, r) {
  const n = pts.length;
  const [ax, ay] = pts[n - 1], [bx, by] = pts[0];
  path.moveTo((ax + bx) / 2, (ay + by) / 2);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    path.arcTo(cx, cy, nx, ny, r);
  }
  path.closePath();
}

/** A band along an arc: radii r0 to r1, from angle a0 to a1 (either way
 *  round), with round ends. */
export function band(path, cx, cy, r0, r1, a0, a1) {
  const ccw = a1 < a0;
  const turn = ccw ? -Math.PI : Math.PI;
  const rm = (r0 + r1) / 2, rc = (r1 - r0) / 2;
  path.moveTo(cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0));
  path.arc(cx, cy, r1, a0, a1, ccw);
  path.arc(cx + rm * Math.cos(a1), cy + rm * Math.sin(a1), rc, a1, a1 + turn, ccw);
  path.arc(cx, cy, r0, a1, a0, !ccw);
  path.arc(cx + rm * Math.cos(a0), cy + rm * Math.sin(a0), rc, a0 + turn, a0 + 2 * turn, ccw);
  path.closePath();
}

/** The arcs of an entry's parts (see geometry.arcChain), with chains that
 *  continue one another merged into one. */
export function mergedArcs(parts) {
  const arcs = [];
  for (const p of parts) {
    if (p.arc && !arcs.includes(p.arc)) arcs.push(p.arc);
  }
  const out = [];
  for (const a of arcs) {
    const last = out[out.length - 1];
    if (last && last.cx === a.cx && last.cy === a.cy && last.r === a.r && last.t === a.t &&
        Math.abs(last.a1 - a.a0) < 1e-9 && (last.a1 > last.a0) === (a.a1 > a.a0)) {
      last.a1 = a.a1;
    } else {
      out.push({ ...a });
    }
  }
  return out;
}

/** Add a ">" to the current path of g, centred on (x, y) and pointing
 *  along the unit vector (dx, dy). */
export function chevron(g, x, y, dx, dy, len, half) {
  const bx = x - dx * len / 2, by = y - dy * len / 2;
  g.moveTo(bx - dy * half, by + dx * half);
  g.lineTo(x + dx * len / 2, y + dy * len / 2);
  g.lineTo(bx + dy * half, by - dx * half);
}
