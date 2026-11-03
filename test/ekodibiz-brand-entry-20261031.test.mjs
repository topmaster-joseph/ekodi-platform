import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import legacy from '../biz-legacy-redirect.js';

const read=path=>readFile(new URL('../'+path, import.meta.url),'utf8');

test('top EKODIBIZ brand opens official public business domain, not EKODI platform home',async()=>{
  const html=await read('ekodibiz/index.html');
  assert.match(html,/<a class="brand" href="https:\/\/ekodibiz\.kr\/" data-i18n-aria="brandHome" aria-label="에코디비즈 첫 화면으로 이동">EKODIBIZ<\/a>/);
  assert.doesNotMatch(html,/<a class="brand" href="https:\/\/ekodi\.kr\//);
  // Only the separate footer EKODI control goes to the ecosystem home.
  assert.match(html,/<a href="https:\/\/ekodi\.kr\/">EKODI<\/a>/);
});

test('official business entry keeps the business homepage despite the intentional canonical redirect',async()=>{
  const response=await legacy.fetch(new Request('https://ekodibiz.kr/'));
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodibiz');
  const html=await read('ekodibiz/index.html');
  assert.match(html,/<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz">/);
});

test('all localized logo labels describe EKODIBIZ rather than EKODI; business area and login stay unchanged',async()=>{
  const [site,html]=await Promise.all([read('ekodibiz/site.js'),read('ekodibiz/index.html')]);
  for(const name of [
    '에코디비즈 첫 화면으로 이동',
    'Go to the EKODIBIZ home page',
    '前往 EKODIBIZ 首页',
    'EKODIBIZのトップへ',
    'EKODIBIZ गृहपृष्ठमा जानुहोस्',
    'Đi tới trang chủ EKODIBIZ'
  ])assert.ok(site.includes("brandHome:'"+name+"'"),name);
  for(const slug of ['software','solar','mall','consulting','trade','publishing','ai-ops','marketing']){
    assert.ok(html.includes('href="#business/'+slug+'"'),slug);
  }
  assert.ok(site.includes("new URL('https://ekodi.kr/auth/')"));
  assert.ok(site.includes("returnTo.searchParams.set('business',slug)"));
  assert.ok(html.includes('href="https://ekodi.kr/ekodibiz/refund"'));
});
