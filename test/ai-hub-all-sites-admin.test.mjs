import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isWorkspaceAdminPathShape,workspaceRouteFromPublicPath} from '../workspace-route-policy.js';
const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');

const script=readFileSync(new URL('../ai-operations-center-admin.js',import.meta.url),'utf8');
const lifecycle=JSON.parse(readFileSync(new URL('../config/site-lifecycle-registry.json',import.meta.url),'utf8'));

test('registered workspace sites are represented once plus existing independent site services',()=>{
  const found=script.match(/const SITE_AI_SETTINGS = Object\.freeze\((\[.*?\])\.map\(Object\.freeze\)\);/s);
  assert.ok(found,'site list exists');
  const entries=JSON.parse(found[1]);
  assert.equal(entries.length,13);
  assert.equal(new Set(entries.map(item=>item.slug)).size,13);
  for(const item of lifecycle.existingWorkspaceSites){
    const canonical=new URL(item.canonicalUrl);
    const slug=canonical.pathname.slice(1);
    const exact=entries.find(entry=>entry.slug===slug);
    assert.ok(exact,'site omitted: '+slug);
    assert.equal(exact.path,'/'+slug+'/admin/services');
    assert.ok(isWorkspaceAdminPathShape(exact.path)||['cheonggye','ekodilab'].includes(slug),'admin route unsupported: '+slug);
  }
  for(const slug of ['ekodimall','ekodimission'])assert.ok(entries.some(s=>s.slug===slug));
  assert.match(script,/사이트 관리자 권한으로만 저장/);
});

test('dedicated region/lab public owners remain unchanged while only settings pages hand off',()=>{
  assert.equal(workspaceRouteFromPublicPath('/cheonggye')?.slug,'cheonggye');
  assert.equal(workspaceRouteFromPublicPath('/ekodilab'),null);
  assert.equal(isWorkspaceAdminPathShape('/cheonggye/admin/services'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodilab/admin/services'),false);
  assert.equal(isWorkspaceAdminPathShape('/admin/services'),false);
  assert.match(router,/SITE-AI-TOOLS-ADMIN-ROUTE-001/);
  for(const slug of ['cheonggye','ekodilab']){
    assert.ok(router.includes("url.pathname==='/"+slug+"/admin/services'"));
  }
  assert.ok(router.indexOf('SITE-AI-TOOLS-ADMIN-ROUTE-001')<router.indexOf('const canonical=await routeCanonicalSurface'));
  assert.match(router,/return injectEkodiShell\(workspaceAdminPage\(\),'space','admin'\)/);
});

test('workflow readiness uses canonical provider state, never implies external execution grants',()=>{
  assert.match(script,/const WORKFLOW_TOOL_IDS = Object\.freeze/);
  assert.match(script,/provider\?\.configured&&provider\?\.enabled&&provider\?\.health==='healthy'/);
  assert.match(script,/외부 API 미검증/);
  assert.match(script,/기존 업무 연결 · 외부 자동실행 미승인/);
  assert.doesNotMatch(script,/data-workflow-auto-run/);
});
