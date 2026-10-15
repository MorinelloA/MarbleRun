// @ts-check
// Measuring sounds, for the sound sheet and the tests: levels, where the
// energy sits, and how noise-like a sound is. Spectral flatness is near 0 for
// a tone and about 0.56 for white noise; static sounds like static because
// its flatness is high.

/** In-place radix-2 FFT (length a power of two). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k);
        const p = i + k, q = p + len / 2;
        const xr = re[q] * c - im[q] * s, xi = re[q] * s + im[q] * c;
        re[q] = re[p] - xr;
        im[q] = im[p] - xi;
        re[p] += xr;
        im[p] += xi;
      }
    }
  }
}

/**
 * Power spectrum of n samples of x from `start` (zero-padded past its end).
 * A Hann window suits steady sounds; a knock, which starts at full strength
 * and dies away, is measured whole without one.
 * @returns {{power: Float64Array, hzPerBin: number}}
 */
export function spectrum(x, sampleRate, { start = 0, n = 8192, window = true } = {}) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = window ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n) : 1;
    re[i] = (x[start + i] || 0) * w;
  }
  fft(re, im);
  const power = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) power[k] = re[k] ** 2 + im[k] ** 2;
  return { power, hzPerBin: sampleRate / n };
}

/** Peak and RMS of x[from..to), in dB of full scale. */
export function levels(x, from = 0, to = x.length) {
  let peak = 0, sum = 0;
  for (let i = from; i < to; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    sum += x[i] * x[i];
  }
  return { peakDb: 20 * Math.log10(peak), rmsDb: 10 * Math.log10(sum / (to - from)) };
}

/** Share of a spectrum's energy at or above `hz`. */
export function shareAbove({ power, hzPerBin }, hz) {
  let above = 0, all = 0;
  for (let k = 1; k < power.length; k++) {
    all += power[k];
    if (k * hzPerBin >= hz) above += power[k];
  }
  return above / all;
}

/** The energy-weighted mean frequency, in Hz. */
export function centroid({ power, hzPerBin }) {
  let sum = 0, all = 0;
  for (let k = 1; k < power.length; k++) {
    sum += k * hzPerBin * power[k];
    all += power[k];
  }
  return sum / all;
}

/** Spectral flatness between lo and hi Hz: the geometric mean of the power
 *  over its arithmetic mean. */
export function flatness({ power, hzPerBin }, lo = 100, hi = 8000) {
  let logs = 0, sum = 0, n = 0;
  for (let k = 1; k < power.length; k++) {
    const hz = k * hzPerBin;
    if (hz < lo || hz > hi) continue;
    logs += Math.log(power[k] + 1e-30);
    sum += power[k];
    n++;
  }
  return Math.exp(logs / n) / (sum / n);
}
