import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANUAL_RELEASE} from '../api/domeggook-release.js';

const src=readFileSync(new URL('../api/domeggook-release.js',import.meta.url),'utf8');

// TOSS-MALL-UNDERWRITING-002: operator-approved manual-fulfillment products keep checkout while auto-order is off.
test('supply gate pause excludes operator-approved manual release products',()=>{
  assert.equal(MANUAL_RELEASE,'manual');
  const pause=src.split("const paused = await env.DB.prepare(")[1].split('.all()')[0];
  assert.match(pause,/COALESCE\(supply_release,''\)<>'\$\{MANUAL_RELEASE\}'/);
  assert.match(pause,/SET checkout_ready=0/);
});
test('approved release branch never selects manual products for re-publication',()=>{
  const staged=src.split('const staged = await env.DB.prepare(')[1].split('.all()')[0];
  assert.doesNotMatch(staged,/manual/);
  assert.match(staged,/supply_release='staged'|supply_release='catalog'/);
});
