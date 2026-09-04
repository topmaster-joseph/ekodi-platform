import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [wrangler, workflow] = await Promise.all([
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
]);

function routeBlock(pattern) {
  const expected = `pattern = "${pattern}"`;
  return wrangler.split('[[routes]]').find(part => part.includes(expected)) || '';
}

test('CGMA keeps externally managed DNS and uses zone Worker routes', () => {
  for (const pattern of ['cgma.or.kr/*', 'www.cgma.or.kr/*']) {
    const block = routeBlock(pattern);
    assert.ok(block, `missing Worker route for ${pattern}`);
    assert.match(block, /zone_name = "cgma\.or\.kr"/);
    assert.doesNotMatch(block, /custom_domain = true/);
  }
});

test('shared-site custom-domain repair does not recreate CGMA DNS', () => {
  assert.doesNotMatch(workflow, /for host in[^\n]*cgma\.or\.kr/);
  assert.match(workflow, /pattern = "cgma\.or\.kr\/\*"/);
  assert.match(workflow, /pattern = "www\.cgma\.or\.kr\/\*"/);
});