import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Cloudflare global default remains no-script and adult verification static override is strictly scoped', async () => {
  const headers = await read('_headers');
  const global = headers.slice(0, headers.indexOf('\n\n'));
  assert.match(global, /script-src 'none'/);
  assert.match(global, /style-src 'unsafe-inline'/);
  for (const path of ['/verify/adult/', '/verify/adult/*']) {
    const start = headers.indexOf('\n' + path + '\n');
    assert.ok(start >= 0, 'missing exact asset header override: ' + path);
    const section = headers.slice(start, headers.indexOf('\n\n', start));
    assert.match(section, /! Content-Security-Policy/);
    assert.match(section, /script-src 'self' https:\/\/cdn\.portone\.io/);
    assert.match(section, /style-src 'self'/);
    assert.match(section, /connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
    assert.match(section, /frame-ancestors 'none'/);
    assert.match(section, /object-src 'none'/);
    assert.doesNotMatch(section, /unsafe-inline/);
    assert.match(section, /! Cache-Control/);
    assert.match(section, /Cache-Control: no-store/);
    assert.match(section, /X-Robots-Tag: noindex, nofollow, noarchive/);
  }
  assert.ok(!headers.includes('\n/verify/*\n'), 'do not widen to other verification paths');
});

test('Shared Site preserves asset-first quota/100-rule budget and copies _headers into published dist', async () => {
  const wrangler = await read('wrangler.site.toml');
  const route = wrangler.match(/^run_worker_first\s*=\s*(\[[^\n]+\])/m);
  assert.ok(route, 'route patterns must be present');
  const patterns = JSON.parse(route[1]);
  assert.ok(patterns.length <= 100, 'Cloudflare 100-entry limit exceeded');
  assert.ok(!patterns.some(x => x.startsWith('/verify')), 'adult static asset CSP belongs to _headers');
  assert.ok(patterns.includes('/api/*'));
  const build = await read('scripts/build.mjs');
  assert.match(build, /'monitor-status\.json','_headers'/);
  const html = await read('verify/adult/index.html');
  assert.match(html, /href="\/verify\/adult\/styles\.css"/);
  assert.match(html, /src="\/verify\/adult\/app\.js"/);
});
