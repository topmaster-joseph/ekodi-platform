import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../control-center.html', import.meta.url), 'utf8');

test('admin sidebar exposes Mall Free Ops in business operations area', () => {
  const organizationIndex = html.indexOf('data-section="organization"');
  const freeOpsIndex = html.indexOf('https://mall.ekodi.kr/free-ops');
  const domainsIndex = html.indexOf('/legacy#domains');

  assert.ok(organizationIndex >= 0, 'organization nav exists');
  assert.ok(freeOpsIndex > organizationIndex, 'Free Ops follows organization/business nav');
  assert.ok(domainsIndex > freeOpsIndex, 'Free Ops appears before advanced domain controls');
  assert.match(html, /Mall · Free Ops/);
  assert.match(html, /target="_blank" rel="noopener"/);
});
