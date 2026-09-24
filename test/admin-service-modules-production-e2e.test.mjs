import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('service modules production E2E verifies direct route and reload on desktop/mobile', async () => {
  const source = await read('scripts/admin-service-modules-production-e2e.mjs');
  assert.match(source, /https:\/\/ekodi\.kr\/admin\/services\/service-modules/);
  assert.match(source, /id:'desktop'.*width:1440.*height:1100/s);
  assert.match(source, /id:'mobile'.*width:390.*height:844/s);
  assert.match(source, /currentSection !== 'service-modules'/);
  assert.match(source, /공통·전문 모듈 점검/);
  assert.match(source, /Core 제외/);
  assert.match(source, /text\.includes\('기능'\).*text\.includes\('런타임'\)/);
  assert.match(source, /singleColumn/);
  assert.match(source, /page\.reload/);
  assert.match(source, /service-modules-\$\{profile\.id\}\.png/);
});

test('authenticated production workflow runs and reports service modules direct-route E2E', async () => {
  const workflow = await read('.github/workflows/verify-admin-authenticated-production-e2e.yml');
  assert.match(workflow, /Verify direct common\/professional module health route/);
  assert.match(workflow, /node scripts\/admin-service-modules-production-e2e\.mjs/);
  assert.match(workflow, /service-modules-direct-route\.json/);
  assert.match(workflow, /service-modules-\*\.png/);
});
