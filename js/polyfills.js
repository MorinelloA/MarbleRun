// @ts-check
// Canvas features newer than the Safari 15 baseline. main.js imports this
// first.

// roundRect (Safari 16): only the single-radius form the game uses.
function roundRect(x, y, w, h, r = 0) {
  const rr = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2));
  this.moveTo(x + rr, y);
  this.arcTo(x + w, y, x + w, y + h, rr);
  this.arcTo(x + w, y + h, x, y + h, rr);
  this.arcTo(x, y + h, x, y, rr);
  this.arcTo(x, y, x + w, y, rr);
  this.closePath();
}

for (const proto of [CanvasRenderingContext2D.prototype, Path2D.prototype]) {
  if (!proto.roundRect) proto.roundRect = roundRect;
}
