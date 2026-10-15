// @ts-check
// The toybox art for every piece type, keyed by catalog id. A piece is a
// few flat shapes in its role's colour (theme.js), each outlined in the
// colour behind it (shapes.knock), drawn in its entry's own coordinates.
//   mode   where it is drawn:
//            static   once, into the cached board layer
//            overlay  draw() into the cached layer, overlay() every frame
//            live     every frame (pieces that react when hit)
//            dynamic  every frame, turned with its physics body; base(),
//                     if any, is a still part drawn into the cached layer
//   draw(g, piece, env), overlay(g, piece, env), base(g, piece, env)
//     env: { t: sim time in ms, next: colour index of the next marble,
//            reduced: prefers-reduced-motion }
// Shapes come from the catalog's own parts, so the art can't drift from the
// physics; tools/catalog-sheet.html draws both, one over the other.
//
// Motion is restrained: movers' chevrons drift the way they push, and a
// struck piece reacts once (fx.js keeps the strikes) and settles within a
// fraction of a second. With reduced motion, reactions are a flash only.

import { CATALOG } from '../pieces/catalog.js';
import { NOTES } from '../music.js';
import { goalCount } from '../behaviors.js';
import * as theme from '../theme.js';
import * as fx from '../fx.js';
import {
  knock, knockColor, pill, pillOf, axisOf, tile, disc, softPolygon, band, mergedArcs, chevron,
} from './shapes.js';

/** ms since a piece was last struck (Infinity if never, or not placed). */
function ageOf(piece, env) {
  const h = piece && fx.lastHit(piece);
  if (!h) return Infinity;
  const age = env.t - h.t;
  return age < 0 ? Infinity : age;
}

/** A fill flashing toward ink (gold, for reds), fading over `ms`. */
function flashed(fill, age, ms) {
  return age < ms ? theme.flash(fill, 1 - age / ms) : fill;
}

/** How far a mover's pattern has drifted: px along its push at `speed` px/s. */
function drift(env, speed) {
  return env.reduced ? 0 : (env.t * speed) / 1000;
}

/** Build once, on first use (Path2D needs a browser). */
function lazy(build) {
  let value = null;
  return () => (value ||= build());
}

const solidParts = (entry) => entry.build(null).filter(p => !p.opts.sensor);

/** One path per solid part: pills for bars and walls (rounded tiles if
 *  tileR is given), discs for circles, and each arc chain as one smooth
 *  band. */
function partPaths(entry, tileR = 0) {
  const parts = solidParts(entry);
  const paths = [];
  for (const p of parts) {
    if (p.arc) continue;
    const path = new Path2D();
    if (p.kind === 'circle') disc(path, p.x, p.y, p.r);
    else if (tileR) tile(path, p.x, p.y, p.w, p.h, p.a, tileR);
    else pillOf(path, p);
    paths.push(path);
  }
  for (const a of mergedArcs(parts)) {
    const path = new Path2D();
    band(path, a.cx, a.cy, a.r, a.r + a.t, a.a0, a.a1);
    paths.push(path);
  }
  return paths;
}

function knockAll(g, paths, fill) {
  for (const p of paths) knock(g, p, fill);
}

/** A filled, knocked-out circle drawn straight on the context. */
function knockCircle(g, x, y, r, fill) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = knockColor(g);
  g.stroke();
}

// ---- movers: die-cut chevrons along whatever pushes ----

const CHEVRON_STEP = 20;
const BELT_SPEED = 18;  // px/s the chevrons drift
const RISE_SPEED = 22;  // px/s the lift's field chevrons rise

function conveyorsOf(entry) {
  return solidParts(entry)
    .filter(p => p.opts.behavior?.type === 'push')
    .map(p => {
      const path = new Path2D();
      pillOf(path, p);
      return { p, path, dir: p.opts.behavior.dir };
    });
}

/** Chevrons cut through each conveyor, pointing the way it pushes, slid
 *  `phase` px along it. */
