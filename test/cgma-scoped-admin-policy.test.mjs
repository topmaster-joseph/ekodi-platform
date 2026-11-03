import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
import { validateAdminMenuAudience } from '../scripts/validate-admin-menu-audience.mjs';
const policy=JSON.parse(readFileSync(new URL('../config/admin-menu-audience-policy.json',import.meta.url),'utf8'));
const orchestration=JSON.parse(readFileSync(new URL('../config/ai-change-orchestration-policy.json',import.meta.url),'utf8'));
const agentsText=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
const make=(change=()=>{})=>{const copy=structuredClone(policy);change(copy);return validateAdminMenuAudience({policy:copy,orchestration,registryIds:ADMIN_MENU_REGISTRY.map(x=>x.id),superAdminOnlyIds:[],agentsText});};
test('CGMA-only menus remain outside generic site-type menu template',()=>{
  assert.equal(policy.siteAdminMenuContract.some(group=>group.id==='cgma'),false);
  assert.deepEqual(policy.workspaceScopedSiteAdminMenus.cgma.menus.map(x=>x.id),['applications','booths','market-oversight','petitions','ip-archive','education-survey']);
  assert.deepEqual(make(),[]);
});
test('workspace-specific admin scope cannot be reassigned to another tenant',()=>{
  const bad=make(p=>p.workspaceScopedSiteAdminMenus.cgma.scope='workspace:ekodibiz');
  assert.ok(bad.some(x=>x.includes('workspace admin scope mismatch')),bad.join(';'));
});
test('workspace-specific admin must never inherit platform-admin audience',()=>{
  const bad=make(p=>p.workspaceScopedSiteAdminMenus.cgma.audience='platform-super-admin');
  assert.ok(bad.some(x=>x.includes('workspace admin audience must remain site-admin')),bad.join(';'));
});
test('duplicate or unknown CGMA private menu is refused by policy validator',()=>{
  const bad=make(p=>p.workspaceScopedSiteAdminMenus.cgma.menus.push({id:'booths',ko:'중복'}));
  assert.ok(bad.some(x=>x.includes('duplicate workspace menu')),bad.join(';'));
});
