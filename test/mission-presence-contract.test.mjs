import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
test('mission attendance is tenant-isolated and private',()=>{
 const page=read('../space/ekodimission-presence.page');
 const js=read('../space/ekodimission-presence.js');
 assert.match(page,/noindex,nofollow,noarchive/);
 assert.match(page,/id="operator" hidden/);
 assert.match(js,/tenant:'ekodimission'/);
 assert.match(js,/if\(response.status===403\)/);
 assert.doesNotMatch(js,/service_role|SERVICE_ROLE_KEY/);
});
test('mission public worker routes onsite presence while preserving private robots',()=>{
 const worker=read('../space-worker.js');
 assert.match(worker,/\['\/ekodimission\/presence','\/ekodimission-presence\.page'\]/);
 assert.match(worker,/pathname==='\/ekodimission\/presence'/);
 assert.match(worker,/ekodimission\/assets\/presence-operator\.js/);
});

test('mission hidden resolution form cannot leak through CSS',()=>{assert.match(read('../space/ekodimission-presence.css'),/\.ekodi-presence \[hidden\]\{display:none!important\}/);});
