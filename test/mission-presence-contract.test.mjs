import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
test('mission attendance is tenant-isolated and private',()=>{
 const page=read('./ekodimission-presence.page');
 const js=read('./ekodimission-presence.js');
 assert.match(page,/noindex,nofollow,noarchive/);
 assert.match(page,/id="operator" hidden/);
 assert.match(js,/tenant:'ekodimission'/);
 assert.match(js,/if\(response.status===403\)/);
 assert.doesNotMatch(js,/service_role|SERVICE_ROLE_KEY/);
});