import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const devotional = fs.readFileSync('devotional-admin.js', 'utf8');
const demand = fs.readFileSync('admin-demand-loader.js', 'utf8');

test('devotional promotes an adopted lazy nav button to the canonical section contract', () => {
  assert.match(devotional, /\[data-section=\"devotional\"\],\[data-lazy-section=\"devotional\"\]/);
  assert.match(devotional, /if\(!button\.dataset\.section\)button\.dataset\.section='devotional'/);
});

test('demand loader resolves devotional readiness from the canonical section', () => {
  assert.match(demand, /devotional:\{[^\n]*real:'\[data-section=\"devotional\"\]'/);
  assert.match(demand, /const real = await waitFor\(feature\.real\)/);
});
