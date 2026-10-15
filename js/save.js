// @ts-check
// localStorage persistence: versioned save documents, saved-run slots, an
// autosave of the board being built, and a short ring of backups taken
// whenever a build gets replaced. Every stored document goes through
// parseDoc() on the way in, so a damaged or hand-edited save can't crash
// the game.

import { board } from './board.js';
import { BY_ID } from './pieces/catalog.js';

const VERSION = 1;
const MAX_BACKUPS = 5;
const MAX_NAME = 60;
const MAX_THUMB = 120000; // characters of data URL

const KEY = {
  autosave: 'marblerun:autosave',
  slots: 'marblerun:slots',
  slot: (id) => `marblerun:slot:${id}`,
  backups: 'marblerun:backups',
};
const LEGACY = {
  autosave: 'mr.autosave',
  slots: 'mr.slots',
  slot: (id) => `mr.slot.${id}`,
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** @returns {boolean} false when storage is full or unavailable */
function write(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('localStorage write failed:', err);
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* unavailable */ }
}

function readIds() {
  const ids = read(KEY.slots);
  return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
}

/**
 * Validate (and upgrade) a stored or shared board document.
 * @returns {null | {v:number, name:string, ts:number, thumb:string|null, pieces:{t:string,c:number,r:number,rot:number,f:number}[]}}
 */
export function parseDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw.v === undefined ? 1 : raw.v;
  if (v !== VERSION) return null;
  if (!Array.isArray(raw.pieces)) return null;
  const pieces = [];
  for (const p of raw.pieces) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.t !== 'string' || !Object.prototype.hasOwnProperty.call(BY_ID, p.t)) continue;
    if (!Number.isInteger(p.c) || !Number.isInteger(p.r)) continue;
    const rot = Number.isInteger(p.rot) ? ((p.rot % 4) + 4) % 4 : 0;
    pieces.push({ t: p.t, c: p.c, r: p.r, rot, f: p.f ? 1 : 0 });
  }
  const thumb = typeof raw.thumb === 'string' && /^data:image\/(jpeg|png);base64,/.test(raw.thumb) &&
    raw.thumb.length <= MAX_THUMB ? raw.thumb : null;
  return {
    v: VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_NAME) : 'Marble Run',
    ts: Number.isFinite(raw.ts) ? raw.ts : Date.now(),
    thumb,
    pieces,
  };
}

export function makeDoc(name, thumb) {
  return { v: VERSION, name, ts: Date.now(), thumb, pieces: board.serialize() };
}

/**
 * Move saves from the old un-namespaced keys (shared with every app on the
 * same site) to `marblerun:` keys, once. Old keys are removed only after
 * their copy was written.
 */
export function migrateLegacyKeys() {
  if (read(KEY.slots) !== null || read(KEY.autosave) !== null) return;
  const legacyIds = read(LEGACY.slots);
  const auto = parseDoc(read(LEGACY.autosave));
  if (auto && write(KEY.autosave, auto)) remove(LEGACY.autosave);
  const kept = [];
  if (Array.isArray(legacyIds)) {
    for (const id of legacyIds) {
      if (typeof id !== 'string') continue;
      const doc = parseDoc(read(LEGACY.slot(id)));
      if (doc && write(KEY.slot(id), doc)) {
        kept.push(id);
        remove(LEGACY.slot(id));
      }
    }
  }
  if (write(KEY.slots, kept) && Array.isArray(legacyIds) && kept.length === legacyIds.length) {
    remove(LEGACY.slots);
  }
}
migrateLegacyKeys();

// ---- autosave: written only after the player changes the board ----
let autosaveTimer = 0;
let pending = false;

export function scheduleAutosave() {
  pending = true;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, 1000);
}

/** Write a pending autosave now (tab hidden, page closing, board replaced). */
export function flushAutosave() {
  clearTimeout(autosaveTimer);
  if (!pending) return;
  pending = false;
  write(KEY.autosave, makeDoc('autosave', null));
}

export function readAutosave() {
  const doc = parseDoc(read(KEY.autosave));
  // an empty board falls through to the start screen's other choices
  return doc && doc.pieces.length ? doc : null;
}

// ---- backups of replaced builds ----
export function pushBackup(pieces) {
  if (!pieces.length) return;
  const list = listBackups();
  if (list.length && board.signature(list[0].pieces) === board.signature(pieces)) return;
  list.unshift({ v: VERSION, name: 'Earlier board', ts: Date.now(), thumb: null, pieces });
  write(KEY.backups, list.slice(0, MAX_BACKUPS));
}

export function listBackups() {
  const list = read(KEY.backups);
  return Array.isArray(list) ? list.map(parseDoc).filter(Boolean) : [];
}

// ---- slots ----
export function listSlots() {
  return readIds()
    .map(id => {
      const doc = parseDoc(read(KEY.slot(id)));
      return doc ? { id, doc } : null;
    })
    .filter(Boolean);
}

export function saveSlot(name, thumb) {
  const id = `s${Date.now().toString(36)}`;
  if (!write(KEY.slot(id), makeDoc(name, thumb))) return null;
  const ids = readIds();
  ids.unshift(id);
  write(KEY.slots, ids);
  return id;
}

export function deleteSlot(id) {
  remove(KEY.slot(id));
  write(KEY.slots, readIds().filter(x => x !== id));
}

/** "Marble Run N" with the first N not already taken. */
export function nextDefaultName() {
  const taken = new Set(listSlots().map(s => s.doc.name));
  let n = 1;
  while (taken.has(`Marble Run ${n}`)) n++;
  return `Marble Run ${n}`;
}
