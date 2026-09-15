import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('broad registry monitor runs hourly on the delegated autonomy cadence', async () => {
  const text = await readFile('.github/workflows/monitor.yml', 'utf8');
  assert.match(text, /cron:\s*["']7 \* \* \* \*["']/);
  assert.doesNotMatch(text, /cron:\s*["']17 \*\/4 \* \* \*["']/);
});

test('critical availability monitors remain more frequent', async () => {
  const admin = await readFile('.github/workflows/admin-availability-watch.yml', 'utf8');
  const revenue = await readFile('.github/workflows/production-gate.yml', 'utf8');
  const perf = await readFile('.github/workflows/ecosystem-performance-watch.yml', 'utf8');
  assert.match(admin, /cron:\s*['"]\*\/15 \* \* \* \*['"]/);
  assert.match(revenue, /cron:\s*['"]5 \* \* \* \*['"]/);
  assert.match(perf, /cron:\s*['"]37 \* \* \* \*['"]/);
});
