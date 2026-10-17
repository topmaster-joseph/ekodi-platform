import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('canonical Church EKODI Live bridge routes through common tenant broadcaster',async()=>{
 const router=await read('platform-router-entry-worker.js');
 assert.match(router,/url\.pathname==='\/live\/church'/);
 assert.match(router,/url\.pathname==='\/live\/church\/'/);
 assert.match(router,/realtimeTenantFromPath\('\/ekodichurch\/live\/'\)/);
 assert.match(router,/apiTenant!=='ekodichurch'/);
 assert.match(router,/path:'\/live\/church\/',dedicated:false/);
 assert.match(router,/return tenantLivePage\(canonicalChurch\)/);
 assert.match(router,/return tenantLiveAdminPage\(canonicalChurch\)/);
 assert.match(router,/livePublicStatus\(env,church\)==='maintenance'/);
 assert.doesNotMatch(router,/\/live\/church.*meet\.jit\.si/);
});

test('bounded Church activity modes never bypass tenant, channel readiness or server permission',async()=>{
 const script=await read('tenant-live.js');
 const page=await read('tenant-live-page.js');
 assert.match(script,/cfg\.tenant!=='ekodichurch'/);
 assert.match(script,/sunday:'worship',prayer:'worship',fellowship:'meeting',event:'meeting',mission:'public_broadcast'/);
 assert.match(script,/mode:activityRoomMode\(\)/);
 assert.match(script,/title:\(params\.get\('title'\)\|\|''\)\.slice\(0,150\)/);
 assert.match(script,/broadcastMode:destinationIds\.length\?'ekodi\+external'/);
 assert.match(script,/input\.disabled=!channel\.selectable/);
 assert.match(page,/id="externalDestinations"/);
 assert.match(page,/id="goLiveButton"/);
 assert.match(page,/id="managementCameraSources"/);
 assert.match(page,/id="screenButton"/);
 assert.doesNotMatch(script,/streamKey\s*=/);
});

test('EKODI Live public hub and admin panel both select the canonical Church studio',async()=>{
 const hub=await read('live-service-page.js');
 assert.match(hub,/tenant\.apiTenant==='ekodichurch'\?'\/live\/church\/'/);
 assert.match(hub,/const liveAdminPath=tenant=>cleanPath\(publicLivePath\(tenant\)\)\+'\/admin'/);
 assert.equal((hub.match(/\$\{esc\(tenant\.path\)\}/g)||[]).length,0);
 assert.ok((hub.match(/\$\{esc\(publicLivePath\(tenant\)\)\}/g)||[]).length>=4);
});
