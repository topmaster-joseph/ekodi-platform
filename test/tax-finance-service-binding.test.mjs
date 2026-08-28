import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import router from '../platform-router-entry-worker.js';

const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('shared Tax host binds to the production Finance Worker instead of duplicating D1', () => {
  assert.match(wrangler, /\[\[services\]\][\s\S]*?binding = "FINANCE"[\s\S]*?service = "ekodi-finance-api"/);
  assert.doesNotMatch(wrangler, /\[\[d1_databases\]\]/);
});

test('Tax same-origin API uses Finance service binding and preserves browser origin', async () => {
  let seenUrl = '';
  let seenOrigin = '';
  const env = {
    ENVIRONMENT: 'production',
    FINANCE: {
      async fetch(request) {
        seenUrl = request.url;
        seenOrigin = request.headers.get('origin') || '';
        return new Response(JSON.stringify({ ok:true, service:'ekodi-tax' }), {
          headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
        });
      },
    },
  };
  const request = new Request('https://tax.ekodi.kr/api/finance/tax-health', {
    headers: { origin:'https://tax.ekodi.kr', authorization:'Bearer test-token' },
  });
  const response = await router.fetch(request, env, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-tax-data-route'), 'finance-service-binding');
  assert.equal(seenUrl, 'https://tax.ekodi.kr/api/finance/tax-health');
  assert.equal(seenOrigin, 'https://tax.ekodi.kr');
  assert.match(await response.text(), /"service":"ekodi-tax"/);
});
