import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

 test('canonical operating-principle validator passes', () => {
  const run = spawnSync(process.execPath, ['scripts/validate-service-operating-principles.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

test('shared user-service hubs expose Shell v2 and health without owning private data', async () => {
  const [worker, shellWorker, injector, wrangler, hub] = await Promise.all([
    read('site-worker.js'), read('site-shell-worker.js'), read('ekodi-shell-injector.js'), read('wrangler.site.toml'), read('hub.html')
  ]);
  for (const host of ['trade.ekodi.kr','pay.ekodi.kr','mail.ekodi.kr','live.ekodi.kr','cloud.ekodi.kr','ins.ekodi.kr','media.ekodi.kr']) {
    assert.match(wrangler, new RegExp(`pattern = "${host.replaceAll('.', '\\.') }"`));
    assert.ok(worker.includes(`'${host}'`), `${host} must resolve in shared Worker`);
    assert.ok(shellWorker.includes(`'${host}'`), `${host} must receive Shell injection`);
    assert.ok(injector.includes(`'${host}'`), `${host} must resolve to a canonical Shell service`);
  }
  assert.ok(worker.includes("membership: 'universal-free-lazy'"));
  assert.ok(worker.includes("aiDependency: 'optional'"));
  assert.ok(worker.includes('privateCrossServiceDataAccess: false'));
  assert.ok(hub.includes('Person + Space + Role + Capability'));
  assert.ok(hub.includes('관리자 권한 분리'));
  assert.ok(hub.includes('가입 권유, 보험상품 최종 추천'));
  assert.ok(hub.includes('외부 AI나 미디어 공급자가 없어도'));
});

test('canonical Trade host is trade.ekodi.kr and legacy business alias redirects toward it', async () => {
  const worker = await read('site-worker.js');
  assert.ok(worker.includes("const TRADE_CANONICAL_HOST = 'trade.ekodi.kr'"));
  assert.ok(worker.includes("const TRADE_LEGACY_HOSTS = new Set(['trade.biz.ekodi.kr'])"));
});

test('Publishing has isolated staging and Cafe remains explicitly digital-only beta', async () => {
  const [publishingWorkflow, publishingStaging, cafe] = await Promise.all([
    read('.github/workflows/deploy-publishing.yml'),
    read('wrangler.publishing.staging.toml'),
    read('sites/ekodi-cafe/deployment.json').then(JSON.parse)
  ]);
  assert.ok(publishingWorkflow.includes('pull_request:'));
  assert.ok(publishingWorkflow.includes('Deploy isolated Publishing staging'));
  assert.ok(publishingWorkflow.includes('ekodi/publishing-production'));
  assert.ok(publishingStaging.includes('name = "ekodi-publishing-staging"'));
  assert.equal(cafe.status, 'digital-beta');
  assert.equal(cafe.physicalPlaceOpen, false);
  assert.equal(cafe.dataMode, 'browser-local-notes-only');
});
