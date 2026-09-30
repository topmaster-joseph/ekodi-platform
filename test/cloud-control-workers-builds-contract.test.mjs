import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseArgs, validateRequest } from '../scripts/cloud-control-workers-builds.mjs';

test('Cloud Control only permits the legacy ekodi-platform target', () => {
  assert.deepEqual(
    validateRequest({ target: 'ekodi-platform', mode: 'plan', confirm: '' }),
    { target: 'ekodi-platform', mode: 'plan' },
  );
  assert.throws(
    () => validateRequest({ target: 'ekodi-auth-api', mode: 'plan', confirm: '' }),
    /not allowlisted/,
  );
});

test('apply requires the exact break-glass confirmation', () => {
  assert.throws(
    () => validateRequest({ target: 'ekodi-platform', mode: 'apply', confirm: '' }),
    /DISCONNECT_EKODI_PLATFORM_BUILDS/,
  );
  assert.throws(
    () => validateRequest({ target: 'ekodi-platform', mode: 'apply', confirm: 'yes' }),
    /DISCONNECT_EKODI_PLATFORM_BUILDS/,
  );
  assert.deepEqual(
    validateRequest({
      target: 'ekodi-platform',
      mode: 'apply',
      confirm: 'DISCONNECT_EKODI_PLATFORM_BUILDS',
    }),
    { target: 'ekodi-platform', mode: 'apply' },
  );
});

test('plan is the default CLI mode', () => {
  assert.deepEqual(
    parseArgs(['--target', 'ekodi-platform']),
    { target: 'ekodi-platform', mode: 'plan', confirm: '' },
  );
});

test('control script cannot mutate Workers, DNS, routes or D1', () => {
  const source = fs.readFileSync(new URL('../scripts/cloud-control-workers-builds.mjs', import.meta.url), 'utf8');
  assert.match(source, /method: 'DELETE'/);
  assert.match(source, /\/builds\/triggers\//);
  assert.doesNotMatch(source, /method: 'POST'/);
  assert.doesNotMatch(source, /method: 'PUT'/);
  assert.doesNotMatch(source, /method: 'PATCH'/);
  assert.doesNotMatch(source, /\/zones\//);
  assert.doesNotMatch(source, /\/d1\//i);
  assert.doesNotMatch(source, /workers\/scripts\/\$\{/);
});
