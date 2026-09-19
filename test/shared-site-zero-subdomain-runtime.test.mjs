import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const policy = JSON.parse(await readFile(new URL('../config/domain-canonical-policy.json', import.meta.url), 'utf8'));

function routeBlocks(source) {
  return source.split('[[routes]]').slice(1).map(block => ({
    pattern: block.match(/pattern\\s*=\\s*"([^"]+)"/)?.[1] || '',
    custom: /custom_domain\\s*=\\s*true/.test(block),
    zone: block.match(/zone_name\\s*=\\s*"([^"]+)"/)?.[1] || ''
  }));
}

test('shared site declares exactly one EKODI custom domain: the apex', () => {
  assert.equal(policy.subdomainPolicy, 'forbidden');
  assert.equal(policy.legacySubdomainRedirects, false);
  const custom = routeBlocks(wrangler).filter(item => item.custom).map(item => item.pattern);
  assert.deepEqual(custom, ['ekodi.kr']);
});

test('canonical apex path routes remain attached without subdomain aliases', () => {
  const routes = routeBlocks(wrangler);
  for (const pattern of ['ekodi.kr/mail*','ekodi.kr/ekodibiz/trade*','ekodi.kr/ekodichurch/admin*']) {
    const match = routes.find(item => item.pattern === pattern);
    assert.ok(match, `${pattern} must remain routed`);
    assert.equal(match.zone, 'ekodi.kr');
    assert.equal(match.custom, false);
  }
  for (const legacy of [
    'www.ekodi.kr','trade.ekodi.kr','trade.biz.ekodi.kr','pay.ekodi.kr','pay.biz.ekodi.kr',
    'messenger.ekodi.kr','admin.ekodi.kr','admin.biz.ekodi.kr','admin.church.ekodi.kr',
    'admin.lab.ekodi.kr','admin.trade.ekodi.kr','mail.ekodi.kr','live.ekodi.kr',
    'live.biz.ekodi.kr','live.church.ekodi.kr','live.lab.ekodi.kr','cloud.ekodi.kr'
  ]) assert.equal(wrangler.includes(`pattern = "${legacy}"`), false, legacy);
});
