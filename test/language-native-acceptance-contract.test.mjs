import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLanguageDOM,assessIndependentKoreanHeader,ORIGIN,LOCALE_SELECTOR} from '../scripts/verify-language-selector-native.mjs';

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
test('production must never render an un-published homepage locale',()=>{
  assert.equal(assessLanguageDOM({...good,documentLocale:'en',homepageLocale:'en'},['ko-KR']).reason,'document_locale_not_published');
  assert.equal(assessLanguageDOM({...good,documentLocale:'ko-KR',homepageLocale:'en'},['ko-KR']).reason,'document_locale_not_published');
  const hidden={...good,headerControls:0,visibleHeaderControls:0,documentLocale:'ko-KR',homepageLocale:'ko-KR'};
  assert.equal(assessLanguageDOM(hidden,['ko-KR']).status,'pass');
  assert.equal(assessLanguageDOM({...hidden,documentLocale:'en',homepageLocale:'en'},['ko-KR']).status,'fail');
  assert.equal(assessLanguageDOM({...good,documentLocale:'en',homepageLocale:'en'},['ko-KR','en']).status,'pass');
});

test('LANG-UI-001: document and homepage locale must independently agree with publication',()=>{
  const hidden={...good,headerControls:0,visibleHeaderControls:0,documentLocale:'ko',homepageLocale:'ko-KR'};
  assert.equal(assessLanguageDOM(hidden,['ko-KR']).status,'pass');
  assert.equal(assessLanguageDOM({...hidden,documentLocale:'en'},['ko-KR']).reason,'document_locale_not_published');
  assert.equal(assessLanguageDOM({...hidden,homepageLocale:'en'},['ko-KR']).reason,'document_locale_not_published');
  assert.equal(assessLanguageDOM({...good,documentLocale:'en',homepageLocale:'en'},['ko-KR','en']).status,'pass');
  assert.equal(assessLanguageDOM({...hidden,documentLocale:'en',homepageLocale:'en'},['ko-KR','en']).status,'fail');
  assert.equal(assessLanguageDOM({...hidden,documentLocale:'ko-KR'},[]).status,'pass');
});

test('standalone SeonamMedi Korean header is assessed separately from shared Shell',()=>{
  const s={independentHeader:true,shellLoaded:false,documentLocale:'ko',headerControls:0,
    visibleHeaderControls:0,standaloneHeaderLanguageControls:0,footerControls:0};
  assert.deepEqual(assessIndependentKoreanHeader(s),{status:'pass',reason:'independent_korean_only_header'});
  assert.equal(assessIndependentKoreanHeader({...s,documentLocale:'en'}).status,'fail');
  assert.equal(assessIndependentKoreanHeader({...s,standaloneHeaderLanguageControls:1}).status,'fail');
  assert.equal(assessIndependentKoreanHeader({...s,footerControls:1}).status,'fail');
  assert.equal(assessIndependentKoreanHeader({...s,shellLoaded:true}).status,'inconclusive');
  assert.equal(assessIndependentKoreanHeader({...s,independentHeader:false}).status,'inconclusive');
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
  assert.match(workflow,/EKODI_LANG_STRICT_LIVE:/);
  assert.match(script,/strictLive&&report.liveDriftCount>0/);
  assert.match(workflow,/'homepage-ambient\.js'/);
  assert.match(workflow,/npm install --no-save --package-lock=false playwright@1\.55\.0/);
  assert.match(workflow,/npx playwright install --with-deps chromium/);
  assert.match(workflow,/node scripts\/verify-language-selector-native\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/permissions:\s*\n\s*contents:\s*read/);
  assert.match(script,/serviceWorkers:'block'/);
  assert.match(script,/readOnly:true/);
  assert.match(script,/realProductionAndSyntheticSeparated:true/);
  assert.match(script,/cloudflare_429_stop/);
  assert.match(script,/liveMultiPublishedObserved/);
  assert.match(script,/independent_korean_only_header/);
  assert.doesNotMatch(script,/GH_TOKEN|CLOUDFLARE_API_TOKEN|userDataDir/);
});
