import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('EKODI trademark registry is preparation only and contains no invented registrations',async()=>{
 const r=JSON.parse(await load('docs/brand/rights/ekodi-ip-registry.json'));
 assert.equal(r.canonicalDomain,'ekodi.kr');
 assert.equal(r.status,'preparatory-not-registered');
 assert.equal(r.ownerDecisionRequired,true);
 assert.ok(r.marks.length>=4);
 for(const mark of r.marks){
  assert.equal(mark.holder,null);
  assert.equal(mark.application,null);
  assert.doesNotMatch(mark.status,/^registered$|^filed$/);
  assert.ok(mark.display && mark.kind);
 }
 assert.deepEqual(r.marks.slice(0,2).map(m=>m.display),['에코디','EKODI']);
 assert.equal(r.governance.noRegisteredSymbolBeforeRegistration,true);
 assert.equal(r.governance.noAutomaticLegalFilingOrPayment,true);
 assert.equal(r.governance.noFranchiseBrandWithoutOwnerLicense,true);
});
test('site plans cover the 37 known service manifest entries and preserve tenant sovereignty',async()=>{
 const p=await load('docs/brand/EKODI-SITE-BRAND-ROADMAP-20261110.md');
 const manifest=await load('ekodi-service-manifest.js');
 const names=[...manifest.matchAll(/\{id:'([^']+)',name:'([^']+)'[\s\S]*?url:'([^']+)'/g)].map(m=>m[1]);
 assert.equal(names.length,37);
 for(const id of names)assert.ok(p.includes('(`'+id+'`)'),id);
 assert.match(p,/중앙 AI는 사이트별/);
 assert.match(p,/가맹/);
 assert.match(p,/권한/);
});
test('rights use policy does not present provisional IP as registered or claim partner ownership',async()=>{
 const p=await load('docs/brand/rights/EKODI-BRAND-USE-POLICY-DRAFT.md');
 assert.match(p,/®/);
 assert.match(p,/가맹 본사/);
 assert.match(p,/공식 계약서가 아님/);
 const prep=await load('docs/brand/rights/EKODI-TRADEMARK-FILING-WORKSHEET.md');
 assert.match(prep,/특허고객번호/);
 assert.match(prep,/접수번호 \| 없음/);
});
