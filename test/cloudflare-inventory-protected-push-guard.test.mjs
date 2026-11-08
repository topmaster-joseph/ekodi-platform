import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/cloudflare-web-domain-inventory.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/cloudflare-web-domain-inventory.mjs',import.meta.url),'utf8');

test('authenticated Cloudflare inventory uses only a protected main, path-scoped push',()=>{
  assert.match(workflow,/\n  push:\n    branches: \[main\]/);
  const push=workflow.split('\n  push:\n')[1]?.split('\n  workflow_dispatch:')[0]||'';
  assert.ok(push.includes('branches: [main]'));
  const expected=[
    '.github/workflows/cloudflare-web-domain-inventory.yml',
    'scripts/cloudflare-web-domain-inventory.mjs',
    'scripts/classify-cloudflare-pages-source.mjs',
    'test/cloudflare-web-domain-inventory.test.mjs',
    'test/cloudflare-inventory-protected-push-guard.test.mjs'
  ];
  const actual=[...push.matchAll(/^\s+- '([^']+)'$/gm)].map(x=>x[1]);
  assert.deepEqual(actual,expected,'no unrelated service paths may dispatch provider inventory');
  assert.doesNotMatch(push,/pull_request_target|workflow_run|branches-ignore/);
});

test('Cloudflare authorized push-triggered provider inventory stays GET-only and no broader permission',()=>{
  assert.match(workflow,/\npermissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow,/\n  (?:contents|issues|pull-requests|deployments|id-token): write\b/);
  assert.equal((workflow.match(/cron: '/g)||[]).length,1,'do not add schedules');
  assert.match(workflow,/\n  production:\n    if: github\.event_name != 'pull_request'/);
  assert.match(workflow,/\n  development:\n    if: github\.event_name != 'pull_request'/);
  assert.match(workflow,/node --test test\/cloudflare-inventory-protected-push-guard\.test\.mjs/);
  assert.match(source,/const headers=\{Authorization:'Bearer '\+token,Accept:'application\/json'\}/);
  assert.doesNotMatch(source,/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/i);
  assert.match(source,/destructiveActions:0/);
});
