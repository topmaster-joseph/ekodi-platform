import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const activeFiles=[
  'CONSTITUTION.md','governance/constitution/constitution.json','governance/constitution/domain.md','config/service-workspace-policy.json',
  'platform-router-entry-worker.js','site-worker.js','workspace-route-policy.js','space-worker.js','space/app.js','workspace-admin-page.js','workspace-trade-admin-page.js',
  'mail-admin-page.js','supabase/functions/workspace-api/index.ts','wrangler.site.toml','deploy/manifests/shared-site.worker.json','deploy/manifests/space.worker.json','.github/workflows/deploy-space.yml'
];
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('current public workspace grammar contains no type-prefixed route records',async()=>{
  const retiredKinds=['personal','o'+'rg','group','project'];
  for(const file of activeFiles){
    const source=await read(file);
    let activeSource=source;
    if(file==='site-worker.js') activeSource=activeSource.replace("const LEGACY_EKODIBIZ_PREFIX = '/org/ekodibiz';", '');
    if(file==='wrangler.site.toml') activeSource=activeSource.replace('"/org/ekodibiz*", ', '');
    for(const kind of retiredKinds){
      assert.ok(!activeSource.includes('/'+kind+'/'),file+': '+kind);
      assert.ok(!activeSource.includes('/'+kind+'/{'),file+': '+kind+' template');
    }
  }
  const siteWorker=await read('site-worker.js');
  assert.ok(siteWorker.includes("const LEGACY_EKODIBIZ_PREFIX = '/org/ekodibiz';"));
  assert.ok(siteWorker.includes('redirectLegacyEkodiBizPath'));
  const wrangler=await read('wrangler.site.toml');
  assert.ok(wrangler.includes('"/org/ekodibiz*"'));
});

test('workspace public routing is slug-rooted while immutable identity remains workspace_id',async()=>{
  const [constitution,policy,api]=await Promise.all([
    read('governance/constitution/constitution.json'),read('config/service-workspace-policy.json'),read('supabase/functions/workspace-api/index.ts')
  ]);
  assert.ok(constitution.includes('https://ekodi.kr/{slug}'));
  assert.ok(policy.includes('"canonicalPattern": "/{slug}"'));
  assert.ok(api.includes('workspace_id:String(row.id)'));
  assert.ok(api.includes('url:`https://ekodi.kr/${encodeURIComponent(String(row.slug))}`'));
  assert.ok(!api.includes('path_type'));
});
