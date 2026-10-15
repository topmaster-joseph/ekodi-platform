import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text=readFileSync(new URL('../.github/workflows/verify-ekodibiz-doraji-native.yml',import.meta.url),'utf8');
test('Doraji verification runs only after successful protected site-core release or explicit dispatch',()=>{
 assert.match(text,/workflow_run:/);
 assert.match(text,/Deploy EKODI Shared Site Core/);
 assert.match(text,/workflow_run\.conclusion == 'success'/);
 assert.match(text,/workflow_dispatch:/);
 assert.match(text,/push:/);
 assert.match(text,/branches: \[main\]/);
 assert.match(text,/github.event_name == 'push'/);
 assert.match(text,/needs: canonical-readonly/g);
});
test('live checks use canonical apex GET, deny redirects, and require CSP',()=>{
 assert.match(text,/https:\/\/ekodi\.kr/);
 assert.match(text,/method:'GET',redirect:'manual'/);
 assert.match(text,/response\.status!==200/);
 assert.match(text,/content-security-policy/);
 assert.match(text,/persistentData!==false/);
});
test('desktop and mobile use EKODI-owned isolated Chromium worker only',()=>{
 assert.match(text,/device_profile: desktop/);
 assert.match(text,/device_profile: mobile-portrait/);
 assert.equal((text.match(/\.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g)||[]).length,2);
 assert.match(text,/\/ekodibiz\/doraji\/contracts/);
 assert.match(text,/\/ekodibiz\/doraji\/delivery/);
 assert.doesNotMatch(text,/tinyfish|browserbase|desktop-commander|puppeteer-cloud/i);
});
