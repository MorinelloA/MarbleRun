// @ts-check
// The notes a music piece (a bar or a bell) can be tuned to: C major
// pentatonic, C5 up to C6, so any order of notes sounds good together.
// Tapping a music piece steps through them. Each note has its own colour
// (theme.js) and a dot count, so notes can be told apart without colour.

export const NOTES = [
  { name: 'C', hz: 523.25 },
  { name: 'D', hz: 587.33 },
  { name: 'E', hz: 659.25 },
  { name: 'G', hz: 783.99 },
  { name: 'A', hz: 880 },
  { name: 'C', hz: 1046.5 },
];

/** A valid note index, or the fallback. */
export function noteIndex(n, fallback) {
  return Number.isInteger(n) && n >= 0 && n < NOTES.length ? n : fallback;
}
