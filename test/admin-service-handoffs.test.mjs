import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_SERVICE_CATALOG,
  canonicalServiceAdminPath,
  canonicalServiceAdminUrl,
} from '../admin-service-catalog.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hierarchy=JSON.parse(fs.readFileSync(path.join(root,'config/admin-site-hierarchy.json'),'utf8'));
const menuSource=fs.readFileSync(path.join(root,'admin-menu-registry.js'),'utf8');
const handoffSource=fs.readFileSync(path.join(root,'admin-service-handoffs.js'),'utf8');

const HIERARCHY_TO_CATALOG=Object.freeze({
  ekodibiz:'biz',
  ekodimall:'mall',
  'ekodibiz-trade':'trade',
  ekodichurch:'church',
  cgma:'cgma',
  cmpmyi:'cmpmyi',
  jadam:'jadam',
  pizzamaru:'pizzamaru',
  yogurt:'yogurt',
});

test('superadmin service handoff catalog preserves canonical five-axis menu',()=>{
  assert.match(menuSource,/import '\.\/admin-service-handoffs\.js';/);
  const groupIds=[...menuSource.matchAll(/\{ id: '(home|operations|workspaces|services|system)'/g)].map(match=>match[1]);
  assert.deepEqual(groupIds.slice(0,5),['home','operations','workspaces','services','system']);
  assert.doesNotMatch(menuSource,/id: 'service-admins'/);
});

test('service and subsite admin catalog uses only ekodi.kr path-owned /admin addresses',()=>{
  assert.ok(ADMIN_SERVICE_CATALOG.length>=35);
  const ids=new Set();
  const adminPaths=new Set();
  for(const item of ADMIN_SERVICE_CATALOG){
    assert.ok(!ids.has(item.id),`duplicate id ${item.id}`);ids.add(item.id);
    assert.match(item.basePath,/^\/[a-z0-9][a-z0-9/-]*$/i);
    assert.ok(!item.basePath.includes('.ekodi.kr'));
    const adminPath=canonicalServiceAdminPath(item.basePath);
    assert.match(adminPath,/\/admin$/);
    assert.ok(!adminPath.startsWith('/admin/'));
    assert.ok(!adminPaths.has(adminPath),`duplicate admin path ${adminPath}`);adminPaths.add(adminPath);
    assert.equal(canonicalServiceAdminUrl(item.basePath),`https://ekodi.kr${adminPath}`);
  }
});

test('machine site hierarchy is represented in the superadmin handoff catalog',()=>{
  const byId=new Map(ADMIN_SERVICE_CATALOG.map(item=>[item.id,item]));
  for(const site of hierarchy.sites||[]){
    if(site.id==='platform')continue;
    const catalogId=HIERARCHY_TO_CATALOG[site.id]||site.id;
    const item=byId.get(catalogId);
    assert.ok(item,`missing catalog item for hierarchy site ${site.id}`);
    assert.equal(canonicalServiceAdminPath(item.basePath),site.adminPath,`${site.id} canonical admin mismatch`);
  }
});

test('campus service names hand off to canonical owner admin instead of duplicating CRUD',()=>{
  assert.match(handoffSource,/data-service-admin-name/);
  assert.match(handoffSource,/location\.assign\(url\)/);
  assert.match(handoffSource,/서비스 관리자/);
  assert.doesNotMatch(handoffSource,/admin\.ekodi\.kr/);
  assert.match(handoffSource,/legacy==='my\.ekodi\.kr'\)row\.hidden=true/);
  assert.doesNotMatch(handoffSource,/(?:href|adminUrl)\s*=\s*['"`]https?:\/\/my\.ekodi\.kr/);
});