function drawChevrons(g, conveyors, phase) {
  g.save();
  g.strokeStyle = knockColor(g);
  g.lineWidth = 2.25;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const shift = ((phase % CHEVRON_STEP) + CHEVRON_STEP) % CHEVRON_STEP;
  for (const { p, path, dir } of conveyors) {
    const { half, r, a } = axisOf(p);
    let ax = Math.cos(a), ay = Math.sin(a);
    if (ax * dir[0] + ay * dir[1] < 0) { ax = -ax; ay = -ay; }
    const n = Math.ceil((half + r) / CHEVRON_STEP);
    g.save();
    g.clip(path);
    g.beginPath();
    for (let k = -n - 1; k <= n; k++) {
      const u = k * CHEVRON_STEP + shift;
      chevron(g, p.x + ax * u, p.y + ay * u, ax, ay, r * 0.55, r * 0.45);
    }
    g.stroke();
    g.restore();
  }
  g.restore();
}

function plain(entry, tileR = 0) {
  const paths = lazy(() => partPaths(entry, tileR));
  return {
    mode: 'static',
    draw(g) { knockAll(g, paths(), theme.role(entry.role)); },
  };
}

function escalator(entry) {
  const paths = lazy(() => partPaths(entry));
  const belts = lazy(() => conveyorsOf(entry));
  return {
    mode: 'overlay',
    draw(g) { knockAll(g, paths(), theme.role(entry.role)); },
    overlay(g, piece, env) { drawChevrons(g, belts(), drift(env, BELT_SPEED)); },
  };
}

// the lift's shaft: inside the walls, under the cap, above the floor
const SHAFT = { x: 18, y: 30, w: 28, h: 84 };
const RISER_STEP = 22;

function lift(entry) {
  const paths = lazy(() => partPaths(entry));
  const belts = lazy(() => conveyorsOf(entry));
  return {
    mode: 'overlay',
    draw(g) { knockAll(g, paths(), theme.role(entry.role)); },
    overlay(g, piece, env) {
      // the field that floats marbles up: chevrons rising in the shaft
      g.save();
      g.beginPath();
      g.rect(SHAFT.x, SHAFT.y, SHAFT.w, SHAFT.h);
      g.clip();
      g.strokeStyle = theme.current().detail.field;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      const cx = SHAFT.x + SHAFT.w / 2;
      const rise = drift(env, RISE_SPEED) % RISER_STEP;
      for (let y = SHAFT.y + SHAFT.h + RISER_STEP - rise; y > SHAFT.y - RISER_STEP; y -= RISER_STEP) {
        chevron(g, cx, y, 0, -1, 6, 7);
      }
      g.stroke();
      g.restore();
      drawChevrons(g, belts(), drift(env, BELT_SPEED));
    },
  };
}

function loop(entry) {
  const parts = solidParts(entry);
  const floor = lazy(() => {
    const path = new Path2D();
    pillOf(path, parts.find(p => !p.arc));
    return path;
  });
  const bands = lazy(() => mergedArcs(parts).map(a => {
    const path = new Path2D();
    band(path, a.cx, a.cy, a.r, a.r + a.t, a.a0, a.a1);
    return path;
  }));
  const belts = lazy(() => conveyorsOf(entry));
  return {
    mode: 'overlay',
    draw(g) {
      knock(g, floor(), theme.role('mover')); // the floor is a conveyor
      knockAll(g, bands(), theme.role(entry.role));
    },
    overlay(g, piece, env) {
      drawChevrons(g, belts(), drift(env, BELT_SPEED));
      knockAll(g, bands(), theme.role(entry.role)); // the loop stays in front of its floor
    },
  };
}

function dropper(entry) {
  const paths = lazy(() => {
    const hopper = new Path2D();
    softPolygon(hopper, [[3, 2], [61, 2], [46, 18], [18, 18]], 2.5);
    return [...partPaths(entry), hopper];
  });
  const at = entry.spawner;
  return {
    mode: 'overlay',
    draw(g) { knockAll(g, paths(), theme.role(entry.role)); },
    // where the next marble drops, in its colour, breathing gently
    overlay(g, piece, env) {
      const r = env.reduced ? 7 : 7 + 0.9 * Math.sin((env.t / 1400) * 2 * Math.PI);
      knockCircle(g, at.x, at.y, r, theme.marble(env.next));
    },
  };
}

