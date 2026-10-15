// @ts-check
// Five designed starter tracks for the splash screen. Each lists its
// pieces plus a few marble spawn points so the run comes alive the
// moment it loads.

export const PRESETS = [
  {
    id: 'cascade',
    name: 'Big Cascade',
    emoji: '🏔️',
    blurb: 'Race down the mountain!',
    spawn: [[110, 20], [130, 50]],
    pieces: [
      { t: 'ramp', c: 1, r: 0 }, { t: 'ramp', c: 2, r: 1 },
      { t: 'ramp', c: 3, r: 2 }, { t: 'ramp', c: 4, r: 3 },
      { t: 'zigzag', c: 5, r: 4 },
      { t: 'ramp', c: 4, r: 6, f: 1 }, { t: 'ramp', c: 3, r: 7, f: 1 },
      { t: 'ramp', c: 2, r: 8, f: 1 },
      { t: 'xylo3', c: 1, r: 8 }, { t: 'xylo1', c: 0, r: 8 },
      { t: 'bell', c: 6, r: 6 },
      { t: 'bumper', c: 8, r: 7 },
      { t: 'basket', c: 10, r: 8 },
    ],
  },
  {
    id: 'zigzagfalls',
    name: 'Zigzag Falls',
    emoji: '🌊',
    blurb: 'Back and forth all the way down',
    spawn: [[420, 20], [440, 50]],
    pieces: [
      { t: 'zigzag', c: 6, r: 0 },
      { t: 'zigzag', c: 4, r: 2, f: 1 },
      { t: 'zigzag', c: 6, r: 4 },
      { t: 'zigzag', c: 4, r: 6, f: 1 },
      { t: 'xylo1', c: 7, r: 8 }, { t: 'xylo2', c: 8, r: 8 }, { t: 'xylo3', c: 9, r: 8 },
      { t: 'basket', c: 10, r: 8 },
      { t: 'bell', c: 3, r: 4 },
      { t: 'bumper', c: 11, r: 5 },
    ],
  },
  {
    id: 'loopcity',
    name: 'Loop City',
    emoji: '🎢',
    blurb: 'Around the loop — if you dare!',
    spawn: [[45, 15], [85, 15]],
    pieces: [
      // ramp cascade builds speed; the flat straights let the marble's
      // landing bounces settle out so it reaches the loop mouth rolling
      { t: 'ramp', c: 0, r: 0 }, { t: 'ramp', c: 1, r: 1 }, { t: 'ramp', c: 2, r: 2 },
      { t: 'ramp', c: 3, r: 3 }, { t: 'ramp', c: 4, r: 4 },
      { t: 'straight', c: 5, r: 5 }, { t: 'straight', c: 6, r: 5 },
      // loops pass marbles through to the right after a lap, so they chain:
      // each loop's ground row is its second row, level with the straights
      { t: 'loop', c: 7, r: 4 },
      { t: 'straight', c: 9, r: 5 },
      { t: 'loop', c: 10, r: 4 },
      { t: 'straight', c: 12, r: 5 },
      // marbles launch off the last straight — bumper mid-flight, then the
      // music row and basket catch them coming down on the right
      { t: 'bumper', c: 14, r: 6 },
      { t: 'bell', c: 12, r: 8 },
      { t: 'xylo1', c: 13, r: 8 }, { t: 'xylo2', c: 14, r: 8 }, { t: 'xylo3', c: 15, r: 8 },
      { t: 'basket', c: 16, r: 8 },
    ],
  },
  {
    id: 'roundandround',
    name: 'Round & Round',
    emoji: '🔁',
    blurb: 'A course that never ends!',
    spawn: [[112, 10]],
    pieces: [
      // start: dropper feeds a cascade into the loop
      { t: 'dropper', c: 1, r: 0 },
      { t: 'ramp', c: 1, r: 2 }, { t: 'ramp', c: 2, r: 3 },
      { t: 'ramp', c: 3, r: 4 }, { t: 'ramp', c: 4, r: 5 },
      { t: 'loop', c: 5, r: 4 },
      // the loop's powered floor hands marbles directly into the lift
      // doorway next door — no bottom flats for anything to park on
      { t: 'lift', c: 7, r: 4 }, { t: 'lift', c: 8, r: 3 },
      // the upper lift's exit arcs down into the cannon battery — three
      // adjoining bowls cover the whole drop zone (slow flyers land near,
      // fast ones ricochet off the block tower into the far bowl); all
      // fire the marble back over the stack toward the return escalator
      { t: 'cannon', c: 9, r: 4, f: 1 }, { t: 'cannon', c: 10, r: 4, f: 1 },
      { t: 'cannon', c: 11, r: 4, f: 1 },
      { t: 'block', c: 12, r: 2 }, { t: 'block', c: 12, r: 3 }, { t: 'block', c: 12, r: 4 },
      // roof ramp: stray hops that land on the tower roll back into the bowl
      { t: 'ramp', c: 12, r: 1, f: 1 },
      // return lane: the mirrored escalator's slope sits under the cannon
      // arcs' landing zone and conveys the marble up-left, then the lane
      // drops it back onto the cascade above the loop
      { t: 'escalator', c: 7, r: 1, f: 1 },
      { t: 'straight', c: 6, r: 2 },
      { t: 'ramp', c: 5, r: 3, f: 1 },
    ],
  },
  {
    id: 'musicmountain',
    name: 'Music Mountain',
    emoji: '🎵',
    blurb: 'Plinko pegs and chimes',
    spawn: [[520, 15], [560, 40], [540, 70]],
    pieces: [
      { t: 'funnel', c: 7, r: 0 },
      { t: 'peg', c: 6, r: 2 }, { t: 'peg', c: 8, r: 2 },
      { t: 'peg', c: 5, r: 3 }, { t: 'peg', c: 7, r: 3 }, { t: 'peg', c: 9, r: 3 },
      { t: 'peg', c: 6, r: 4 }, { t: 'peg', c: 8, r: 4 },
      { t: 'peg', c: 5, r: 5 }, { t: 'peg', c: 7, r: 5 }, { t: 'peg', c: 9, r: 5 },
      { t: 'bell', c: 4, r: 6 }, { t: 'bell', c: 10, r: 6 },
      { t: 'xylo1', c: 5, r: 8 }, { t: 'xylo2', c: 6, r: 8 }, { t: 'xylo3', c: 7, r: 8 },
      { t: 'xylo2', c: 8, r: 8 }, { t: 'xylo1', c: 9, r: 8 },
      { t: 'basket', c: 3, r: 8 }, { t: 'basket', c: 11, r: 8 },
    ],
  },
  {
    id: 'spinfactory',
    name: 'Spin Factory',
    emoji: '⚙️',
    blurb: 'Whirling wheels and seesaws',
    spawn: [[110, 20], [150, 50]],
    pieces: [
      { t: 'ramp', c: 1, r: 0 }, { t: 'ramp', c: 2, r: 1 },
      { t: 'spinner', c: 3, r: 2 },
      { t: 'seesaw', c: 5, r: 5 },
      { t: 'windmill', c: 8, r: 5 },
      { t: 'spinner', c: 9, r: 6 },
      { t: 'uturn', c: 1, r: 6 },
      { t: 'tramp', c: 7, r: 8 },
      { t: 'bumper', c: 12, r: 7 },
      { t: 'bell', c: 11, r: 4 },
      { t: 'basket', c: 14, r: 8 },
    ],
  },
];
