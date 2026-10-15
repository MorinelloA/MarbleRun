// @ts-check
// Keyboard focus for the overlays (start screen, save dialog).

/** Keep Tab inside `container`: call from its keydown handler. */
export function trapTab(container, e) {
  if (e.key !== 'Tab') return;
  const focusables = [...container.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
    .filter(el => /** @type {HTMLElement} */ (el).offsetParent !== null || getComputedStyle(el).position === 'fixed');
  if (!focusables.length) return;
  const first = /** @type {HTMLElement} */ (focusables[0]);
  const last = /** @type {HTMLElement} */ (focusables[focusables.length - 1]);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
