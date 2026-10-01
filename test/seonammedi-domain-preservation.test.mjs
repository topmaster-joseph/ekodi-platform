import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../seonammedi-domain-gateway.js';

test('seonammedi.kr preserves host and proxies root to canonical path', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async request => {
    const url = new URL(request.url);
    assert.equal(url.hostname, 'ekodi.kr');
    assert.equal(url.pathname, '/seonammedi/');
    return new Response(
      '<link rel="canonical" href="https://ekodi.kr/seonammedi/"><link rel="stylesheet" href="/seonammedi/app.css">',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  };
  try {
    const response = await worker.fetch(new Request('https://seonammedi.kr/'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-ekodi-domain-mode'), 'customer-domain-preserved');
    const html = await response.text();
    assert.match(html, /https:\/\/seonammedi\.kr\//);
    assert.match(html, /href="\/app\.css"/);
    assert.doesNotMatch(html, /https:\/\/ekodi\.kr\/seonammedi\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('site assets and API routes are mapped without double-prefixing', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async request => {
    seen.push(new URL(request.url).pathname);
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await worker.fetch(new Request('https://seonammedi.kr/app.js'));
    await worker.fetch(new Request('https://seonammedi.kr/api/seonammedi/page-data'));
    await worker.fetch(new Request('https://seonammedi.kr/seonammedi/data.json'));
    assert.deepEqual(seen, [
      '/seonammedi/app.js',
      '/api/seonammedi/page-data',
      '/seonammedi/data.json',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('canonical upstream redirects are rewritten back to customer domain', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 308,
    headers: { location: 'https://ekodi.kr/seonammedi/admin/' },
  });
  try {
    const response = await worker.fetch(new Request('https://seonammedi.kr/admin'));
    assert.equal(response.headers.get('location'), 'https://seonammedi.kr/admin/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare standalone-domain deployment uses the preserving gateway', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = await readFile(new URL('../wrangler.seonammedi-redirect.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /main = "seonammedi-domain-gateway\.js"/);
  assert.doesNotMatch(wrangler, /main = "legacy-redirect\.js"/);
});


test('SeonamMedi release guards verify preserved domains instead of legacy redirects', async () => {
  const { readFile } = await import('node:fs/promises');
  const deploy = await readFile(new URL('../.github/workflows/deploy-seonammedi-domains.yml', import.meta.url), 'utf8');
  const verify = await readFile(new URL('../.github/workflows/verify-seonammedi-domains.yml', import.meta.url), 'utf8');

  for (const workflow of [deploy, verify]) {
    assert.match(workflow, /customer-domain-preserved/);
    assert.match(workflow, /x-ekodi-domain-mode/i);
    assert.match(workflow, /x-ekodi-upstream-path/i);
    assert.doesNotMatch(workflow, /test "\$code" = "301"/);
  }
  assert.match(verify, /seonammedi-domain-gateway\.js/);
});
