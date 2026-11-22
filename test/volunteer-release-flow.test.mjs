import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('volunteer guarded release must expand real Supabase environment variables',async()=>{
 const workflow=await read('.github/workflows/deploy-space.yml');
 assert.ok(workflow.includes('Guarded volunteer module schema verification and promotion'));
 assert.ok(workflow.includes('test "${SUPABASE_SCHEMA_PREFLIGHT_MODE:-}" = management'));
 assert.ok(workflow.includes('test -n "${SUPABASE_ACCESS_TOKEN:-}"'));
 assert.ok(!workflow.includes('\\${SUPABASE_SCHEMA_PREFLIGHT_MODE:-}'));
 assert.ok(!workflow.includes('\\${SUPABASE_ACCESS_TOKEN:-}'));
 assert.ok(workflow.includes('verify "$VOLUNTEER_DEV_PROJECT" "$tmp/dev.json"'));
 assert.ok(workflow.includes('verify "$SUPABASE_PROJECT_REF" "$tmp/prod-after.json"'));
});
test('canonical route implementation changes always dispatch shared Site Core',async()=>{
 const source=await read('scripts/recover-release-provenance.mjs');
 const selector=source.slice(source.indexOf('const sharedSiteTouched='),source.indexOf('const shellRuntimeTouched='));
 assert.ok(selector.includes("'canonical-surface-router.js'"));
 assert.ok(selector.includes("'platform-route-registry.js'"));
});
test('Shared Site Core release probes are additive and preserve older probe contracts',async()=>{
 const manifest=JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
 const urls=new Map(manifest.worker.requests.map(req=>[req.url,req]));
 for(const path of ['/volunteer','/volunteer/activities/2026-coal-delivery']){
   const req=urls.get('https://ekodi.kr'+path);
   assert.ok(req,path);
   assert.deepEqual(req.statuses,[200]);
   assert.equal(req.redirect,'manual');
   assert.ok(req.headerExpect.some(h=>h.includes('x-ekodi-canonical-surface: volunteer')));
 }
});
