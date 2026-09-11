import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isPublicWorkspacePath,
  isPublicWorkspaceRootPath,
  isWorkspaceSlug,
  resolveWorkspaceRoute,
  workspaceRouteFromPublicPath,
  workspaceServiceFromPublicPath,
  workspaceSlugFromPublicPath,
} from '../workspace-route-policy.js';
import { isReservedPlatformRoot, platformRouteRegistrySnapshot } from '../platform-route-registry.js';

test('platform root registry is the single reserved-root boundary',()=>{
  for(const root of ['admin','my','auth','api','mcp','webhooks','health']){
    assert.equal(isReservedPlatformRoot(root),true,root);
    assert.equal(isWorkspaceSlug(root),false,root);
  }
  assert.equal(isReservedPlatformRoot('member'),false);
  assert.equal(isWorkspaceSlug('member'),true);
});

test('workspace URLs are type-free locators with optional services',()=>{
  assert.equal(isPublicWorkspaceRootPath('/alpha'),true);
  assert.equal(workspaceSlugFromPublicPath('/alpha'), 'alpha');
  const member=workspaceRouteFromPublicPath('/alpha/member');
  assert.equal(member?.slug,'alpha');
  assert.equal(member?.service,'member');
  assert.equal(member?.public,true);
  assert.equal(workspaceServiceFromPublicPath('/alpha/member'),'member');
  assert.equal(isPublicWorkspacePath('/alpha/member'),true);
  assert.equal(isPublicWorkspacePath('/alpha/community/posts'),true);

  for(const kindLikeSlug of ['church','company','person','store']){
    assert.equal(isWorkspaceSlug(kindLikeSlug),true,kindLikeSlug);
    assert.equal(isPublicWorkspacePath(`/${kindLikeSlug}`),true,kindLikeSlug);
  }
});

test('admin remains a centralized management boundary',()=>{
  assert.equal(isPublicWorkspacePath('/alpha/admin'),false);
  assert.equal(isPublicWorkspacePath('/alpha/orders/admin'),false);
  assert.equal(workspaceRouteFromPublicPath('/alpha/admin')?.routeKind,'legacy-admin');
  assert.equal(isPublicWorkspacePath('/admin'),false);
});

test('workspace identity is resolved from immutable workspace_id, never from kind',async()=>{
  const resolved=await resolveWorkspaceRoute('/alpha/member',async slug=>({
    workspace_id:'ws_immutable_123',slug,kind:'church',
  }));
  assert.equal(resolved?.workspaceId,'ws_immutable_123');
  assert.equal(resolved?.slug,'alpha');
  assert.equal(resolved?.service,'member');
  assert.equal(resolved?.identityResolved,true);
  assert.equal('kind' in resolved,false);

  const unresolved=await resolveWorkspaceRoute('/alpha',async()=>null);
  assert.equal(unresolved?.routeKind,'unresolved');
  assert.equal(unresolved?.workspaceId,null);
  assert.equal(unresolved?.identityResolved,false);
});

test('reserved and retired platform roots cannot collide with workspace slugs',()=>{
  const snapshot=platformRouteRegistrySnapshot();
  for(const root of snapshot.reserved){
    assert.equal(isWorkspaceSlug(root),false,root);
  }
  for(const retired of ['personal','org','group','project','space','user']){
    assert.equal(snapshot.retiredIdentityPrefixes.includes(retired),true,retired);
  }
});

test('unsafe or ambiguous public paths fail closed',()=>{
  for(const path of ['/', '//alpha', '/alpha//member', '/../alpha', '/my/profile']){
    assert.equal(isPublicWorkspacePath(path),false,path);
  }
});

test('machine workspace policy matches the approved 10G routing contract',async()=>{
  const policy=JSON.parse(await readFile(new URL('../config/service-workspace-policy.json',import.meta.url),'utf8'));
  const routing=policy.publicWorkspaceRouting;
  assert.equal(routing.canonicalHost,'ekodi.kr');
  assert.equal(routing.workspaceIdentityKey,'workspace_id');
  assert.equal(routing.slugRole,'routing_locator_only');
  assert.equal(routing.canonicalPattern,'/{slug}');
  assert.equal(routing.servicePattern,'/{slug}/{service}');
  assert.equal(routing.kindEncodedInUrl,false);
  assert.equal(routing.adminPattern,null);
  assert.equal(routing.serviceAdminPattern,null);
  assert.equal(routing.adminSurface,'/admin/workspaces');
  assert.equal(routing.reservedRootSlugsManagedBy,'platform_route_registry');
});
