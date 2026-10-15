// @ts-check
// One-line messages: a pill above the tray, with an optional action
// button (Undo).

const el = /** @type {HTMLElement} */ (document.getElementById('toast'));
let timer = 0;
let canAct = () => true;

/** Actions wait while this says no (a piece being dragged: an Undo then
 *  would put back a copy of it). */
export function setActionGuard(fn) { canAct = fn; }

/**
 * @param {string} msg
 * @param {{ms?: number, action?: null | {label: string, fn: () => void}}} [opts]
 */
export function toast(msg, { ms = 2200, action = null } = {}) {
  el.textContent = '';
  const text = document.createElement('span');
  text.textContent = msg;
  el.appendChild(text);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      if (!canAct()) return;
      hideToast();
      action.fn();
    });
    el.appendChild(btn);
  }
  el.classList.toggle('with-action', !!action);
  el.classList.remove('hidden');
  clearTimeout(timer);
  timer = setTimeout(hideToast, action ? Math.max(ms, 5000) : ms);
}

export function hideToast() {
  el.classList.add('hidden');
}
