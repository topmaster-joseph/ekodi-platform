import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { officialDataConnections } from '../profile-official-data-adapter.js';
import myWorker from '../my-worker.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('deprecated common Invest service is no longer discoverable',async()=>{
 assert.equal(EKODI_SERVICE_MANIFEST.services.some(x=>x.id==='invest'),false);
 const registry=JSON.parse(await read('config/ecosystem-services.json'));
 assert.equal(registry.services.some(x=>x.id==='invest'),false);
 const entry=await read('platform-router-entry-worker.js');
 assert.doesNotMatch(entry,/investUserPage|investSubjectUiScript|routeInvestSite/);
});
test('private My Invest stays owner-only with no public Invest navigation',async()=>{
 const source=await read('invest-my-workspace.js');
 assert.match(source,/ownerAuthority/);
 const page=await myWorker.fetch(new Request('https://ekodi.kr/my/invest'),{});
 assert.equal(page.status,200);
 const html=await page.text();
 assert.match(html,/마이투자/);
 assert.doesNotMatch(html,/href="\/invest(?:\/|")/);
 const access=await myWorker.fetch(new Request('https://ekodi.kr/my/invest/access'),{});
 assert.equal(access.status,401);
});
test('official connection capabilities do not leak secrets or suggest broker execution',()=>{
 const connections=officialDataConnections({OPENDART_API_KEY:'test-secret'});
 assert.equal(JSON.stringify(connections).includes('test-secret'),false);
 assert.equal(connections.find(x=>x.id==='financial_mydata')?.status,'licensed_partner_required');
});
