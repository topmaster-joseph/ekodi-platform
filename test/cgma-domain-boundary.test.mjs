import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [wrangler, workflow, amendment, manifestText] = await Promise.all([
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
  readFile(new URL('../governance/amendments/2026-09-03-cgma-public-domain-v1.5.2.json', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'),
]);

test('CGMA external DNS stays outside Shared Site ownership until approved cutover', () => {
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?cgma\.or\.kr"/);
  assert.match(amendment, /move cgma\.or\.kr DNS from the legacy provider to the EKODI edge only after DNS authority is available/);
  assert.match(workflow, /'https:\/\/cgma\.or\.kr\/'/);
  assert.match(workflow, /'https:\/\/www\.cgma\.or\.kr\/'/);
});

test('Shared Site domain repair only enforces domains it currently owns', () => {
  assert.doesNotMatch(workflow, /for host in[^\n]*cgma\.or\.kr/);
  assert.match(workflow, /for host in ekodi\.kr admin\.ekodi\.kr auth\.ekodi\.kr tax\.ekodi\.kr; do/);
});

test('Shared Site candidate smoke excludes the independently routed CGMA public gateway', () => {
  const manifest = JSON.parse(manifestText);
  const urls = manifest.worker.requests.map(request => request.url);
  assert.ok(!urls.includes('https://ekodi.kr/cgma/marketing'));
});
