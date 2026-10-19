import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('service-modules production E2E reads the current card status columns, not the removed footer', async () => {
  const [probe, admin] = await Promise.all([read('scripts/admin-service-modules-production-e2e.mjs'), read('common-services-admin.js')]);
  assert.doesNotMatch(admin, /common-service-foot/);
  assert.match(admin, /class="common-service-runtime"/);
  assert.match(admin, /class="common-service-activation"/);
  assert.match(admin, /<span class="sr-only">기능 \$\{esc\(a\.label\)\} · 런타임 \$\{esc\(s\.label\)\}<\/span>/);
  assert.doesNotMatch(probe, /querySelector\('\.common-service-foot'\)/);
  assert.match(probe, /\.common-service-activation/);
  assert.match(probe, /\.common-service-runtime/);
  assert.match(probe, /statusSummaries\.every\(text => text\.includes\('기능'\) && text\.includes\('런타임'\)\)/);
  assert.match(probe, /::error title=Admin service-modules direct route failed::/);
});
