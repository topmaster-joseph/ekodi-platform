import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retiredBbqRouteResponse } from '../platform-router-entry-worker.js';
import { storeAdminSlug } from '../store-admin-engine.js';
import { renderBbqCheonggyePage } from '../bbq-cheonggye-site.js';
const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('former BBQ locator and every nested URL is 410 and never redirects',async()=>{
  for(const pathname of ['/bbqcheonggye','/bbqcheonggye/','/bbqcheonggye/admin','/bbqcheonggye/admin/site','/bbqcheonggye/assets/site.css','/bbqcheonggye/other?from=old']){
    for(const method of ['GET','HEAD','POST']){
      const response=retiredBbqRouteResponse(new Request('https://ekodi.kr'+pathname,{method}));
      assert.equal(response.status,410,method+pathname);
      assert.equal(response.headers.get('location'),null);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      if(method==='HEAD')assert.equal(await response.text(),'');
    }
  }
});

test('new customer URL and admin are never captured by retired guard',()=>{
  for(const path of ['/bbqcg','/bbqcg/','/bbqcg/admin','/bbqcg/admin/site','/bbqcg/assets/site.css']){
    assert.equal(retiredBbqRouteResponse(new Request('https://ekodi.kr'+path)),null,path);
  }
  assert.equal(storeAdminSlug('/bbqcg/admin'),'bbqcg');
  assert.equal(storeAdminSlug('/bbqcg/admin/site'),'bbqcg');
});
test('new customer HTML is exclusively new locator, including canonical and operator entry',async()=>{
  const response=await renderBbqCheonggyePage(new Request('https://ekodi.kr/bbqcg'),{},{name:'BBQ 무안청계점'});
  const html=await response.text();
  assert.match(html,/data-store-entity="bbqcg"/);
  assert.match(html,/href="\/bbqcg\/admin"/);
  assert.match(html,/href="https:\/\/ekodi\.kr\/bbqcg"/);
  assert.match(html,/href="\/bbqcg\/assets\/site\.css"/);
  assert.doesNotMatch(html,/bbqcheonggye/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
});
test('source + release prove no alias, DB rename, old HTTP 410 and tenant UUID continuity',async()=>{
  const space=await load('space-worker.js');
  const apex=await load('platform-router-entry-worker.js');
  const migration=await load('supabase/migrations/20261108104500_bbqcg_hard_cutover.sql');
  const workflow=await load('.github/workflows/deploy-space.yml');
  assert.match(space,/requested==='bbqcg'&&!workspaceRoute\?\.service&&resolved\.source==='store-user-sites'/);
  assert.match(space,/status:410/);
  assert.match(apex,/if\(retiredBbq\)return finalize\(retiredBbq\)/);
  assert.match(migration,/update public\.tenants/);
  assert.match(migration,/update public\.stores/);
  assert.match(migration,/update public\.store_user_sites/);
  assert.match(migration,/v_tenant_id/);
  assert.match(migration,/v_store_id/);
  assert.doesNotMatch(migration,/insert into public\.tenants|insert into public\.stores|store_members.*insert/i);
  assert.match(workflow,/https:\/\/ekodi\.kr\/bbqcg\/admin/);
  assert.match(workflow,/former_status.*410/);
  assert.doesNotMatch(workflow,/location:target|\/bbqcheonggye\/admin\/site.*admin_url/);
});
