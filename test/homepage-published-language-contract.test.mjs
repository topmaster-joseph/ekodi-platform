import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../homepage-ambient.js',import.meta.url),'utf8');
const from=source.indexOf('  const normalizeLocale = value => {');
const to=source.indexOf('  const copy = (locale, key) =>',from);
assert.ok(from>=0&&to>from,'bounded homepage locale utility definitions are present');
const utility=source.slice(from,to);

function homepage(window){
  return runInNewContext(utility+'\n({getLocale,publishedHomepageLocale})', {window,document:{cookie:'ekodi_locale=en'}});
}
test('LANG-UI-001: homepage is Korean before Shell is loaded regardless of English browser preference',()=>{
  assert.equal(homepage({}).getLocale(),'ko-KR');
});
test('LANG-UI-001: homepage rejects stored or selected languages that are not actually published',()=>{
  const shared={getLocale:()=> 'en',isLocaleReady:()=>false};
  const helper=homepage({EKODIUserLanguage:shared});
  assert.equal(helper.getLocale(),'ko-KR');
  assert.equal(helper.publishedHomepageLocale('ja'),'ko-KR');
  assert.equal(helper.publishedHomepageLocale('zh-CN'),'ko-KR');
});
test('LANG-UI-001: homepage accepts an explicitly ready shared Shell language',()=>{
  const shared={getLocale:()=> 'en',isLocaleReady:locale=>locale==='en'};
  const helper=homepage({EKODIUserLanguage:shared});
  assert.equal(helper.getLocale(),'en');
  assert.equal(helper.publishedHomepageLocale('en'),'en');
  assert.equal(helper.publishedHomepageLocale('ja'),'ko-KR');
});
test('LANG-UI-001: asynchronous rendering re-reads Shell state and all locale updates are gated',()=>{
  assert.match(source,/renderHomepageLocale\(getLocale\(\)\);/);
  assert.match(source,/function renderHomepageLocale\(locale\) \{\s*const next=publishedHomepageLocale\(locale\);/);
  assert.doesNotMatch(utility,/navigator\.language|localStorage\.getItem|document\.cookie/);
});
