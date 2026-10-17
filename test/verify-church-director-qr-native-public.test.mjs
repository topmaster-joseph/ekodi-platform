import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-church-director-qr-native-public.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-church-director-qr-native-public.yml',import.meta.url),'utf8');

test('EKODI owns isolated Chromium public QR camera and on-stage resize',()=>{
 for(const s of ["chromium.launch","ekodi-owned-isolated-headless-chromium",
  "'https://ekodi.kr/ekodichurch/live/?mode=studio'","1366,900","390,844",
  "#openManagementCameraButton","#presenterResizeGrip","#chatOverlaySource",
  "#programScreen","overlay-resize-grip","remoteMediaNotClaimed:true",
  "actualRemoteMedia:false","realDevice:false","authenticated:false",
  "await browser.close()","await context.close()"])
   assert.ok(script.includes(s),'native QR public test contract missing '+s);
 assert.doesNotMatch(script,/tinyfish|browserstack|saucelabs|external-browser-service/i);
 assert.doesNotMatch(script,/sessionStorage\.setItem\('ekodi-auth-token'|#goLiveButton.*click\(\)/);
});
test('Native PR canary has read-only permissions and publishes machine evidence',()=>{
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/npx playwright install --with-deps chromium/);
 assert.match(workflow,/node scripts\/verify-church-director-qr-native-public\.mjs/);
 assert.match(workflow,/artifacts\/church-director-native-browser\//);
});
