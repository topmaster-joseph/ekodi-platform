import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const availability = read('.github/workflows/admin-availability-watch.yml');
const revenue = read('.github/workflows/production-gate.yml');
const performance = read('.github/workflows/ecosystem-performance-watch.yml');

test('scheduled production probes avoid redundant 15-minute overlap', () => {
  assert.match(availability, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(revenue, /cron: '5 \* \* \* \*'/);
  assert.match(performance, /cron: '37 \* \* \* \*'/);
  assert.doesNotMatch(revenue, /cron: '\*\/15 \* \* \* \*'/);
  assert.doesNotMatch(performance, /cron: '7,22,37,52 \* \* \* \*'/);
});

test('deployment-triggered verification remains enabled', () => {
  assert.match(revenue, /push:\s*\n\s*branches: \[main\]/);
  assert.match(performance, /push:\s*\n\s*branches: \[main\]/);
  assert.match(availability, /push:\s*\n\s*branches: \[main\]/);
});
