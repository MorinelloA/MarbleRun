// @ts-check
// Small player preferences (mute, first-run flags) in localStorage. Every
// access is guarded: private browsing or full storage must never break play.

const PREFIX = 'marblerun:pref:';

export function getPref(name, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setPref(name, value) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // storage unavailable: the preference lasts for this visit only
  }
}