function bellPath(path, cx, cy, r) {
  const lip = cy + r;
  const flare = r + 2;
  path.moveTo(cx - r, cy);
  path.arc(cx, cy, r, Math.PI, 2 * Math.PI); // the dome: top half of the physics circle
  path.bezierCurveTo(cx + r, cy + r * 0.45, cx + flare - 1, lip - 4, cx + flare, lip - 1.5);
  path.quadraticCurveTo(cx + flare + 0.5, lip, cx + flare - 2, lip);
  path.lineTo(cx - flare + 2, lip);
  path.quadraticCurveTo(cx - flare - 0.5, lip, cx - flare, lip - 1.5);
  path.bezierCurveTo(cx - flare + 1, lip - 4, cx - r, cy + r * 0.45, cx - r, cy);
  path.closePath();
}

function bell(entry) {
  const shapes = lazy(() => {
    const [dome, post] = entry.build(null);
    const stand = new Path2D();
    tile(stand, post.x, post.y, post.w, post.h, 0, 2);
    const body = new Path2D();
    bellPath(body, dome.x, dome.y, dome.r);
    const knob = new Path2D();
    disc(knob, dome.x, dome.y - dome.r - 1, 3);
    const clapper = new Path2D();
    disc(clapper, dome.x, dome.y + dome.r + 1.5, 3.5);
    return {
      stand, body, knob, clapper,
      dots: noteDots(dome.x, dome.y + dome.r * 0.7, 3.8, 1.2),
      pivot: [dome.x, dome.y - dome.r - 1],
    };
  });
  return {
    mode: 'live',
    // coloured by its note, with the note's dots cut through, like a bar;
    // struck, it rocks on its knob (up to 8°, harder hits swing wider),
    // dying away over about 700 ms
    draw(g, piece, env) {
      const s = shapes(), th = theme.current();
      const note = noteOf(piece, entry);
      knock(g, s.stand, th.detail.post);
      const age = ageOf(piece, env);
      let fill = th.notes[note];
      g.save();
      if (env.reduced) {
        fill = flashed(fill, age, 300);
      } else if (age < 700) {
        const amp = Math.min(8, 3 + 0.6 * fx.lastHit(piece).s) * (Math.PI / 180);
        const a = amp * Math.exp(-age / 230) * Math.sin((age / 340) * 2 * Math.PI);
        g.translate(s.pivot[0], s.pivot[1]);
        g.rotate(a);
        g.translate(-s.pivot[0], -s.pivot[1]);
      }
      g.fillStyle = th.detail.post;
      g.fill(s.clapper);
      knock(g, s.body, fill);
      knock(g, s.knob, fill);
      g.fillStyle = knockColor(g);
      g.fill(s.dots[note]);
      g.restore();
    },
  };
}

const BAR_MS = 180;

/** For each note n, a row of n + 1 dots centred on (x, y): the note's
 *  place in the scale, readable without colour. */
function noteDots(x, y, gap, r) {
  return NOTES.map((_, n) => {
    const path = new Path2D();
    for (let i = 0; i <= n; i++) disc(path, x + (i - n / 2) * gap, y, r);
    return path;
  });
}

const noteOf = (piece, entry) => piece?.note ?? entry.tunable.note;

function xylophone(entry) {
  const shapes = lazy(() => {
    const [bar] = entry.build(null);
    const body = new Path2D();
    tile(body, bar.x, bar.y, bar.w, bar.h, bar.a, 4);
    return { body, dots: noteDots(bar.x, bar.y, 6, 1.8) };
  });
  return {
    mode: 'live',
    // coloured by its note, with the note's dots cut through; struck, it
    // flashes and dips 2 px
    draw(g, piece, env) {
      const s = shapes();
      const note = noteOf(piece, entry);
      const age = ageOf(piece, env);
      g.save();
      if (!env.reduced && age < BAR_MS) g.translate(0, 2 * Math.sin((Math.PI * age) / BAR_MS));
      knock(g, s.body, flashed(theme.current().notes[note], age, BAR_MS));
      g.fillStyle = knockColor(g);
      g.fill(s.dots[note]);
      g.restore();
    },
  };
}

