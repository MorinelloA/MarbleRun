// @ts-check
// One-line messages over the board, with an optional action button (Undo).

const el = /** @type {HTMLElement} */ (document.getElementById('toast'));
let timer = 0;

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
      hideToast();
      action.fn();
    });
    el.appendChild(btn);
  }
  el.classList.remove('hidden');
  clearTimeout(timer);
  timer = setTimeout(hideToast, action ? Math.max(ms, 5000) : ms);
}

export function hideToast() {
  el.classList.add('hidden');
}
