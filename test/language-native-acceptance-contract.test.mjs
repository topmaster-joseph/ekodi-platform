import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLanguageDOM,ORIGIN,LOCALE_SELECTOR} from '../scripts/verify-language-selector-native.mjs';

const workflow=readFileSync(new URL('../.github/workflows/verify-language-selector-native.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('../scripts/verify-language-selector-native.mjs',import.meta.url),'utf8');
const good={shellLoaded:true,headerReady:true,headerControls:1,visibleHeaderControls:1,
  footerControls:0,pill:true,accessible:true,optionsMatchPublished:true};

test('native LANG-UI-001 assessor accepts correctly published multi-language pill',()=>{
  assert.equal(assessLanguageDOM(good,['ko-KR','en']).status,'pass');
});
test('native assessor requires exactly one accessible published multi-language selector',()=>{
  for(const patch of [{pill:false},{accessible:false},{optionsMatchPublished:false},{visibleHeaderControls:0},{headerControls:2},{footerControls:1}]){
    assert.equal(assessLanguageDOM({...good,...patch},['ko-KR','en']).status,'fail');
  }
});
test('native assessor forbids a selector for single or no published languages',()=>{
  const absent={...good,headerControls:0,visibleHeaderControls:0};
  assert.equal(assessLanguageDOM(absent,['ko-KR']).status,'pass');
  assert.equal(assessLanguageDOM(absent,[]).status,'pass');
  assert.equal(assessLanguageDOM(good,['ko-KR']).status,'fail');
});
test('unavailable live status cannot certify a deployed selector',()=>{
  assert.equal(assessLanguageDOM(good,null).status,'inconclusive');
  assert.equal(assessLanguageDOM({...good,shellLoaded:false},['ko-KR','en']).status,'inconclusive');
  assert.equal(assessLanguageDOM({...good,headerReady:false},['ko-KR','en']).status,'inconclusive');
});
test('native workflow is PR executable with isolated Playwright evidence',()=>{
  assert.equal(ORIGIN,'https://ekodi.kr');
  assert.match(LOCALE_SELECTOR,/header/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/npm install --no-save --package-lock=false playwright@1\.55\.0/);
  assert.match(workflow,/npx playwright install --with-deps chromium/);
  assert.match(workflow,/node scripts\/verify-language-selector-native\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/permissions:\s*\n\s*contents:\s*read/);
  assert.match(script,/serviceWorkers:'block'/);
  assert.match(script,/readOnly:true/);
  assert.match(script,/realProductionAndSyntheticSeparated:true/);
  assert.match(script,/cloudflare_429_stop/);
  assert.doesNotMatch(script,/GH_TOKEN|CLOUDFLARE_API_TOKEN|userDataDir/);
});
