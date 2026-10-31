import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// Wrangler bundles with esbuild keepNames, which injects __name(fn,"name") calls into
// function bodies. organizationAdminScript() ships clientMain.toString() to the browser,
// so the served script must define __name itself or every organization admin page
// (Hammu, 목포노회, 선교부) crashes with "ReferenceError: __name is not defined".
test('organization admin browser script survives esbuild keepNames bundling', async (t) => {
  let build;
  try { ({ build } = await import('esbuild')); } catch { t.skip('esbuild not installed'); return; }
  const out = await build({
    entryPoints: [new URL('../organization-admin-page.js', import.meta.url).pathname],
    bundle: true, format: 'esm', keepNames: true, write: false, platform: 'neutral',
  });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  const js = await (await mod.organizationAdminScript()).text();
  assert.match(js, /__name\(/, 'bundled script should contain keepNames helpers (test precondition)');
  const el = () => ({ set textContent(_) {}, set innerHTML(_) {}, querySelectorAll: () => [], classList: { toggle() {} }, addEventListener() {} });
  const supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) };
  const ctx = { location: new URL('https://ekodi.kr/mokpo-presbytery/mission/admin'), document: { getElementById: el, querySelectorAll: () => [] }, URL, console, setTimeout, window: { supabase }, supabase, fetch: async () => ({ ok: false, json: async () => ({}) }) };
  assert.doesNotThrow(() => vm.runInNewContext(js, ctx));
});

test('organization admin mobile layout cannot be widened by the nowrap section nav', async () => {
  const { organizationAdminCss } = await import('../organization-admin-page.js');
  const css = await (await organizationAdminCss()).text();
  const mobile = css.slice(css.indexOf('@media(max-width:820px)'));
  assert.match(mobile, /\.oa-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(mobile, /\.oa-side\{min-width:0;/);
});
