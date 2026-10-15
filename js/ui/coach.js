// @ts-check
// First-run tips: five steps, each ticked off by doing it. They show once,
// over the board after the start screen; Skip ends them, and the start
// screen's "How to play" brings them back. The panel lets presses through
// everywhere but its own buttons, so it never gets in the way of play.

import { getPref, setPref } from '../prefs.js';
import { onAction } from '../input.js';

const STEPS = [
  { done: ['place'], text: 'Drag a piece from the tray onto the board.' },
  { done: ['turn', 'tune'], text: 'Tap a piece to turn it. Tap a bell or bar to change its note.' },
  { done: ['mirror'], text: 'Hold a piece that has an arrows mark to flip it the other way.' },
  { done: ['trash'], text: 'Drag a piece back onto the tray to take it away.' },
  { done: ['drop'], text: 'Tap the sky to drop a marble. Have fun!' },
];

const el = document.getElementById('coach');
const textEl = document.getElementById('coach-text');
const dotsEl = document.getElementById('coach-dots');
const nextBtn = document.getElementById('coach-next');
let step = -1; // -1: not showing
let pending = !getPref('coachDone', false);

function render() {
  if (step < 0) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  textEl.textContent = STEPS[step].text;
  dotsEl.textContent = '';
  STEPS.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = i < step ? 'done' : i === step ? 'now' : '';
    dotsEl.appendChild(dot);
  });
  nextBtn.textContent = step === STEPS.length - 1 ? 'Done' : 'Next';
}

function finish() {
  step = -1;
  pending = false;
  setPref('coachDone', true);
  render();
}

function advance() {
  if (step < 0) return;
  if (step >= STEPS.length - 1) finish();
  else {
    step++;
    render();
  }
}

/** The board is showing: start the tips if they're due. */
export function boardShown() {
  if (pending && step < 0) {
    step = 0;
    render();
  }
}

/** "How to play": show the tips (again, from the start) next time the
 *  board shows, or not. */
export function setPending(on) {
  pending = on;
  step = -1;
  render();
  if (!on) setPref('coachDone', true);
}

export function isPending() { return pending; }

onAction((action) => {
  if (step >= 0 && STEPS[step].done.includes(action)) {
    // the last step reads "Have fun!": leave it up a moment
    if (step === STEPS.length - 1) setTimeout(finish, 1500);
    else advance();
  }
});
nextBtn.addEventListener('click', advance);
document.getElementById('coach-skip').addEventListener('click', finish);