const POP_MS = 120;

function bumper(entry) {
  const shapes = lazy(() => {
    const [c] = entry.build(null);
    const body = new Path2D();
    disc(body, c.x, c.y, c.r);
    const cap = new Path2D();
    disc(cap, c.x, c.y, c.r * 0.4);
    return { body, cap, cx: c.x, cy: c.y };
  });
  return {
    mode: 'live',
    // struck, it flashes and pops 14% bigger for a moment
    draw(g, piece, env) {
      const s = shapes();
      const age = ageOf(piece, env);
      g.save();
      if (!env.reduced && age < POP_MS) {
        const k = 1 + 0.14 * (1 - age / POP_MS) ** 2;
        g.translate(s.cx, s.cy);
        g.scale(k, k);
        g.translate(-s.cx, -s.cy);
      }
      knock(g, s.body, flashed(theme.role(entry.role), age, POP_MS));
      knock(g, s.cap, theme.current().ink);
      g.restore();
    },
  };
}

function bouncer(entry) {
  const shapes = lazy(() => {
    const [pad] = entry.build(null);
    const body = new Path2D();
    pillOf(body, pad);
    const y = pad.y - pad.h / 2 + 3.25; // a spring line just under the top
    return { body, line: [pad.x - pad.w / 2 + 10, y, pad.x + pad.w / 2 - 10, y] };
  });
  return {
    mode: 'live',
    // struck, it flashes
    draw(g, piece, env) {
      const s = shapes();
      knock(g, s.body, flashed(theme.role(entry.role), ageOf(piece, env), POP_MS));
      g.strokeStyle = theme.current().ink;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s.line[0], s.line[1]);
      g.lineTo(s.line[2], s.line[3]);
      g.stroke();
    },
  };
}

const RECOIL_MS = 160;

function cannon(entry) {
  const shapes = lazy(() => {
    const parts = entry.build(null);
    const arms = parts.filter(p => !p.opts.sensor).map(p => {
      const path = new Path2D();
      pillOf(path, p);
      return path;
    });
    const core = parts.find(p => p.opts.sensor);
    const [vx, vy] = core.opts.behavior.vel;
    const len = Math.hypot(vx, vy);
    // the barrel points where the cannon fires
    const barrel = new Path2D();
    pill(barrel, core.x, core.y, core.x + (vx / len) * 17, core.y + (vy / len) * 17, 5.5);
    const body = new Path2D();
    disc(body, core.x, core.y, core.r);
    const fuse = new Path2D();
    disc(fuse, core.x, core.y, 2.5);
    return { arms, barrel, body, fuse, ux: vx / len, uy: vy / len };
  });
  return {
    mode: 'live',
    // firing, the barrel kicks back 3 px and flashes
    draw(g, piece, env) {
      const s = shapes(), th = theme.current();
      const red = theme.role(entry.role);
      const age = ageOf(piece, env);
      const kick = !env.reduced && age < RECOIL_MS ? -3 * (1 - age / RECOIL_MS) ** 2 : 0;
      g.save();
      g.translate(s.ux * kick, s.uy * kick);
      knock(g, s.barrel, flashed(red, age, RECOIL_MS));
      g.restore();
      knockAll(g, s.arms, red);
      knock(g, s.body, th.detail.core);
      g.fillStyle = theme.role('track');
      g.fill(s.fuse);
    },
  };
}

const CATCH_MS = 220;

