// @ts-check
// Tap-twice confirmation for destructive buttons: the first tap arms the
// button (shown with the `armed` class) and the second, within `ms`,
// confirms. Undo covers mistakes; this just stops a stray tap.

/**
 * @param {HTMLElement} btn
 * @param {() => void} onConfirm
 * @param {{ms?: number, onArm?: () => void, when?: () => boolean}} [opts]
 *   onArm runs on the first tap (say, a hint); `when` can veto a tap.
 */
export function armable(btn, onConfirm, { ms = 2500, onArm, when } = {}) {
  let timer = 0;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (when && !when()) return;
    if (btn.classList.contains('armed')) {
      clearTimeout(timer);
      btn.classList.remove('armed');
      onConfirm();
    } else {
      btn.classList.add('armed');
      if (onArm) onArm();
      timer = setTimeout(() => btn.classList.remove('armed'), ms);
    }
  });
}
