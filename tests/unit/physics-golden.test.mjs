// Physics is frozen: every preset must still trace exactly as recorded in
// tests/golden/, and still do what its card promises. Visual work must
// never change either. After a deliberate physics change, re-record with
//   node tests/sim/run.mjs --check --write-golden

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../sim/matter.mjs';

test('presets keep their promises and their golden traces', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'sim', 'run.mjs'), '--check', '--check-hash'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
