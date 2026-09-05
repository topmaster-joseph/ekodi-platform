import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isStoreAdminPathShape,
  resolveStoreAdminRoute,
  storeAdminPage,
  storeAdminScript,
} from '../store-admin-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [migration,worker,manifestText]=await Promise.all([
  read('supabase/migrations/20260906005000_store_user_site_provisioning.sql'),
  read('space-worker.js'),
  read('deploy/manifests/shared-site.worker.json'),
]);
const manifest=JSON.parse(manifestText);
const stores=[
  ['jadam','자담치킨 목포대점'],
  ['pizzamaru','피자마루 목포대점'],
  ['yogurt','요거트퍼플 목포대점'],
];

test('store user site is automatically provisioned from the canonical workspace slug',()=>{
  assert.match(migration,/create table if not exists public\.store_user_sites/);
  assert.match(migration,/after insert or update of operating_space_slug/);
  assert.match(migration,/workspace_automatic/);
  assert.match(migration,/shared_shell_workspace_automatic/);
  assert.match(migration,/store_user_site_public_profile/);
});
test('all store admins expose user-site settings through the common engine',async()=>{
  const js=await storeAdminScript().text();
  for(const [slug,name] of stores){
    assert.equal(isStoreAdminPathShape(`/${slug}/admin/site`),true);
    const profile=await resolveStoreAdminRoute(`/${slug}/admin/site`,()=>{throw new Error('bootstrap profile must not fetch')});
    const html=await storeAdminPage(profile).text();
    assert.match(html,/store-site-admin/);
    assert.match(html,new RegExp(name));
  }
  assert.match(js,/사용자 사이트/);
  assert.match(js,/store_user_site_admin_snapshot/);
  assert.match(js,/update_store_user_site_settings/);
  assert.match(js,/Workspace 자동/);
  assert.match(js,/가입만으로/);
});

test('space worker reads public-safe site profile and honors pause and alias state',()=>{
  assert.match(worker,/store_user_site_public_profile/);
  assert.match(worker,/resolved\.canonicalSlug/);
  assert.match(worker,/resolved\.status==='paused'/);
  assert.match(worker,/x-ekodi-workspace-alias/);
});

test('site settings keep authorization bound to immutable store identity',()=>{
  assert.match(migration,/can_manage_store_user_site/);
  assert.match(migration,/store_members/);
  assert.match(migration,/store_owner/);
  assert.match(migration,/tenant_admin/);
  assert.match(migration,/platform_admin/);
  assert.match(migration,/Canonical identity remains stores\.id/);
});
test('signup is identity-only and site materialization waits for store slug',async()=>{
  const js=await storeAdminScript().text();
  assert.match(js,/Person \/ EKODI ID/);
  assert.match(js,/operating_space_slug/);
  assert.match(js,/JIT/);
});

test('production smoke uses markers present in static common store-admin HTML',()=>{
  const names={jadam:'자담치킨 목포대점',pizzamaru:'피자마루 목포대점',yogurt:'요거트퍼플 목포대점'};
  for(const [slug,name] of Object.entries(names)){
    const request=manifest.worker.requests.find(item=>item.url===`https://ekodi.kr/${slug}/admin/site`);
    assert.ok(request,`missing production smoke for ${slug}/admin/site`);
    assert.deepEqual(request.expect,[name,'store-site-admin']);
    assert.ok(!request.expect.includes('사용자 사이트'),'client-rendered text must not be used as a pre-JS smoke marker');
  }
});