function basket(entry) {
  const shape = lazy(() => {
    const [bottom, left, right] = entry.build(null);
    const x0 = left.x - left.w / 2, x1 = right.x + right.w / 2;   // outer sides
    const xi0 = left.x + left.w / 2, xi1 = right.x - right.w / 2; // inner sides
    const rw = left.w / 2;
    const capY = left.y - left.h / 2 + rw;                        // round wall tops
    const yi = bottom.y - bottom.h / 2, y1 = bottom.y + bottom.h / 2;
    const path = new Path2D();
    path.moveTo(x0, capY);
    path.arc(left.x, capY, rw, Math.PI, 2 * Math.PI);
    path.arcTo(xi0, yi, xi1, yi, 3);
    path.arcTo(xi1, yi, xi1, capY, 3);
    path.lineTo(xi1, capY);
    path.arc(right.x, capY, rw, Math.PI, 2 * Math.PI);
    path.arcTo(x1, y1, x0, y1, 8);
    path.arcTo(x0, y1, x0, capY, 8);
    path.closePath();
    return path;
  });
  return {
    mode: 'live',
    // a catch makes it dip and come back up (a flash, with reduced motion)
    draw(g, piece, env) {
      const age = ageOf(piece, env);
      let fill = theme.role(entry.role);
      g.save();
      if (env.reduced) fill = flashed(fill, age, CATCH_MS);
      else if (age < CATCH_MS) g.translate(0, 2.5 * Math.sin((Math.PI * age) / CATCH_MS));
      knock(g, shape(), fill);
      g.restore();
    },
  };
}

function spinner(entry) {
  const shapes = lazy(() => {
    const parts = entry.build(null);
    const arm = new Path2D();
    pillOf(arm, parts.find(p => p.kind === 'rect'));
    const c = parts.find(p => p.kind === 'circle');
    const hub = new Path2D();
    disc(hub, c.x, c.y, c.r);
    return { arm, hub };
  });
  return {
    mode: 'dynamic',
    draw(g) {
      const s = shapes();
      knock(g, s.arm, theme.role(entry.role));
      knock(g, s.hub, theme.current().detail.hub);
    },
  };
}

function seesaw(entry) {
  const [px, py] = entry.dynamic.pivot;
  const shapes = lazy(() => {
    const plank = new Path2D();
    pillOf(plank, entry.build(null)[0]);
    const pin = new Path2D();
    disc(pin, px, py, 3);
    const fulcrum = new Path2D(); // decoration only: the plank hangs on a pin
    softPolygon(fulcrum, [[px, py + 4], [px + 12, py + 26], [px - 12, py + 26]], 3);
    return { plank, pin, fulcrum };
  });
  return {
    mode: 'dynamic',
    base(g) { knock(g, shapes().fulcrum, theme.current().detail.hub); },
    draw(g) {
      const s = shapes();
      knock(g, s.plank, theme.role(entry.role));
      g.fillStyle = theme.current().detail.hub;
      g.fill(s.pin);
    },
  };
}

const SWING_MS = 380;

function gate(entry) {
  const shapes = lazy(() => {
    const [floorPart, flapPart] = entry.build(null);
    const floor = new Path2D();
    pillOf(floor, floorPart);
    const flap = new Path2D();
    pillOf(flap, flapPart);
    const top = flapPart.y - flapPart.h / 2;
    const hinge = new Path2D();
    disc(hinge, flapPart.x, top, 3.5);
    return { floor, flap, hinge, pivot: [flapPart.x, top], dir: flapPart.opts.behavior.dir };
  });
  return {
    mode: 'live',
    // a flap hung from a hinge; an arrow shows the way through, and the flap
    // swings open as a marble pushes past
    draw(g, piece, env) {
      const s = shapes(), th = theme.current();
      knock(g, s.floor, theme.role('track'));
      // the arrow, on the side marbles come out
      g.save();
      g.strokeStyle = theme.role(entry.role);
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      chevron(g, s.pivot[0] + s.dir[0] * 13, s.pivot[1] + 10, s.dir[0], s.dir[1], 5, 5);
      g.stroke();
      g.restore();
      const age = ageOf(piece, env);
      g.save();
      if (age < SWING_MS) {
        const open = env.reduced ? 0 : 1.1 * Math.sin((Math.PI * age) / SWING_MS);
        g.translate(s.pivot[0], s.pivot[1]);
        g.rotate(-open * s.dir[0]);
        g.translate(-s.pivot[0], -s.pivot[1]);
      }
      knock(g, s.flap, flashed(theme.role(entry.role), age, env.reduced ? 220 : 0));
      knock(g, s.hinge, th.ink);
      g.restore();
    },
  };
}

