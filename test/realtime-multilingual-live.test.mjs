import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tenantLivePage } from '../tenant-live-page.js';
import { realtimeTenantList } from '../realtime-tenant-registry.js';

const liveJs=await readFile(new URL('../tenant-live.js',import.meta.url),'utf8');
const liveCss=await readFile(new URL('../tenant-live.css',import.meta.url),'utf8');

test('tenant Live renders multilingual host, interpreter and viewer controls',async()=>{
  for(const tenant of realtimeTenantList()){
    const response=tenantLivePage(tenant);
    assert.equal(response.status,200,tenant.id);
    const html=await response.text();
    assert.match(html,/EKODI REALTIME · MULTILINGUAL/);
    assert.match(html,/id="sourceLanguage"/);
    assert.match(html,/name="interpretLanguage"/);
    assert.match(html,/id="interpreterLinks"/);
    assert.match(html,/id="viewerLanguage"/);
    assert.match(html,/AI 자동통역은 검증 전까지 자동 활성화하지 않습니다/);
  }
});

test('multilingual studio enforces language entitlement and publishes tagged human interpretation audio',()=>{
  assert.doesNotThrow(()=>new Function(liveJs));
  assert.match(liveJs,/languages:selectedInterpretationLanguages\(\)/);
  assert.match(liveJs,/ai:false/);
  assert.match(liveJs,/createSession\(roomId,'presenter'\)/);
  assert.match(liveJs,/publishStream\(stream,'translation',language\)/);
  assert.match(liveJs,/sourceType:t\.sender\.track\.kind==='audio'\?\(source==='translation'\?'translation':'microphone'\):source/);
  assert.match(liveJs,/languageCode:t\.sender\.track\.kind==='audio'\?languageCode:''/);
});

test('viewer can select one audio language while retaining video tracks',()=>{
  assert.match(liveJs,/function viewerLanguageChoices\(/);
  assert.match(liveJs,/function selectViewerTracks\(/);
  assert.match(liveJs,/canonicalLanguage\(trackField\(track,'languageCode'\)\)===language/);
  assert.match(liveJs,/trackField\(track,'sourceType'\)!=='translation'/);
  assert.match(liveJs,/viewerLanguage.*addEventListener\('change'/s);
});

test('generic tenant Live prevents repeated auth handoff loops',()=>{
  assert.match(liveJs,/AUTH_ATTEMPT_WINDOW=120000/);
  assert.match(liveJs,/자동 재로그인을 중단했습니다/);
  assert.match(liveJs,/clearAuthAttempt\(\)/);
  assert.doesNotMatch(liveJs,/\.finally\(\(\)=>\{if\(params\.get\('mode'\)==='studio'\)startHost/);
});

test('multilingual controls remain responsive and compact',()=>{
  assert.match(liveCss,/\.language-grid\{display:grid/);
  assert.match(liveCss,/\.interpreter-link\{/);
  assert.match(liveCss,/@media\(max-width:560px\)/);
});
