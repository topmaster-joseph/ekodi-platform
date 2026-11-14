import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL('../' + relative, import.meta.url), 'utf8');
const oldBrowserHost = name => [name, 'ekodi', 'kr'].join('.');
const canonical = 'https://ekodi.kr';

test('current domain policy and public guidance advertise apex-only first-party web entry', async () => {
  const policy = JSON.parse(await read('config/domain-canonical-policy.json'));
  assert.equal(policy.canonicalHost, 'ekodi.kr');
  assert.equal(policy.publicAddressPolicy, 'apex-path-only');
  assert.equal(policy.subdomainPolicy, 'forbidden');
  assert.equal(policy.legacySubdomainRedirects, false);
  assert.equal(policy.canonicalAuthEntry.authentication, canonical + '/auth/');
  assert.equal(policy.canonicalAuthEntry.platformAdmin, canonical + '/admin/');

  const readme = await read('README.md');
  const domainSection = readme.split('## Domain policy')[1]?.split('## Security')[0] || '';
  assert.match(domainSection, /Current approved rule \(C3, 2026-10-23\)/);
  assert.match(domainSection, /official protected C3 release/);
  assert.match(domainSection, /MX\/SPF\/DKIM\/DMARC/);
  assert.doesNotMatch(domainSection, /New services should normally use EKODI subdomains/);

  const lifecycle = await read('docs/site-lifecycle.md');
  assert.match(lifecycle, /리디렉션 별칭을 남기지 않는다/);
  for (const [name, path] of [['church','ekodichurch'], ['biz','ekodibiz'], ['lab','ekodilab'], ['trade','trade']]) {
    assert.ok(lifecycle.includes('ekodi.kr/' + path), path + ' canonical route missing');
    assert.ok(!lifecycle.includes(oldBrowserHost(name)), name + ' legacy browser host must not be promoted');
  }
  const roadmap = await read('docs/CLOUD_FIRST_ROADMAP.md');
  assert.match(roadmap, /옛 서브도메인 확장 계획을 대체/);
  assert.match(roadmap, /Canonical web path map/);
  assert.doesNotMatch(roadmap, /Introduce subdomain apps incrementally/);
});

test('retirement scope excludes real mail DNS and other tenant or customer domains', async () => {
  const guide = await read('docs/DOMAIN-NAMING.md');
  assert.match(guide, /MX\/SPF\/DKIM\/DMARC/);
  assert.match(guide, /customer-owned domains/);
  assert.match(guide, /A\/AAAA\/CNAME/);
  const script = await read('scripts/retire-church-legacy-domain.mjs');
  assert.match(script, /Unexpected Pages owner/);
  assert.match(script, /preservedDns/);
  assert.match(script, /await canonicalHealthy\(\)/);
});
