import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-11-19: /hammu/ rendered unstyled because the space CSP is style-src 'self' and the page used an inline <style>.
test('organization public page loads its CSS from a same-origin file, not an inline <style>', async () => {
  const src = readFileSync('organization-public-page.js', 'utf8');
  const head = src.slice(src.indexOf('const html=`'), src.indexOf('const html=`') + 2000);
  assert.doesNotMatch(head, /<style/);
  assert.match(head, /<link rel="stylesheet" href="\/_ekodi\/space\/organization\.css">/);
  const { organizationPublicCss } = await import('../organization-public-page.js');
  const res = organizationPublicCss();
  assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8');
  const css = await res.text();
  assert.match(css, /\.org-wrap\{/);
  assert.ok(css.length > 3000);
});

test('space CSP stays strict and the CSS file is routed end to end', () => {
  const space = readFileSync('space-worker.js', 'utf8');
  assert.match(space, /style-src 'self';/);
  assert.match(space, /if\(url\.pathname==='\/organization\.css'\|\|url\.pathname==='\/_ekodi\/space\/organization\.css'\)return withHeaders\(env,organizationPublicCss\(\),'organization-asset'\);/);
  const router = readFileSync('platform-router-entry-worker.js', 'utf8');
  assert.match(router, /const WORKSPACE_ASSETS=new Set\(\[[^\]]*'organization\.css'/);
  assert.match(readFileSync('wrangler.site.toml', 'utf8'), /"\/_ekodi\/space\/\*"/);
});
