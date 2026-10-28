import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GROWTH_ORGANIZATIONS_PATH,projectGrowthOrganizationInventory,
  handleGrowthOrganizationControl,
} from '../growth-organization-control.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sites=[
  {id:'church',workspaceId:'workspace-church',name:'에코디교회',canonicalUrl:'https://ekodi.kr/ekodichurch/',source:'independent-site'},
  {id:'market',workspaceId:'workspace-market',name:'상인회',canonicalUrl:'https://ekodi.kr/cgma/',source:'independent-site'},
  {id:'admin',workspaceId:'admin',name:'System',canonicalUrl:'https://ekodi.kr/admin',source:'manifest'},
  {id:'evil',workspaceId:'cross-site',name:'External',canonicalUrl:'https://outside.example.com/other',source:'manifest'},
  {id:'church',workspaceId:'different-workspace',name:'Duplicate',canonicalUrl:'https://ekodi.kr/duplicate',source:'manifest'},
];
const rows=[
  {site_id:'church',workspace_id:'workspace-church',public_status:'private'},
  {site_id:'market',workspace_id:'some-other-tenant',public_status:'maintenance'},
];

test('Growth OS reads a broader platform site registry but does not claim a legal organization ledger',()=>{
  const output=projectGrowthOrganizationInventory(sites,rows);
  assert.equal(output.sites.length,2);
  assert.equal(output.summary.private,1);
  assert.equal(output.summary.maintenance,1);
  assert.equal(output.summary.identityConflicts,1);
  assert.equal(output.summary.identifiedWorkspaceKeys,2);
  assert.equal(output.sites.find(x=>x.id==='church').publicStatus,'private');
  assert.equal(output.sites.find(x=>x.id==='market').identityStatus,'identity_conflict');
  assert.equal(output.sites.every(x=>x.purposeStatus==='owner_confirmation_required'),true);
  assert.equal(output.sites.every(x=>x.evidenceStatus==='not_connected'),true);
  assert.equal(Object.hasOwn(output.sites[0],'tenantId'),false);
  assert.equal(Object.hasOwn(output.sites[0],'updatedBy'),false);
});

test('missing control state is explicitly unknown; never silently public',()=>{
  const output=projectGrowthOrganizationInventory(sites,[]);
  assert.equal(output.summary.statusUnknown,2);
  assert.equal(output.sites[0].publicStatus,'unknown');
  assert.equal(output.sites[0].identityStatus,'unconfirmed');
  assert.equal(projectGrowthOrganizationInventory(sites,rows,{limit:1}).summary.truncated,true);
});

test('Growth inventory endpoint rejects wrong method and cross-origin before any database work',async()=>{
  let touched=false;
  const env={DB:{prepare(){touched=true;throw Error('unexpected database access')}}};
  const method=await handleGrowthOrganizationControl(new Request('https://ekodi.kr'+GROWTH_ORGANIZATIONS_PATH,{method:'POST'}),env);
  assert.equal(method.status,405);
  const origin=await handleGrowthOrganizationControl(new Request('https://ekodi.kr'+GROWTH_ORGANIZATIONS_PATH,{headers:{Origin:'https://evil.example.net'}}),env);
  assert.equal(origin.status,403);
  const unrelated=await handleGrowthOrganizationControl(new Request('https://ekodi.kr/other'),env);
  assert.equal(unrelated,null);
  assert.equal(touched,false);
});

test('Control API uses server-verified highest-admin identity and strictly read-only inventory',()=>{
  const source=read('growth-organization-control.js');
  const control=read('mission-control-entry-worker.js');
  const ui=read('growth-os-admin.js');
  const publication=read('site-publication-runtime.js');
  assert.match(source,/authWorker\.fetch/);
  assert.match(source,/s\?\.role!=='super_admin'/);
  assert.match(source,/sitePublicationCatalog\(env\)/);
  assert.doesNotMatch(source,/await\s+listSitePublicationSettings\(/);
  assert.match(source,/SELECT site_id,workspace_id,public_status FROM public_site_controls/);
  assert.match(publication,/export async function sitePublicationCatalog/);
  assert.match(control,/handleGrowthOrganizationControl/);
  assert.match(ui,/api\/control\/growth-os\/organizations/);
  assert.match(ui,/identityStatus==='identity_conflict'/);
  assert.match(ui,/조직·사이트 원장 조회 불가/);
  assert.doesNotMatch(source,/\.batch\(|\.run\(|\.bind\(|fetch\(\s*['"]https?:\/\//);
});
