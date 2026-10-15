// Loads the game's physics modules in Node. The game reads `window.Matter`
// at module top level, so the vendored UMD build is evaluated first and
// exposed on a stand-in `window` before anything is imported.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function rootUrl(rel) {
  return pathToFileURL(path.join(ROOT, rel)).href;
}

let loaded = null;

export async function loadGame() {
  if (loaded) return loaded;
  const src = readFileSync(path.join(ROOT, 'vendor', 'matter.min.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  const Matter = mod.exports;
  globalThis.window = Object.assign(globalThis.window || {}, { Matter });

  const config = await import(rootUrl('js/config.js'));
  const world = await import(rootUrl('js/world.js'));
  const board = await import(rootUrl('js/board.js'));
  const actions = await import(rootUrl('js/actions.js'));
  const presets = await import(rootUrl('js/presets.js'));
  const catalog = await import(rootUrl('js/pieces/catalog.js'));
  loaded = { Matter, config, world, board, actions, presets, catalog };
  return loaded;
}
