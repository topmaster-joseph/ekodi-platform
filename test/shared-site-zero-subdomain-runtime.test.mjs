import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../ekodi-service-manifest.js', import.meta.url), 'utf8');
const shellValidator = await readFile(new URL('../scripts/validate-ekodi-shell-adoption.mjs', import.meta.url), 'utf8');
const policy = JSON.parse(await readFile(new URL('../config/domain-canonical-policy.json', import.meta.url), 'utf8'));

function routeBlocks(source) {
  return source.split('[[routes]]').slice(1).map(block => ({
    pattern: block.match(/pattern\s*=\s*"([^"]+)"/)?.[1] || '',
    custom: /custom_domain\s*=\s*true/.test(block),
    zone: block.match(/zone_name\s*=\s*"([^"]+)"/)?.[1] || ''
  }));
}

test('shared site declares exactly one EKODI custom domain: the apex', () => {
  assert.equal(policy.subdomainPolicy, 'forbidden');
  assert.equal(policy.legacySubdomainRedirects, false);
  const custom = routeBlocks(wrangler).filter(item => item.custom).map(item => item.pattern);
  assert.deepEqual(custom, ['ekodi.kr']);
});

test('canonical apex path routes remain attached without public custom-domain aliases', () => {
  const routes = routeBlocks(wrangler);
  for (const pattern of ['ekodi.kr/mail*','ekodi.kr/ekodibiz/trade*','ekodi.kr/ekodichurch/admin*']) {
    const match = routes.find(item => item.pattern === pattern);
    assert.ok(match, `${pattern} must remain routed`);
    assert.equal(match.zone, 'ekodi.kr');
    assert.equal(match.custom, false);
  }
  assert.equal(routes.filter(item => item.custom).length, 1);
});

test('Messenger canonical identity uses the apex path contract', () => {
  assert.match(manifest, /id:'messenger'[\s\S]*?url:'https:\/\/ekodi\.kr\/messenger'/);
  assert.match(shellValidator, /canonical apex path is missing from wrangler\.site\.toml/);
  assert.match(shellValidator, /platform-router-entry-worker\.js/);
});
