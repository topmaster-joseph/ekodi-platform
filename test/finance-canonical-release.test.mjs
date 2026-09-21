import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');
const retiredFinanceHost = ['finance-api','ekodi.kr'].join('.');

test('Finance guarded release uses only canonical apex production URLs', async () => {
  const manifest = JSON.parse(await read('deploy/manifests/finance-api.worker.json'));
  assert.equal(manifest.version, 2);
  assert.ok(manifest.worker.requests.length >= 3);
  for (const request of manifest.worker.requests) {
    assert.equal(request.url.startsWith('https://ekodi.kr/api/finance/'), true);
    assert.equal(request.candidateVerify, false);
    assert.match(request.candidateVerifyReason, /canonical apex|service binding|promotion/i);
  }
  assert.equal(JSON.stringify(manifest).includes(retiredFinanceHost), false);
});

test('Finance production workflow retires every EKODI custom-domain attachment', async () => {
  const [workflow, wrangler] = await Promise.all([
    read('.github/workflows/deploy-finance.yml'),
    read('wrangler.finance.toml'),
  ]);
  assert.equal(workflow.includes(retiredFinanceHost), false);
  assert.doesNotMatch(workflow, /triggers deploy --config wrangler\.finance\.toml/);
  assert.match(workflow, /workers\/domains/);
  assert.match(workflow, /\$api\?service=ekodi-finance-api/);
  assert.match(workflow, /-X DELETE "\$api\/\$domain_id"/);
  assert.match(workflow, /endswith\("\.ekodi\.kr"\)/);
  assert.match(workflow, /legacy_code=.*https:\/\/\$legacy_host\/health/);
  assert.doesNotMatch(wrangler, /\[\[routes\]\]|custom_domain\s*=|route\s*=/);
  assert.match(wrangler, /ALLOWED_ORIGINS = "https:\/\/ekodi\.kr"/);
});
