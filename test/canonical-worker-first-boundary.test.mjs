import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrangler = readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('canonical apex control surfaces stay Worker-first before Static Assets', () => {
  const required = [
    '/auth', '/auth/*', '/my', '/my/*', '/admin', '/admin/*',
    '/api', '/api/*', '/mcp', '/webhooks/*', '/health',
    '/.well-known/oauth-protected-resource',
  ];
  for (const path of required) {
    assert.ok(wrangler.includes(`"${path}"`), `${path} must remain in run_worker_first`);
  }
});
