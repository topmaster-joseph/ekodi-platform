import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('deployed admin layout canary verifies all three live CSS assets without real credentials',async()=>{
 const src=await read('scripts/verify-admin-three-surfaces-live-layout.mjs');
 for(const marker of ['DEVOTIONAL-ADMIN-LAYOUT-20261114','SOCIAL-ADMIN-LAYOUT-20261114','CHURCH-WORSHIP-LAYOUT-20261114'])assert.ok(src.includes(marker));
 for(const width of [320,390,768,1366,1440])assert.ok(src.includes(String(width)));
 assert.match(src,/guest-safe|Guest-safe|inert synthetic|Inert fixtures/i);
 assert.match(src,/response.status===429/);
 assert.match(src,/assert\.equal\(response\.status,200/);
 assert.match(src,/assert\.ok\(m\.hostWidth>120&&m\.left>=-2&&m\.right<=width\+2&&m\.overflow<=2/);
 assert.match(src,/evidence\.json/);
 assert.match(src,/screenshot/);
 assert.doesNotMatch(src,/(?:fetch|request)\s*\(\s*['"][^'"]+['"]\s*,\s*\{\s*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
 assert.doesNotMatch(src,/sessionStorage|localStorage|Bearer\s+\$\{|client_secret|service_role/);
});

test('protected post-deploy verification workflow executes canary without bypassing required checks',async()=>{
 const workflow=await read('.github/workflows/verify-admin-production-ui-e2e.yml');
 assert.match(workflow,/node --check scripts\/verify-admin-three-surfaces-live-layout\.mjs/);
 assert.match(workflow,/node scripts\/verify-admin-three-surfaces-live-layout\.mjs/);
 assert.match(workflow,/artifacts\/admin-three-surfaces-layout/);
 assert.match(workflow,/github\.event_name != 'pull_request'/);
 assert.match(workflow,/Verify production Admin menu paths/);
});
