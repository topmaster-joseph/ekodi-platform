import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const boundaries=JSON.parse(fs.readFileSync(new URL('../platform-boundaries.json',import.meta.url),'utf8'));
const worker=fs.readFileSync(new URL('../publishing-worker.js',import.meta.url),'utf8');
const contract=fs.readFileSync(new URL('../docs/operations/bookstore-publishing-boundary.md',import.meta.url),'utf8');

const byId=new Map(EKODI_SERVICE_MANIFEST.services.map(service=>[service.id,service]));

test('public bookstore brand is 에코디서점 and publishing is 출판',()=>{
  assert.equal(byId.get('books')?.name,'에코디서점');
  assert.equal(byId.get('publishing')?.name,'출판');
  assert.equal(byId.get('books')?.url,'https://books.ekodi.kr/');
  assert.equal(byId.get('publishing')?.url,'https://publishing.ekodi.kr/');
});

test('bookstore does not own publishing capabilities',()=>{
  const bookstoreCaps=new Set(byId.get('books')?.capabilities||[]);
  for(const capability of ['publishing','consultation','production','publishing-agency','distribution','studio']){
    assert.equal(bookstoreCaps.has(capability),false,`books must not own ${capability}`);
  }
  assert.deepEqual(byId.get('books')?.capabilities,['books','catalog','storefront','commerce']);
});

test('publishing is declared as an independent platform',()=>{
  const publishing=boundaries.platforms?.publishing;
  assert.ok(publishing,'platform-boundaries.json must declare publishing');
  assert.equal(publishing.kind,'independent-platform');
  assert.ok(publishing.domains.includes('publishing.ekodi.kr'));
  assert.ok(publishing.sharedDependencies.some(value=>value.includes('books public catalog contract')));
});

test('cross-service relationship is explicit contract only',()=>{
  assert.match(worker,/independentPlatform:true/);
  assert.match(worker,/bookstoreRelationship:'explicit-public-handoff-only'/);
  assert.match(worker,/privateCrossServiceDataAccess:false/);
  assert.match(contract,/공개 또는 명시적으로 선언된 API·handoff 계약/);
});
