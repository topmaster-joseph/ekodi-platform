import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {personAuthorityPage,personAuthorityScript} from '../person-authority-page.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('lookup endpoint requires verified-Google platform admin, exact match only, and audits',async()=>{
  const api=await read('supabase/functions/access-api/index.ts');
  const route=api.slice(api.indexOf('path==="/admin/person"'),api.indexOf('path==="/platform-authority"'));
  assert.match(route,/if\(!await platformAdmin\(auth\.user\.id\)\)return json\(req,\{error:"platform_admin_required"\},403\)/);
  assert.match(route,/query\.length<3/);
  assert.match(route,/action:"admin\.person_lookup"/);
  assert.match(route,/personIds\.slice\(0,5\)/);
  const resolver=api.slice(api.indexOf('async function lookupPersonIds'),api.indexOf('const subjectHint'));
  assert.doesNotMatch(resolver,/\.(like|ilike|textSearch)\(/,'no partial or fuzzy matching');
  assert.match(resolver,/\.eq\("email",query\.toLowerCase\(\)\)/);
  // Effective root authority mirrors platformAdmin(): role alone is not enough without verified Google.
  assert.match(api,/platformAdminEffective:hasGoogle&&/);
  assert.match(api,/subjectHint\(r\.provider_subject\)/,'provider subject is never returned in full');
});

test('page is no-store, locked by CSP, and renders member data only via textContent',async()=>{
  const page=personAuthorityPage();
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'),'DENY');
  const html=await page.text();
  assert.match(html,/<script src="\/admin\/people\/script" defer><\/script>/);
  const js=await personAuthorityScript().text();
  new Function(js); // parses
  assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(js,/textContent=String\(text\)/);
  assert.match(js,/call\('\/platform-authority'\)/);
  assert.match(js,/s\.length>12\?s\.slice\(0,12\)\.join\(''\)\+'…'/,'display names are capped at 12 characters');
});

test('both admin tools are routed, bypass static assets, and can return from central login',async()=>{
  for(const f of ['platform-router-entry-worker.js','site-worker.js']){
    const src=await read(f);
    assert.match(src,/personAuthorityScript\(\)/,f);assert.match(src,/personAuthorityPage\(\)/,f);
  }
  assert.match(await read('canonical-surface-router.js'),/path==='\/admin\/people'/);
  // Served under the existing Worker-first /admin/* route (no .js suffix), so the
  // run_worker_first list stays within Cloudflare's route capacity.
  assert.doesNotMatch(await read('wrangler.site.toml'),/person-authority/);
  assert.match(await read('wrangler.site.toml'),/"\/admin\/\*", "!\/admin\/\*\.js"/);
  const auth=await read('auth-site/auth.js');
  assert.match(auth,/site==='portal'&&\['\/admin\/site-admins','\/admin\/site-admins\/','\/admin\/people','\/admin\/people\/'\]\.includes\(target\.pathname\)/);
  for(const f of ['person-authority-page.js','site-admin-bootstrap-page.js'])
    assert.match(await read(f),/localStorage\.getItem\('sb-renzehysxirjilvdxacv-auth-token'\)/,f);
  assert.match(await read('auth-site/auth-router.js'),/auth\.js\?v=20261101-merge-report-1/);
});