const FLIP_MS = 140;

function flipflop(entry) {
  const shapes = lazy(() => {
    const [flapPart, ...rest] = entry.build(null);
    const flap = new Path2D();
    pillOf(flap, { ...flapPart, a: 0 });
    const walls = rest.filter(p => !p.opts.sensor).map(p => {
      const path = new Path2D();
      pillOf(path, p);
      return path;
    });
    const hub = new Path2D();
    disc(hub, flapPart.x, flapPart.y, 5);
    const stand = new Path2D(); // decoration only: the flap turns on a pin
    softPolygon(stand, [[flapPart.x, flapPart.y + 4], [flapPart.x + 11, flapPart.y + 30], [flapPart.x - 11, flapPart.y + 30]], 3);
    return { flap, walls, hub, stand, pivot: [flapPart.x, flapPart.y], angle: flapPart.a };
  });
  return {
    mode: 'live',
    // the flap tips toward one side; once a marble has gone it eases over
    // to the other
    draw(g, piece, env) {
      const s = shapes(), th = theme.current();
      const body = piece.bodies.find(b => b.plugin.behavior?.type === 'flap');
      const target = body ? body.angle : s.angle;
      const age = ageOf(piece, env);
      const p = env.reduced || age >= FLIP_MS ? 1 : 1 - (1 - age / FLIP_MS) ** 3;
      knockAll(g, s.walls, theme.role(entry.role));
      knock(g, s.stand, th.detail.hub);
      g.save();
      g.translate(s.pivot[0], s.pivot[1]);
      g.rotate(-target + 2 * target * p);
      g.translate(-s.pivot[0], -s.pivot[1]);
      knock(g, s.flap, theme.role(entry.role));
      g.restore();
      knock(g, s.hub, th.detail.hub);
    },
  };
}

const GOAL_MS = 260;

function goal(entry) {
  const shapes = lazy(() => {
    const [left, right, base] = entry.build(null);
    const walls = [left, right].map(p => {
      const path = new Path2D();
      pillOf(path, p);
      return path;
    });
    const cup = new Path2D();
    tile(cup, base.x, base.y, base.w, base.h, 0, 4);
    return { walls, cup, label: [base.x, base.y + 0.5], centre: [base.x, base.y - 20] };
  });
  return {
    mode: 'live',
    // counts the marbles that reach it on its base; a goal flashes and
    // bounces it
    draw(g, piece, env) {
      const s = shapes();
      const age = ageOf(piece, env);
      const fill = flashed(theme.role(entry.role), age, GOAL_MS);
      g.save();
      if (!env.reduced && age < GOAL_MS) {
        const k = 1 + 0.08 * Math.sin((Math.PI * age) / GOAL_MS);
        g.translate(s.centre[0], s.centre[1]);
        g.scale(k, k);
        g.translate(-s.centre[0], -s.centre[1]);
      }
      knockAll(g, s.walls, fill);
      knock(g, s.cup, fill);
      g.fillStyle = knockColor(g);
      g.font = '800 11px "Mona Sans", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(piece?.bodies?.length ? goalCount(piece) : 0), s.label[0], s.label[1]);
      g.restore();
    },
  };
}

const SPECIAL = {
  dropper, escalator, lift, loop, cannon, bumper, basket, seesaw,
  tramp: bouncer,
  spinner, windmill: spinner,
  block: (e) => plain(e, 8),
  half: (e) => plain(e, 8),
  conveyor: escalator,
  gate, flipflop, goal,
};

/** every bell and every bar, whatever note it starts on */
const BY_ROLE = { bell, bar: xylophone };

/** @type {Record<string, {mode: string, draw: Function, overlay?: Function, base?: Function}>} */
export const ART = Object.fromEntries(CATALOG.map(e => [e.id, (SPECIAL[e.id] || BY_ROLE[e.role] || plain)(e)]));

export const MODES = ['static', 'overlay', 'live', 'dynamic'];
