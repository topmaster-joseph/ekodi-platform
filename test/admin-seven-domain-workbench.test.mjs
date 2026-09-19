import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupForSection,
} from '../admin-menu-registry.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('central Admin is organized into seven management domains',()=>{
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group=>group.labels.ko),[
    '핵심코어','공통서비스','전문서비스','상태서비스','중간관리자','하위관리자','기타',
  ]);
  assert.equal(getAdminMenuGroupForSection('command-home'),'core');
  assert.equal(getAdminMenuGroupForSection('common-services'),'common');
  assert.equal(getAdminMenuGroupForSection('marketing-ai'),'professional');
  assert.equal(getAdminMenuGroupForSection('health'),'status');
  assert.equal(getAdminMenuGroupForSection('clients'),'manager');
  assert.equal(getAdminMenuGroupForSection('campus'),'submanager');
  assert.equal(getAdminMenuGroupForSection('openai'),'other');
});

test('seven-domain regrouping never relaxes high-impact governance metadata',()=>{
  const byId=new Map(ADMIN_MENU_REGISTRY.map(item=>[item.id,item]));
  for(const id of ['aiops','ai-settings','devices']){
    assert.equal(byId.get(id)?.group,'core');
    assert.equal(byId.get(id)?.governance?.globalPolicyMutation,'super_admin');
    assert.equal(byId.get(id)?.governance?.controlPlane,true);
  }
  assert.equal(byId.get('admins')?.superAdminOnly,true);
  assert.equal(byId.get('cmpmyi')?.superAdminOnly,true);
});

test('command home keeps only the canonical sidebar and conversation composer before the first turn',async()=>{
  const [dock,css,bootstrap]=await Promise.all([
    read('admin-assist-dock.js'),
    read('admin-assist-dock.css'),
    read('admin-assist-bootstrap.js'),
  ]);
  assert.match(dock,/placeholder="에코디와 대화하기"/);
  assert.match(dock,/const commandHome=document\.body\.classList\.contains\('admin-command-home'\)/);
  assert.match(dock,/if\(empty&&!commandHome\)/);
  assert.match(css,/body\.admin-command-home\.admin-command-active \.ekodi-assist-rail\{display:none!important\}/);
  assert.match(css,/body\.admin-command-home\.admin-command-active \.ekodi-assist-head\{display:none!important\}/);
  assert.match(bootstrap,/aria-label="에코디와 대화하기"/);
  assert.match(bootstrap,/placeholder="에코디와 대화하기"/);
});

test('menu panels and conversation remain separate right-work-area modes',async()=>{
  const [sidebar,bootstrapCss]=await Promise.all([
    read('admin-sidebar.js'),
    read('admin-assist-bootstrap.css'),
  ]);
  assert.match(sidebar,/activateSection\(nav, detail\.dataset\.adminDetailSection\)/);
  assert.match(sidebar,/getAdminMenuGroupDefault\(group\)/);
  assert.match(bootstrapCss,/body\.admin-command-active \.ekodi-assist\{/);
  assert.match(bootstrapCss,/html body\.admin-command-home\.admin-command-active \.content\{padding:0!important;visibility:hidden!important;pointer-events:none!important\}/);
});
