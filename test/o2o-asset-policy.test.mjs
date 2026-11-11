import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
const config = readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');

function headerRules(text) {
  const rules = new Map();
  let path = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('/')) {
      path = line.trim();
      assert.ok(!rules.has(path), 'duplicate static asset header rule: ' + path);
      rules.set(path, []);
    } else if (path && /^  \S/.test(line)) {
      rules.get(path).push(line.trim());
    }
  }
  return rules;
}

test('Cloudflare asset-first cache override is restricted to four public O2O assets', () => {
  const rules = headerRules(headers);
  const names = [
    '/o2o-hub-client.js',
    '/o2o-link-core.js',
    '/o2o-hub.css',
    '/o2o-qr-vendor.js'
  ];
  for (const name of names) {
    assert.deepEqual(
      rules.get(name),
      [
        '! Cache-Control',
        'Cache-Control: public, max-age=120, stale-while-revalidate=30',
        'X-EKODI-Route: public-asset'
      ],
      'asset-first response must override longer global static cache for ' + name
    );
  }
  const o2oRules = [...rules.keys()].filter(key => key.startsWith('/o2o'));
  assert.deepEqual(o2oRules.sort(), names.sort());
});

test('do not cache issued QR tokens, tenant operators or HTML as public assets', () => {
  const rules = headerRules(headers);
  for (const path of ['/o2o', '/o2o/', '/o2o/go/*', '/o2o-operator',
    '/auth', '/workspace-admin.js']) {
    assert.notEqual(
      rules.get(path)?.find(line => /public, max-age=120/.test(line)),
      'Cache-Control: public, max-age=120, stale-while-revalidate=30',
      'sensitive/HTML routes must not receive anonymous asset caching: ' + path
    );
  }
  assert.match(headers, /\/\*\n[\s\S]*?Cache-Control: public, max-age=300/);
  assert.match(worker, /if \(isO2OIssuedLinkPath\(url\.pathname\)\)/);
  assert.match(worker, /private, no-store', 'o2o-issued-link'/);
});

test('Cloudflare configuration preserves asset-first for static O2O resources', () => {
  assert.match(config, /\[assets\]\n/);
  assert.match(config, /binding = "ASSETS"/);
  const workerFirstLine = config.split(/\r?\n/).find(line => line.startsWith('run_worker_first = '));
  assert.ok(workerFirstLine, 'Cloudflare route ownership must be explicit');
  for (const name of ['/o2o-hub-client.js','/o2o-link-core.js',
    '/o2o-hub.css','/o2o-qr-vendor.js']) {
    assert.ok(!workerFirstLine.includes('"' + name + '"'),
      'O2O public assets must remain asset-first: ' + name);
  }
});

test('post-deploy smoke is not a blocking pre-deployment HTTP test', () => {
  const workflow = readFileSync(new URL('../.github/workflows/verify-o2o-live-smoke.yml', import.meta.url), 'utf8');
  assert.match(workflow, /asset-header-contract:/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /node --test test\/o2o-asset-policy\.test\.mjs/);
});


test('synthetic live smoke only checks never-issued tokens without write methods', () => {
  const live = readFileSync(new URL('../scripts/verify-o2o-live-smoke.mjs', import.meta.url), 'utf8');
  assert.match(live, /syntheticNeverIssuedCode = 'f'\.repeat\(48\)/);
  assert.match(live, /redirect: 'manual'/);
  assert.match(live, /cache: 'no-store'/);
  assert.doesNotMatch(live, /\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(live, /\/rest\/v1\/rpc\/o2o_operator_(?:issue|revoke)/);
});
