// @ts-check
// The notes a music piece (a bar or a bell) can be tuned to: the C major
// scale, C5 up to C6, do re mi fa so la ti do. Each pitch is worked out from
// A4 = 440 Hz in equal temperament, so the bars are in tune with anything.
// Tapping a music piece steps through them. Each note has its own colour
// (theme.js) and a dot count, so notes can be told apart without colour.

/** Equal-tempered pitch of a MIDI note (69 is A4, 440 Hz). */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export const NOTES = [
  { name: 'C', hz: hz(72) },
  { name: 'D', hz: hz(74) },
  { name: 'E', hz: hz(76) },
  { name: 'F', hz: hz(77) },
  { name: 'G', hz: hz(79) },
  { name: 'A', hz: hz(81) },
  { name: 'B', hz: hz(83) },
  { name: 'High C', hz: hz(84) },
];

/** Saves before format 3 and links before format 2 numbered the notes of
 *  the old pentatonic set, C D E G A C: where each one sits now. */
export const FROM_PENTATONIC = [0, 1, 2, 4, 5, 7];

/** A valid note index, or the fallback. */
export function noteIndex(n, fallback) {
  return Number.isInteger(n) && n >= 0 && n < NOTES.length ? n : fallback;
}
