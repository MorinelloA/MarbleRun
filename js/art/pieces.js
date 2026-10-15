// @ts-check
// Art for each piece type, keyed by catalog id.
//   mode     where it is drawn:
//              static   once, into the cached board layer
//              overlay  a cached base plus overlay() every frame
//              live     every frame (pieces that react when hit)
//              dynamic  every frame, following the physics body
//   draw(g, piece, t)     paints the piece in its entry's own coordinates
//   overlay(g, piece, t)  the per-frame layer of an overlay piece
// For now every piece uses the original look.

import { CATALOG } from '../pieces/catalog.js';
import { legacyArt } from './legacy.js';

/** @type {Record<string, {mode: string, draw: Function, overlay?: Function}>} */
export const ART = Object.fromEntries(CATALOG.map(e => [e.id, legacyArt(e)]));

export const MODES = ['static', 'overlay', 'live', 'dynamic'];
