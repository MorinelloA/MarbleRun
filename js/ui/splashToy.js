// @ts-check
// The start screen's toy: a handful of flat shapes in the game's colours
// that fall onto the title's letters and the track cards, to grab and
// throw. A port of the hero toy on tonyt908.com (src/scripts/toy.ts) to the
// game's own Matter.js, with the same knockout look and fixed step. It
// sleeps once everything settles, runs only while the start screen is up,
// and with reduced motion shows the settled scene, still, until a shape is
// picked up.
//
// Solid to the shapes: each letter of [data-glyphs] text (read from the
// glyphs' ink, column by column), every [data-solid-box] and every
// .splash-card.

import * as theme from '../theme.js';
import { reduced } from '../fx.js';
import * as chimes from '../audio/chimes.js';

const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = window.Matter;

const STEP = 1000 / 120;
const MAX_STEPS = 4;
const SLOP = 14; // a finger is less exact than a mouse: px of grace around a shape

/**
 * @param {HTMLElement} stage the element the shapes live in
 * @param {HTMLCanvasElement} canvas covering the stage
 */
export function createSplashToy(stage, canvas) {
  const ctx = canvas.getContext('2d');
  const engine = Engine.create({ enableSleeping: true, gravity: { x: 0, y: 1.05 } });
  const world = engine.world;
  let width = 0, height = 0, dpr = 1;
  /** @type {any[]} */ let solids = [];
  /** @type {any[]} */ const shapes = [];
  const fills = new Map();
  let running = false, raf = 0, last = 0, acc = 0;
  let drag = null, grabbed = false;

  const origin = () => stage.getBoundingClientRect();
  const block = (x, y, w, h, round = 0) => Bodies.rectangle(x + w / 2, y + h / 2, Math.max(2, w), Math.max(2, h), {
    isStatic: true,
    ...(round ? { chamfer: { radius: Math.max(0, Math.min(round, h / 2 - 1, w / 2 - 1)) } } : {}),
  });
  const boxOf = (el) => {
    const s = origin(), r = el.getBoundingClientRect();
    return block(r.left - s.left, r.top - s.top, r.width, r.height);
  };

  // ---- letters as solids: each glyph is drawn once on a hidden canvas in
  // the same face, and the top edge of its ink is read column by column ----
  const profiles = new Map();
  const glyphCanvas = document.createElement('canvas');
  const gctx = glyphCanvas.getContext('2d', { willReadFrequently: true });
  const measurer = document.createElement('canvas').getContext('2d');

  function glyphProfile(ch, font, ref, step) {
    const key = `${ch}|${font}|${ref}|${step}`;
    const cached = profiles.get(key);
    if (cached) return cached;
    const w = Math.ceil(ref * 2.2), h = Math.ceil(ref * 1.7);
    const x0 = Math.ceil(ref * 0.35), base = Math.ceil(ref * 1.2);
    glyphCanvas.width = w;
    glyphCanvas.height = h;
    gctx.font = font.replace('{size}', `${ref}px`);
    gctx.textBaseline = 'alphabetic';
    gctx.fillStyle = '#000';
    gctx.fillText(ch, x0, base);
    const ink = gctx.getImageData(0, 0, w, h).data;
    const cols = [];
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y++) {
        if (ink[(y * w + x) * 4 + 3] > 110) { cols.push({ x: x - x0, top: y - base }); break; }
      }
    }
    profiles.set(key, cols);
    return cols;
  }

  function glyphSolids(el) {
    const s = origin();
    const lines = new Map();
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent || '';
      if (!text.trim() || !node.parentElement) continue;
      const cs = getComputedStyle(node.parentElement);
      const size = parseFloat(cs.fontSize);
      const font = `${cs.fontWeight} {size} ${cs.fontFamily}`;
      measurer.font = font.replace('{size}', `${size}px`);
      const ascent = measurer.measureText('H').fontBoundingBoxAscent || size * 0.95;
      const ref = Math.max(56, Math.round(size));
      const scale = size / ref;
      const step = Math.max(1, Math.round(Math.max(2, size / 40) / scale));
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i])) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const box = range.getClientRects()[0];
        if (!box || box.width < 0.5) continue;
        const baseline = box.top + ascent;
        const key = Math.round(box.top);
        const line = lines.get(key) || [];
        for (const c of glyphProfile(text[i], font, ref, step)) {
          line.push({
            x: box.left + c.x * scale - s.left, top: baseline + c.top * scale - s.top, base: baseline - s.top,
            step: step * scale, tol: Math.max(1.5, size * 0.025), bridge: size * (size > 60 ? 0.07 : 0.16), depth: size * 0.1,
          });
        }
        lines.set(key, line);
      }
    }
    // Each line becomes one skyline: where letters overlap the highest ink
    // wins, neighbouring columns at about the same height merge into one
    // strip, and gaps narrower than a word space are bridged.
    const bodies = [];
    for (const raw of lines.values()) {
      const bucket = Math.max(1, raw[0]?.step ?? 2);
      const sky = new Map();
      for (const c of raw) {
        const k = Math.round(c.x / bucket);
        const prev = sky.get(k);
        if (!prev || c.top < prev.top) sky.set(k, { ...c, x: k * bucket, base: Math.max(c.base, prev?.base ?? c.base) });
      }
      const cols = [...sky.values()].sort((a, b) => a.x - b.x);
      let run = null;
      const flush = () => {
        if (run) bodies.push(block(run.x0 - run.pad, run.top, run.x1 - run.x0 + run.pad * 2, run.base + run.depth - run.top));
      };
      for (const c of cols) {
        if (run && c.x - run.x1 <= Math.max(c.step * 1.6, c.bridge) && Math.abs(c.top - run.top) <= c.tol) {
          run.x1 = c.x;
          run.top = Math.min(run.top, c.top);
          run.base = Math.max(run.base, c.base);
        } else {
          flush();
          run = { x0: c.x, x1: c.x, top: c.top, base: c.base, pad: c.step / 2, depth: c.depth };
        }
      }
      flush();
    }
    return bodies;
  }

  function buildSolids() {
    Composite.remove(world, solids);
    const t = 200;
    solids = [
      Bodies.rectangle(width / 2, height + t / 2, width * 2, t, { isStatic: true }),
      Bodies.rectangle(-t / 2, height / 2, t, height * 4, { isStatic: true }),
      Bodies.rectangle(width + t / 2, height / 2, t, height * 4, { isStatic: true }),
      ...[...stage.querySelectorAll('[data-glyphs]')].flatMap(el => glyphSolids(/** @type {HTMLElement} */ (el))),
      ...[...stage.querySelectorAll('[data-solid-box], .splash-card')].map(boxOf),
    ];
    Composite.add(world, solids);
  }

  // ---- the shapes: the toy's marbles, pills, tiles and triangles ----
  function spawn() {
    const th = theme.current();
    const colors = [...th.marbles, th.role.ramp, th.role.curve, th.role.mover, th.role.structure];
    const count = width < 700 ? 9 : 18;
    const unit = Math.max(16, Math.min(34, width / 46));
    for (let i = 0; i < count; i++) {
      const x = 40 + Math.random() * (width - 80);
      const y = -60 - i * (height / count) * 0.9;
      const kind = i % 4;
      const opts = { restitution: 0.42, friction: 0.08, frictionAir: 0.012, density: 0.002 };
      const body =
        kind === 0 ? Bodies.circle(x, y, unit * (0.75 + Math.random() * 0.5), opts) :
        kind === 1 ? Bodies.rectangle(x, y, unit * 3.2, unit * 1.25, { ...opts, chamfer: { radius: unit * 0.62 } }) :
        kind === 2 ? Bodies.rectangle(x, y, unit * 1.9, unit * 1.9, { ...opts, chamfer: { radius: unit * 0.45 } }) :
        Bodies.polygon(x, y, 3, unit * 1.25, { ...opts, chamfer: { radius: unit * 0.3 } });
      Body.setAngle(body, Math.random() * Math.PI);
      fills.set(body.id, colors[(i * 5) % colors.length]);
      shapes.push(body);
    }
    Composite.add(world, shapes);
  }

  // outlines take the stage's colour, so shapes never merge with the
  // letters they rest on
  function draw() {
    const th = theme.current();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const b of shapes) {
      const v = b.vertices;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.fillStyle = fills.get(b.id);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = th.stage;
      ctx.stroke();
      if (b.circleRadius) { // a marble's glint
        ctx.beginPath();
        ctx.arc(b.position.x - b.circleRadius * 0.35, b.position.y - b.circleRadius * 0.35, b.circleRadius * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = th.shine;
        ctx.fill();
      }
    }
  }

  // ---- fixed-step loop, as in the game ----
  function frame(now) {
    acc += Math.min(100, now - (last || now));
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      Engine.update(engine, STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;
    draw();
    const settled = shapes.length > 0 && shapes.every(b => b.isSleeping) && !drag;
    raf = settled || !running || document.hidden ? 0 : requestAnimationFrame(frame);
  }

  function wake() {
    if (!running) return;
    if (reduced() && !grabbed) { requestAnimationFrame(draw); return; }
    if (!raf && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  // with reduced motion nothing moves until a shape is picked up: the
  // shapes settle out of sight and one frame is drawn
  function settle() {
    for (let i = 0; i < 900; i++) Engine.update(engine, STEP);
    draw();
  }

  function resize() {
    const r = origin();
    if (!r.width || !r.height) return; // hidden
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = r.width;
    height = r.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    buildSolids();
    if (!shapes.length) spawn();
    for (const b of shapes) {
      if (b.position.x > width - 20 || b.position.y > height) {
        Body.setPosition(b, { x: Math.min(width - 40, b.position.x), y: Math.min(height - 40, b.position.y) });
      }
      Sleeping.set(b, false);
    }
    if (reduced() && !grabbed) settle(); else wake();
  }

  let resizeTimer = 0;
  const later = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  };
  new ResizeObserver(later).observe(stage);
  // the letters' shapes depend on the font: read them again once it is in
  document.fonts?.addEventListener?.('loadingdone', later);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  // ---- grab and throw, with a mouse, pen or finger ----
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (p, slop) => {
    for (const r of slop ? [0, slop / 2, slop] : [0]) {
      for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2;
        const hit = Query.point(shapes, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r })[0];
        if (hit) return hit;
      }
    }
    return undefined;
  };
  // the shape under a press, if nothing but the canvas is under its point
  const shapeAt = (e, slop) =>
    document.elementFromPoint(e.clientX, e.clientY) === canvas ? hitAt(point(e), slop) : undefined;

  // a touch that lands on a shape holds the page still, so the shape
  // follows the finger; anywhere else the screen scrolls as usual
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (e.touches.length === 1 && t && shapeAt(t, SLOP)) e.preventDefault();
  }, { passive: false, capture: true });

  stage.addEventListener('pointerdown', (e) => {
    const hit = shapeAt(e, e.pointerType === 'mouse' ? 0 : SLOP);
    if (!hit) return;
    const p = point(e);
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the drag works without capture */ }
    grabbed = true;
    Sleeping.set(hit, false);
    drag = Constraint.create({
      pointA: p, bodyB: hit, pointB: { x: p.x - hit.position.x, y: p.y - hit.position.y },
      stiffness: 0.18, damping: 0.1, length: 0,
    });
    Composite.add(world, drag);
    canvas.style.cursor = 'grabbing';
    chimes.ui.pickup();
    wake();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      drag.pointA = point(e);
      wake();
      return;
    }
    if (e.pointerType === 'mouse') canvas.style.cursor = Query.point(shapes, point(e)).length ? 'grab' : '';
  });
  const drop = () => {
    if (!drag) return;
    Composite.remove(world, drag);
    drag = null;
    canvas.style.cursor = '';
    wake();
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.addEventListener('lostpointercapture', drop);

  return {
    /** The start screen is up (call after its cards are in place). */
    start() {
      running = true;
      const go = () => { if (running) resize(); };
      if (document.fonts?.load) document.fonts.load('900 64px "Mona Sans Title"').then(go, go);
      else go();
    },
    /** The start screen is gone: stop drawing, and let go of the canvas's
     *  pixels (start() sizes it again). */
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      drop();
      canvas.width = 0;
      canvas.height = 0;
    },
    /** For checks: the engine and shapes, and a way to run it n steps. */
    debug: { engine, shapes, solids: () => solids, step(n = 600) { for (let i = 0; i < n; i++) Engine.update(engine, STEP); draw(); } },
  };
}
