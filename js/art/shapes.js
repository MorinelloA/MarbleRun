// @ts-check
// Path2D geometry for the art, built from the catalog's part descriptors in
// the entry's own coordinates. Paths are cached per entry: every placed
// copy shares them, and the piece transform puts them in place.

const cache = new Map(); // entry id -> [{ part, path }]

/** A rounded rectangle centred on (x, y), turned by `a` radians. */
export function roundRectPath(path, x, y, w, h, a, r) {
  const c = Math.cos(a), s = Math.sin(a);
  const at = (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
  const [x0, y0] = at(-w / 2, -h / 2);
  const [x1, y1] = at(w / 2, -h / 2);
  const [x2, y2] = at(w / 2, h / 2);
  const [x3, y3] = at(-w / 2, h / 2);
  const [mx, my] = at(0, -h / 2);
  path.moveTo(mx, my);
  path.arcTo(x1, y1, x2, y2, r);
  path.arcTo(x2, y2, x3, y3, r);
  path.arcTo(x3, y3, x0, y0, r);
  path.arcTo(x0, y0, x1, y1, r);
  path.closePath();
}

function outline(p) {
  const path = new Path2D();
  if (p.kind === 'circle') path.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  else roundRectPath(path, p.x, p.y, p.w, p.h, p.a, Math.min(5, p.w / 2, p.h / 2));
  return path;
}

/** Each of an entry's parts with its outline (sensors included). */
export function partPaths(entry) {
  let list = cache.get(entry.id);
  if (!list) {
    list = entry.build(null).map(part => ({ part, path: outline(part) }));
    cache.set(entry.id, list);
  }
  return list;
}
