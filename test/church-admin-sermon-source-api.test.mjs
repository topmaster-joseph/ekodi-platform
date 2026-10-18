import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleChurchAdminSermonSource} from '../church-admin-sermon-source-api.js';
const make=(path,options)=>new Request('https://ekodi.kr'+path,options);
test('Public route does not exist and missing bearer is rejected',async()=>{
 assert.equal(await handleChurchAdminSermonSource(make('/api/public/church-worship-drive-source?date=2026-10-18')),null);
 const r=await handleChurchAdminSermonSource(make('/api/admin/church-worship-drive-source?date=2026-10-18'));
 assert.equal(r.status,401);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
});
test('An untrusted token or an unrelated church role cannot fetch a manuscript URL',async()=>{
 const request=make('/api/admin/church-worship-drive-source?date=2026-10-18',{headers:{authorization:'Bearer fake'}});
 const forbidden=await handleChurchAdminSermonSource(request,{},{
  fetch:async()=>new Response(JSON.stringify({permissions:{worship:false}}),{status:200})
 });
 assert.equal(forbidden.status,403);
 assert.doesNotMatch(await forbidden.text(),/15WKmDyYo7lfB3UwBze_dgPb2c0K0Lw8BePWiL-sByKY/);
 const diffOrigin=make('/api/admin/church-worship-drive-source?date=2026-10-18',{headers:{authorization:'Bearer fake',origin:'https://evil.example'}});
 assert.equal((await handleChurchAdminSermonSource(diffOrigin)).status,403);
});
test('Approved church worship operator sees only the selected Google manuscript',async()=>{
 const request=make('/api/admin/church-worship-drive-source?date=2026-10-18',{headers:{authorization:'Bearer operator-token'}});
 const resp=await handleChurchAdminSermonSource(request,{},{
  fetch:async()=>new Response(JSON.stringify({permissions:{worship:true}}),{status:200})
 });
 assert.equal(resp.status,200);
 const data=await resp.json();
 assert.equal(data.ok,true);
 assert.match(data.manuscript.editUrl,/15WKmDyYo7lfB3UwBze_dgPb2c0K0Lw8BePWiL-sByKY\/edit/);
 assert.match(data.manuscript.previewUrl,/\/preview/);
 assert.equal(data.manuscript.sourceOfTruth,'google-drive-original');
 const missing=await handleChurchAdminSermonSource(make('/api/admin/church-worship-drive-source?date=2026-10-25',{headers:{authorization:'Bearer operator-token'}}),{},{
  fetch:async()=>new Response(JSON.stringify({permissions:{worship:true}}),{status:200})
 });
 assert.equal(missing.status,404);
});
test('Canonical API router mounts private lookup, and pastor admin is gated',()=>{
 const ingress=readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../church-pastor-admin-page.js',import.meta.url),'utf8');
 assert.match(ingress,/handleChurchAdminSermonSource\(request,env\)/);
 assert.match(admin,/originalSermonPanel/);
 assert.match(admin,/churchSermonFrame/);
 assert.match(admin,/session\?\.accessToken/);
 assert.match(admin,/frame-src https:\/\/docs\.google\.com/);
 assert.doesNotMatch(admin,/15WKmDyYo7lfB3UwBze_dgPb2c0K0Lw8BePWiL-sByKY/);
});
