// @ts-check
// Six designed starter tracks for the splash screen. Each lists its
// pieces plus a few marble spawn points so the run comes alive the
// moment it loads.
//
// `expect` is checked by the headless harness (tests/sim/run.mjs --check):
// what a run of the preset must do, so the cards keep their promises.
//   seconds, extra, every  how long to run; extra marbles dropped every N s
//   reach                  piece types that must be touched at least once
//   reachAll / ignore      every piece must be touched, except those listed
//   lapsEach / minLaps     loop laps per spawn marble / in total
//   noLeaks                no marble may reach the floor or escape
//   maxStallS              longest a marble may sit still mid-course
//   minInBasket            marbles that must end the run in a basket

export const PRESETS = [
  {
    id: 'cascade',
    name: 'Big Cascade',
    blurb: 'Race down the mountain!',
    spawn: [[110, 20], [130, 50]],
    pieces: [
      { t: 'ramp', c: 1, r: 0 }, { t: 'ramp', c: 2, r: 1 },
      { t: 'ramp', c: 3, r: 2 }, { t: 'ramp', c: 4, r: 3 },
      { t: 'zigzag', c: 5, r: 4 },
      { t: 'ramp', c: 4, r: 6, f: 1 }, { t: 'ramp', c: 3, r: 7, f: 1 },
      // the run comes down to the left: the bell sits where it lands, and
      // the basket catches the bounce
      { t: 'bell', c: 2, r: 8 }, { t: 'basket', c: 1, r: 8 }, { t: 'xylo1', c: 0, r: 8 },
    ],
    expect: { seconds: 30, reachAll: true, maxStallS: 3 },
  },
  {
    id: 'zigzagfalls',
    name: 'Zigzag Falls',
    blurb: 'Back and forth all the way down',
    spawn: [[420, 20], [440, 50]],
    pieces: [
      { t: 'zigzag', c: 6, r: 0 },
      { t: 'zigzag', c: 4, r: 2, f: 1 },
      { t: 'zigzag', c: 6, r: 4 },
      // the last zigzag lets marbles out on the left, onto a row of bars
      // they roll across, then into the basket below the end
      { t: 'xylo1', c: 5, r: 6 }, { t: 'xylo2', c: 4, r: 6 }, { t: 'xylo3', c: 3, r: 6 },
      { t: 'basket', c: 2, r: 7 },
    ],
    expect: { seconds: 30, reachAll: true, maxStallS: 3, minInBasket: 2 },
  },
  {
    id: 'loopcity',
    name: 'Loop City',
    blurb: 'Around the loop — if you dare!',
    spawn: [[45, 15], [85, 15]],
    pieces: [
      // ramp cascade builds speed; the flat straights let the marble's
      // landing bounces settle out so it reaches the loop mouth rolling
      { t: 'ramp', c: 0, r: 0 }, { t: 'ramp', c: 1, r: 1 }, { t: 'ramp', c: 2, r: 2 },
      { t: 'ramp', c: 3, r: 3 }, { t: 'ramp', c: 4, r: 4 },
      { t: 'straight', c: 5, r: 5 }, { t: 'straight', c: 6, r: 5 },
      // back to back, so the first loop's powered floor hands marbles
      // straight to the second (a plain straight between them let slow
      // marbles coast to a stop)
      { t: 'loop', c: 7, r: 4 }, { t: 'loop', c: 9, r: 4 },
      { t: 'straight', c: 11, r: 5 }, { t: 'straight', c: 12, r: 5 },
      // the block stops the fast exit; marbles drop past the bell onto
      // the bars and into the basket
      { t: 'block', c: 14, r: 5 },
      { t: 'bell', c: 13, r: 7 },
      { t: 'xylo1', c: 11, r: 8 }, { t: 'xylo2', c: 12, r: 8 }, { t: 'xylo3', c: 13, r: 8 },
      { t: 'basket', c: 14, r: 8 },
    ],
    expect: { seconds: 40, lapsEach: 2, reach: ['bell', 'xylo1', 'xylo2', 'xylo3', 'basket'], maxStallS: 3 },
  },
  {
    id: 'roundandround',
    name: 'Round & Round',
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
      // catchers for the rare shot that flies too far: over the top-left
      // (back onto the cascade), over the tower (back onto its roof), and
      // down beside the loop (instead of wedging against the lift)
      { t: 'ramp', c: 0, r: 1 },
      { t: 'ramp', c: 13, r: 0, f: 1 },
      { t: 'ramp', c: 6, r: 3, f: 1 },
    ],
    expect: {
      seconds: 240, extra: 10, every: 1.5,
      noLeaks: true, maxStallS: 6, minLaps: 200,
      ignore: ['ramp@0,1', 'ramp@13,0f', 'ramp@6,3f'],
    },
  },
  {
    id: 'musicmountain',
    name: 'Music Mountain',
    blurb: 'Plinko pegs and chimes',
    spawn: [[502, 130], [500, 100]],
    pieces: [
      // a dropper, not a funnel: a funnel's throat sits on a cell edge,
      // exactly between peg columns, so its marbles never touched a peg;
      // the dropper's chute is centred over the top peg
      { t: 'dropper', c: 7, r: 1 },
      { t: 'peg', c: 7, r: 3 },
      { t: 'peg', c: 6, r: 4 }, { t: 'peg', c: 8, r: 4 },
      { t: 'peg', c: 5, r: 5 }, { t: 'peg', c: 9, r: 5 },
      { t: 'bell', c: 6, r: 6, n: 4 }, { t: 'bell', c: 8, r: 6, n: 7 },
      { t: 'basket', c: 4, r: 8 },
      { t: 'xylo1', c: 5, r: 8 }, { t: 'xylo2', c: 6, r: 8 }, { t: 'xylo3', c: 7, r: 8 },
      { t: 'xylo2', c: 8, r: 8 }, { t: 'xylo1', c: 9, r: 8 },
      { t: 'basket', c: 10, r: 8 },
    ],
    expect: { seconds: 40, extra: 10, every: 2, reach: ['peg', 'bell', 'xylo1', 'xylo2', 'xylo3'], maxStallS: 3 },
  },
  {
    id: 'spinfactory',
    name: 'Spin Factory',
    blurb: 'Whirling wheels and seesaws',
    spawn: [[110, 20], [150, 50]],
    pieces: [
      { t: 'ramp', c: 1, r: 0 }, { t: 'ramp', c: 2, r: 1 },
      { t: 'spinner', c: 3, r: 2 },
      { t: 'seesaw', c: 5, r: 5 },
      { t: 'windmill', c: 8, r: 6 },
      { t: 'spinner', c: 9, r: 6 },
      // two bouncers catch both ways a marble leaves the spinner
      { t: 'tramp', c: 9, r: 8 }, { t: 'tramp', c: 10, r: 8 },
      { t: 'bell', c: 12, r: 8 },
      { t: 'bumper', c: 14, r: 8 },
    ],
    expect: { seconds: 40, extra: 6, every: 3, reachAll: true, maxStallS: 3 },
  },
  {
    id: 'fairshare',
    name: 'Fair Share',
    blurb: 'A flip-flop deals marbles left and right',
    spawn: [[566, 20]],
    pieces: [
      // the funnel centres every marble on the flip-flop, which drops them
      // out of its left and right chutes in turn
      { t: 'dropper', c: 8, r: 0 },
      { t: 'funnel', c: 7, r: 1 },
      { t: 'flipflop', c: 7, r: 3 },
      // each side: a ramp, a belt that settles the marble's speed, a gate
      // that won't let it back, one more ramp, two cells of belt (enough to
      // slow it from the ramp), and a goal cup that counts it in
      { t: 'ramp', c: 7, r: 4, f: 1 }, { t: 'conveyor', c: 6, r: 4, f: 1 }, { t: 'gate', c: 5, r: 4, f: 1 },
      { t: 'ramp', c: 4, r: 5, f: 1 }, { t: 'conveyor', c: 3, r: 5, f: 1 }, { t: 'conveyor', c: 2, r: 5, f: 1 },
      { t: 'goal', c: 1, r: 6 },
      { t: 'ramp', c: 8, r: 4 }, { t: 'conveyor', c: 9, r: 4 }, { t: 'gate', c: 10, r: 4 },
      { t: 'ramp', c: 11, r: 5 }, { t: 'conveyor', c: 12, r: 5 }, { t: 'conveyor', c: 13, r: 5 },
      { t: 'goal', c: 14, r: 6 },
    ],
    expect: {
      seconds: 40, extra: 6, every: 3,
      goalsEach: 3, minFlips: 6, minPasses: 6, noLeaks: true, maxStallS: 3,
    },
  },
  {
    id: 'melodylane',
    name: 'Melody Lane',
    blurb: 'Do re mi up the scale, and back down',
    spawn: [[118, 70], [1014, 276]],
    pieces: [
      // up: a steep start gives a marble the speed to roll the whole row of
      // bars, do re mi fa so la ti do; a block behind the cup stops fliers.
      // (A taller start doesn't help: faster marbles hop over bars.)
      { t: 'dropper', c: 1, r: 0 },
      { t: 'steep', c: 1, r: 1 }, { t: 'ramp', c: 2, r: 3 },
      { t: 'xylo1', c: 3, r: 3, n: 0 }, { t: 'xylo1', c: 4, r: 3, n: 1 }, { t: 'xylo1', c: 5, r: 3, n: 2 },
      { t: 'xylo1', c: 6, r: 3, n: 3 }, { t: 'xylo1', c: 7, r: 3, n: 4 }, { t: 'xylo1', c: 8, r: 3, n: 5 },
      { t: 'xylo1', c: 9, r: 3, n: 6 }, { t: 'xylo1', c: 10, r: 3, n: 7 },
      { t: 'goal', c: 11, r: 4 }, { t: 'block', c: 12, r: 3 }, { t: 'block', c: 12, r: 4 },
      // and down: the same run mirrored, the marble button taking turns
      { t: 'dropper', c: 15, r: 3 },
      { t: 'steep', c: 15, r: 4, f: 1 }, { t: 'ramp', c: 14, r: 6, f: 1 },
      { t: 'xylo1', c: 13, r: 6, n: 7 }, { t: 'xylo1', c: 12, r: 6, n: 6 }, { t: 'xylo1', c: 11, r: 6, n: 5 },
      { t: 'xylo1', c: 10, r: 6, n: 4 }, { t: 'xylo1', c: 9, r: 6, n: 3 }, { t: 'xylo1', c: 8, r: 6, n: 2 },
      { t: 'xylo1', c: 7, r: 6, n: 1 }, { t: 'xylo1', c: 6, r: 6, n: 0 },
      { t: 'goal', c: 5, r: 7 }, { t: 'block', c: 4, r: 6 }, { t: 'block', c: 4, r: 7 },
    ],
    expect: {
      seconds: 30, extra: 4, every: 4,
      reachAll: true, ignore: ['dropper', 'block'], goalsEach: 3, maxStallS: 3,
    },
  },
];
