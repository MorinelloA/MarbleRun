// @ts-check
// Icons from the sprite in index.html (<symbol id="i-...">).

const NS = 'http://www.w3.org/2000/svg';

/** An <svg class="icon"> showing sprite symbol `i-${name}`; decorative
 *  (the control it sits in carries the name). */
export function icon(name, extraClass = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', extraClass ? `icon ${extraClass}` : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Point an existing icon at another symbol. */
export function setIcon(svg, name) {
  svg.querySelector('use').setAttribute('href', `#i-${name}`);
}
