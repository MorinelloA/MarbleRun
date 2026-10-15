// @ts-check
// localStorage persistence: versioned save docs, slot management,
// debounced autosave, canvas thumbnails.

import { board } from './board.js';

const AUTOSAVE_KEY = 'mr.autosave';
const SLOTS_KEY = 'mr.slots';
const SLOT_PREFIX = 'mr.slot.';
const VERSION = 1;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** @returns {boolean} false on quota error */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('localStorage write failed:', err);
    return false;
  }
}

export function makeDoc(name, thumb) {
  return { v: VERSION, name, ts: Date.now(), thumb, pieces: board.serialize() };
}

// ---- autosave ----
let autosaveTimer = 0;
export function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    write(AUTOSAVE_KEY, makeDoc('autosave', null));
  }, 1000);
}
export function readAutosave() {
  const doc = read(AUTOSAVE_KEY);
  // an empty board falls through to the starter layout
  return doc && Array.isArray(doc.pieces) && doc.pieces.length ? doc : null;
}

// ---- slots ----
export function listSlots() {
  const ids = read(SLOTS_KEY) || [];
  return ids
    .map(id => {
      const doc = read(SLOT_PREFIX + id);
      return doc ? { id, doc } : null;
    })
    .filter(Boolean);
}

export function saveSlot(name, thumb) {
  const id = `s${Date.now().toString(36)}`;
  const ok = write(SLOT_PREFIX + id, makeDoc(name, thumb));
  if (!ok) return null;
  const ids = read(SLOTS_KEY) || [];
  ids.unshift(id);
  write(SLOTS_KEY, ids);
  return id;
}

export function loadSlot(id) {
  return read(SLOT_PREFIX + id);
}

export function deleteSlot(id) {
  localStorage.removeItem(SLOT_PREFIX + id);
  const ids = (read(SLOTS_KEY) || []).filter(x => x !== id);
  write(SLOTS_KEY, ids);
}

export function nextDefaultName() {
  const n = listSlots().length + 1;
  return `Marble Run ${n}`;
}
