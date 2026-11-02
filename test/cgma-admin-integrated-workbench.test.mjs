import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { workspaceAdminScript, workspaceAdminCanAccess } from '../workspace-admin-page.js';

const file=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const policy=JSON.parse(readFileSync(new URL('../config/admin-menu-audience-policy.json',import.meta.url),'utf8'));
const six=['applications','booths','market-oversight','petitions','ip-archive','education-survey'];

test('CGMA dedicated admin sections are classified as site-admin in the shared registry',()=>{
  const group=policy.workspaceScopedSiteAdminMenus.cgma;
  assert.equal(group.audience,'site-admin');
  assert.equal(group.scope,'workspace:cgma');
  assert.deepEqual(group.menus.map(x=>x.id),six);
  assert.ok(file.includes("workspace==='cgma'?[{id:'cgma-review'"));
  assert.ok(file.includes("if(workspace==='cgma'&&CGMA_EMBEDDED_PANELS[section])return cgmaEmbeddedAdmin(section)"));
});

test('admin session remains tenant-scoped, with no new read/write authority for anonymous users',()=>{
  assert.ok(workspaceAdminCanAccess('admin','applications'));
  assert.ok(workspaceAdminCanAccess('admin','ip-archive'));
  assert.equal(workspaceAdminCanAccess('viewer','applications'),false);
  assert.equal(workspaceAdminCanAccess('viewer','ip-archive'),false);
  assert.ok(file.includes("if(workspace!=='cgma')return permissionPanel()"));
  assert.ok(file.includes("const token=await accessToken()"));
});

test('iframe only accepts exact same-origin, exact frame and authorized existing section',()=>{
  assert.ok(file.includes("'/cgma/operations-admin/?inline=1&section='+encodeURIComponent(panel)"));
  assert.ok(file.includes("event.source!==frame.contentWindow||event.origin!==location.origin"));
  assert.ok(file.includes("event.data.section===panel"));
  assert.ok(file.includes("postMessage({type:'ekodi:cgma-admin:session',accessToken:token},location.origin)"));
  assert.ok(!file.includes('accessToken='+encodeURIComponent));
  assert.ok(file.includes("summary.replaceChildren();host.replaceChildren()"));
  assert.ok(file.includes("window.addEventListener('pagehide'"));
});

test('shared UI retains one central language menu rather than duplicating legacy languageManager',()=>{
  assert.ok(file.includes("languages:POLICY.capabilities.language"));
  assert.ok(!file.includes("'language-review':'languageManager'"));
});

test('actual served workspace admin script parses and exposes the CGMA panel routing',async()=>{
  const source=await workspaceAdminScript().text();
  assert.doesNotThrow(()=>new Script(source));
  for(const section of six)assert.ok(source.includes(section),section);
});

test('staged rollout fails closed until CGMA Pages workbench is actually deployed',()=>{
  assert.ok(file.includes("redirect:'error',headers:{accept:'text/html'}"));
  assert.ok(file.includes("if(!markup.includes('async function embeddedSession()'))throw new Error('CGMA_WORKBENCH_NOT_RELEASED')"));
  assert.ok(file.includes("host.append(notice,link);state('연결 확인 필요');return"));
});
