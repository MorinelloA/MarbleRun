// @ts-check
// Declarative catalog of every piece type. Geometry is data-only;
// piece.js turns it into Matter bodies, and js/art/ draws the same parts.
//
// Entry shape:
//   id, name, cells:[w,h],
//   role -> what the piece is for (track, mover, bounce...); the art
//     colours it by role (see theme.js)
//   build(g) -> part descriptors in piece-local coords (see geometry.js);
//     a part's opts.behavior makes it do something to marbles it touches
//     (see behaviors.js): push, launch, boost, gate, chime, bounce, sensor
//   dynamic: { pivot:[x,y], frictionAir, density, angle0?, maxTilt? }
//     -> pinned moving piece
//   rotatable, rotations (distinct turns, default 4), hasMirror (gets a
//     flipped twin in the tray; only these can be mirrored)
//   spawner: {x, y} -> marbles from the toolbar drop from here
//   loop: {center, apexRadius, exitWindow} -> loop lap tracking

import * as g from './geometry.js';

const T = 12; // standard track thickness

export const CATALOG = [
  {
    id: 'dropper', name: 'Dropper', cells: [1, 1], role: 'dropper',
    rotatable: false,
    spawner: { x: 32, y: 30 },
    // marks the course start: when any dropper is on the board, the marble
    // button releases marbles from its chute (see toolbar.js) instead of
    // raining them from random sky positions
    build: () => [
      g.rect(14, 40, 8, 48),
      g.rect(50, 40, 8, 48),
    ],
  },
  {
    id: 'straight', name: 'Track', cells: [1, 1], role: 'track',
    rotatable: true,
    build: () => [g.bar(0, 52, 64, 52, T)],
  },
  {
    id: 'ramp', name: 'Ramp', cells: [1, 1], role: 'ramp',
    rotatable: true, hasMirror: true,
    build: () => [g.bar(0, 12, 64, 52, T)],
  },
  {
    id: 'steep', name: 'Steep', cells: [1, 2], role: 'steep',
    rotatable: true, hasMirror: true,
    build: () => [g.bar(0, 8, 64, 116, T)],
  },
  {
    id: 'zigzag', name: 'Zigzag', cells: [2, 2], role: 'ramp',
    rotatable: true, hasMirror: true,
    build: () => [
      g.bar(0, 14, 80, 37, T),       // upper ramp ends short of the wall
      g.rect(122, 54, T, 76),        // tall end wall; marble drops through the gap
      g.bar(16, 120, 128, 70, T),    // lower ramp back to the left (material below)
    ],
  },
  {
    id: 'curve', name: 'Curve', cells: [1, 1], role: 'curve',
    rotatable: true, hasMirror: true,
    // quarter-pipe: catches a falling marble and sends it rightward.
    // Arcs are thick (fast marbles tunnel through 12px segments) and
    // near-frictionless — Matter's friction impulse scales with impact
    // force, so a hard landing on a grippy curve stops the marble dead.
    build: () => g.arcChain(64, 0, 54, Math.PI, Math.PI / 2, 7, 16, { friction: 0.001 }),
  },
  {
    id: 'uturn', name: 'U-Turn', cells: [2, 2], role: 'curve',
    rotatable: true,
    // half-pipe bowl — marbles swing back and forth
    build: () => g.arcChain(64, 30, 56, Math.PI, 0, 12, 16, { friction: 0.001 }),
  },
  {
    id: 'funnel', name: 'Funnel', cells: [2, 2], role: 'curve',
    rotatable: false,
    build: () => [
      g.bar(4, 8, 47, 92, T, { friction: 0.005 }),   // slick walls so marbles
      g.bar(81, 92, 124, 8, T, { friction: 0.005 }), // slide into the throat
      g.rect(41, 110, T, 36),                 // left throat guide
      g.rect(87, 110, T, 36),                 // right throat guide
      g.rect(64, 104, 44, 44, { sensor: true, behavior: { type: 'sensor', name: 'funnel' } }),
    ],
  },
  {
    id: 'tube', name: 'Tube', cells: [1, 2], role: 'structure',
    rotatable: true, rotations: 2, // symmetric: half a turn looks the same
    build: () => [g.rect(8, 64, 16, 128), g.rect(56, 64, 16, 128)],
  },
  {
    id: 'loop', name: 'Loop', cells: [2, 2], role: 'curve',
    rotatable: false,
    // a marble inside apexRadius of the centre, past the top on the
    // upper-left side, has lapped: the gate opens for it until it is
    // exitWindow px (horizontally) clear of the centre
    loop: { center: [64, 68], apexRadius: 55, exitWindow: 72 },
    build: () => [
      // ground track at standard bottom-row surface height (64 + 52).
      // Powered as a rightward conveyor: the post-lap landing bounce eats
      // nearly all of a marble's speed and points it randomly, so the floor
      // herds marbles toward the right-hand exit — into the scoop on the
      // way in, out of the piece after the lap.
      g.bar(0, 116, 128, 116, T, { behavior: { type: 'push', dir: [1, 0] } }),
      // arc leaves the left-bottom sector open: marbles enter along the
      // ground, sweep up the right side, and exit the arc end on the left.
      // Center y = 116 - 48 makes the arc's inner bottom tangent to the
      // ground (no lip), and keeps the outer shell inside the footprint.
      // The 170° start keeps the entry corridor tall enough that marbles
      // arriving on the ground or airborne pass cleanly under the arc end.
      // The arc is powered (boost, see behaviors.js): segmented chains bleed
      // marble energy far too fast for a passive loop to be completable,
      // so the loop gives riders a gentle motorized push.
      // The bottom-right scoop is a one-way gate: solid on the way in, but
      // once a marble has passed the apex behaviors.js lets it roll straight
      // through and exit the piece on the right at track height.
      ...g.arcChain(64, 68, 48, (170 / 180) * Math.PI, (375 / 180) * Math.PI, 16, 16, { friction: 0.001, behavior: { type: 'boost' } }),
      ...g.arcChain(64, 68, 48, (375 / 180) * Math.PI, (455 / 180) * Math.PI, 6, 16, { friction: 0.001, behavior: { type: 'gate' } }),
    ],
  },
  {
    id: 'escalator', name: 'Escalator', cells: [2, 2], role: 'mover',
    rotatable: false, hasMirror: true,
    // conveyor ramp: carries marbles from the bottom-left corner up to the
    // top-right, against gravity. Entry is at bottom-row track height; the
    // exit matches a ramp start.
    build: () => [
      g.bar(0, 116, 128, 12, T, { behavior: { type: 'push', dir: [0.78, -0.63] }, friction: 0.005 }),
    ],
  },
  {
    id: 'lift', name: 'Lift', cells: [1, 2], role: 'mover',
    rotatable: false, hasMirror: true,
    // vacuum elevator: marbles roll in the bottom-left doorway at track
    // height, the shaft field floats them up, and the sloped cap slides
    // them out the opening at the top-right
    build: () => [
      g.rect(8, 34, 16, 68),    // left wall; the tall doorway below it
                                // admits both rolling marbles and the
                                // flying exit of a neighboring lift
      g.rect(56, 93, 16, 70),   // right wall, exit opening above it (top at
                                // 46 leaves a 26px corridor under the cap)
      // the wall's top ledge is a conveyor: slow risers that settle on it
      // (out of the cap's reach) get shoved out the exit instead of parking
      g.rect(56, 52, 16, 12, { behavior: { type: 'push', dir: [1, 0] } }),
      // floor at bottom-row track height; a rightward conveyor so
      // entrants get herded into the field with no dead zone
      g.rect(32, 122, 64, 12, { behavior: { type: 'push', dir: [1, 0] } }),
      // cap rises toward the exit and doubles as a conveyor that slides
      // risers out through the top-right opening; it reaches the piece edge
      // so slow risers get carried across the right wall's top ledge
      // instead of stalling on it
      g.bar(0, 24, 64, 6, 12, { behavior: { type: 'push', dir: [1, -0.25] } }),
      // field reaches the right edge: it must carry marbles across the
      // whole exit corridor, or they dither forever at the field boundary.
      // Its left edge is inset past the wall by a marble radius, so a
      // marble tucked under the wall can't be pinned against its underside
      g.rect(45, 62, 38, 108, { sensor: true, behavior: { type: 'push', dir: [0, -1] } }),
    ],
  },
  {
    id: 'cannon', name: 'Cannon', cells: [1, 1], role: 'launch',
    rotatable: false, hasMirror: true,
    // catch bowl + launcher: any marble that falls in gets fired high
    // toward the upper right (launch sets an absolute velocity)
    build: () => [
      g.bar(0, 20, 26, 46, 10),
      g.bar(38, 46, 64, 20, 10),
      g.circle(32, 46, 8, { sensor: true, behavior: { type: 'launch', vel: [4, -10.5] } }),
    ],
  },
  {
    id: 'stairs', name: 'Stairs', cells: [2, 2], role: 'track',
    rotatable: true, hasMirror: true,
    build: () => [
      g.rect(17, 38, 36, T),
      g.rect(49, 66, 36, T),
      g.rect(81, 94, 36, T),
      g.rect(113, 122, 36, T),
    ],
  },
  {
    id: 'spinner', name: 'Spinner', cells: [2, 2], role: 'spinner',
    rotatable: false,
    // a 2-arm propeller: a 4-arm cross cradles marbles in the V between
    // its upper arms, but a single bar always tips and lets them through.
    // The round hub is physical — marbles can't balance on its peak.
    dynamic: { pivot: [64, 64], frictionAir: 0.01, density: 0.0008, angle0: Math.PI / 5 },
    build: () => [g.rect(64, 64, 116, T), g.circle(64, 64, 12)],
  },
  {
    id: 'seesaw', name: 'Seesaw', cells: [2, 1], role: 'spinner',
    rotatable: false,
    // maxTilt: the plank stops at about 26° either way, like a seesaw
    // hitting the ground, instead of swinging round into a slide
    dynamic: { pivot: [64, 34], frictionAir: 0.02, density: 0.0012, maxTilt: 0.45 },
    build: () => [g.rect(64, 34, 118, 10)],
  },
  {
    id: 'bumper', name: 'Bumper', cells: [1, 1], role: 'bounce',
    rotatable: false,
    build: () => [g.circle(32, 32, 20, { restitution: 1.3, behavior: { type: 'bounce', sound: 'bumper' } })],
  },
  {
    id: 'tramp', name: 'Bouncer', cells: [1, 1], role: 'bounce',
    rotatable: true,
    build: () => [g.rect(32, 56, 56, T, { restitution: 1.35, behavior: { type: 'bounce', sound: 'tramp' } })],
  },
  {
    id: 'bell', name: 'Bell', cells: [1, 1], role: 'bell',
    rotatable: false,
    build: () => [
      g.circle(32, 28, 16, { behavior: { type: 'chime', note: '*' } }),
      g.rect(32, 52, 8, 26), // post
    ],
  },
  {
    id: 'xylo1', name: 'Ding E', cells: [1, 1], role: 'bar',
    rotatable: true,
    build: () => [g.rect(32, 54, 58, 10, { behavior: { type: 'chime', note: '659.25' } })],
  },
  {
    id: 'xylo2', name: 'Ding G', cells: [1, 1], role: 'bar',
    rotatable: true,
    build: () => [g.rect(32, 54, 58, 10, { behavior: { type: 'chime', note: '783.99' } })],
  },
  {
    id: 'xylo3', name: 'Ding A', cells: [1, 1], role: 'bar',
    rotatable: true,
    build: () => [g.rect(32, 54, 58, 10, { behavior: { type: 'chime', note: '880' } })],
  },
  {
    id: 'peg', name: 'Peg', cells: [1, 1], role: 'structure',
    rotatable: false,
    build: () => [g.circle(32, 32, 8)],
  },
  {
    id: 'block', name: 'Block', cells: [1, 1], role: 'structure',
    rotatable: false,
    build: () => [g.rect(32, 32, 64, 64)],
  },
  {
    id: 'half', name: 'Half', cells: [1, 1], role: 'structure',
    rotatable: true,
    build: () => [g.rect(32, 48, 64, 32)],
  },
  {
    id: 'basket', name: 'Basket', cells: [1, 1], role: 'basket',
    rotatable: false,
    build: () => [
      g.rect(32, 58, 60, T),
      g.rect(8, 42, T, 44),
      g.rect(56, 42, T, 44),
      g.circle(32, 44, 13, { sensor: true, behavior: { type: 'sensor', name: 'basket' } }),
    ],
  },
  {
    id: 'windmill', name: 'Windmill', cells: [1, 1], role: 'spinner',
    rotatable: false,
    dynamic: { pivot: [32, 32], frictionAir: 0.01, density: 0.0005, angle0: Math.PI / 5 },
    build: () => [g.rect(32, 32, 56, 8), g.circle(32, 32, 8)],
  },
];

export const BY_ID = Object.fromEntries(CATALOG.map(e => [e.id, e]));

/** Tray listing: every catalog entry, plus mirrored twins for directional pieces. */
export const TRAY_ITEMS = CATALOG.flatMap(e =>
  e.hasMirror ? [{ type: e.id, flip: 0 }, { type: e.id, flip: 1 }] : [{ type: e.id, flip: 0 }]
);
