// @ts-check
// The original look: flat fills with darker outlines and a few painted
// details. Drawn in the entry's own coordinates, so the details now follow
// turned and mirrored pieces too. Temporary: the toybox art replaces it.

import { partPaths } from './shapes.js';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function legacyArt(entry) {
  const dyn = entry.dynamic;
  return {
    mode: dyn ? 'dynamic' : 'static',
    /** @param {CanvasRenderingContext2D} g */
    draw(g) {
      g.lineWidth = 2;
      for (const { part, path } of partPaths(entry)) {
        if (part.opts.sensor) continue; // sensors are invisible
        const fill = part.opts.color || entry.color;
        g.fillStyle = fill;
        g.strokeStyle = shade(fill, 0.72);
        g.fill(path);
        g.stroke(path);
      }
      if (dyn) {
        g.beginPath(); // hub at the pivot
        g.arc(dyn.pivot[0], dyn.pivot[1], 6, 0, Math.PI * 2);
        g.fillStyle = shade(entry.color, 0.6);
        g.fill();
      }
      if (entry.decor) entry.decor(g);
    },
  };
}
