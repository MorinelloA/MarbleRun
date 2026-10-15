// Ambient types for editor checking (jsconfig.json). Nothing here ships.
// lib is capped at ES2021 so newer-than-Safari-15 built-ins (.at(),
// Object.hasOwn) show up as errors.

interface Window {
  /** Matter.js 0.20, loaded as a classic script from vendor/. Untyped. */
  Matter: any;
  webkitAudioContext?: typeof AudioContext;
  /** Debug/test handle; tonyt908.com's capture tools drive it too. */
  __mr?: any;
}

interface Navigator {
  /** Safari 16.4+: 'playback' lets audio play with the silent switch on. */
  audioSession?: { type: string };
}
