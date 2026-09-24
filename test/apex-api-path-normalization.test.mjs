import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

const runtimeFiles = [
  'admin-provider-control.js',
  'ai-control-worker.js',
  'books-royalty-admin.js',
  'church-reports-admin.js',
  'common-services-admin.js',
  'community-reports-admin.js',
  'external-account-admin.js',
  'insurance-admin.js',
  'insurance-advisor-admin.js',
  'insurance-network-admin.js',
  'insurance-practice-admin.js',
  'publishing/studio/app.js',
  'tools/ekodi-device-agent/tapo/index.mjs',
  'ekodi-mcp-gateway.js',
  'local-commerce-worker.js',
  'local-commerce/app.js',
  'mail-admin-page.js',
  'mall-promotion-automation.js',
  'preview-page.js',
  'social-worker.js',
];

test('apex API migration never emits duplicated /api/api paths', async () => {
  for (const path of runtimeFiles) {
    const source = await read(path);
    assert.doesNotMatch(source, /https:\/\/ekodi\.kr\/api\/api(?:\/|['"`])/i, path);
  }
});

test('browser and agent API clients use the apex origin when endpoint paths already start with /api', async () => {
  const expectations = new Map([
    ['admin-provider-control.js', "const API='https://ekodi.kr'"],
    ['books-royalty-admin.js', "const API='https://ekodi.kr'"],
    ['church-reports-admin.js', "const API='https://ekodi.kr'"],
    ['common-services-admin.js', "const CONTROL='https://ekodi.kr'"],
    ['community-reports-admin.js', "const API='https://ekodi.kr'"],
    ['external-account-admin.js', "const API='https://ekodi.kr'"],
    ['insurance-admin.js', "const API='https://ekodi.kr'"],
    ['insurance-advisor-admin.js', "const API='https://ekodi.kr'"],
    ['insurance-network-admin.js', "const API='https://ekodi.kr'"],
    ['insurance-practice-admin.js', "const API='https://ekodi.kr'"],
    ['publishing/studio/app.js', "const API='https://ekodi.kr'"],
    ['tools/ekodi-device-agent/tapo/index.mjs', "const API_DEFAULT = 'https://ekodi.kr'"],
  ]);
  for (const [path, marker] of expectations) {
    const source = await read(path);
    assert.ok(source.includes(marker), `${path}: missing canonical apex API origin`);
  }
  const aiControl = await read('ai-control-worker.js');
  assert.match(aiControl, /CONTROL_API_URL\)\|\|'https:\/\/ekodi\.kr'/);
  assert.doesNotMatch(aiControl, /CONTROL_API_URL\)\|\|'https:\/\/ekodi\.kr\/api'/);
});

test('canonical absolute API URLs retain exactly one /api prefix', async () => {
  const checks = new Map([
    ['ekodi-mcp-gateway.js', ['https://ekodi.kr/api/user-ai/status', 'https://ekodi.kr/api/membership/portfolio']],
    ['local-commerce-worker.js', ['https://ekodi.kr/api/local-commerce']],
    ['local-commerce/app.js', ['https://ekodi.kr/api/local-commerce']],
    ['mail-admin-page.js', ['https://ekodi.kr/api/mail/control']],
    ['mall-promotion-automation.js', ['https://ekodi.kr/api/affiliate/public/image/']],
    ['preview-page.js', ['https://ekodi.kr/api/public/preview/map']],
    ['social-worker.js', ['https://ekodi.kr/api/social/registry']],
  ]);
  for (const [path, markers] of checks) {
    const source = await read(path);
    for (const marker of markers) assert.ok(source.includes(marker), `${path}: missing ${marker}`);
  }
});
