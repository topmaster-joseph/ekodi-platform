import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderEkodiUserFooter} from '../config/user-footer.js';
import {footer as renderBookFooter} from '../scripts/site-chrome.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const church=['church-history-worker.js'];
const generated=[
  'books/index.html','books/series/index.html','books/research/index.html',
  'books/notes/index.html','books/ekodian/index.html','books/buy/index.html',
  'books/buy/success/index.html','books/buy/fail/index.html',
  'books/library/index.html','books/store/index.html',
  'publishing/index.html','publishing/consultation/index.html',
  'publishing/production/index.html','publishing/distribution/index.html',
  'publishing/studio/index.html','publishing/upaper/index.html',
  'publishing/human/index.html','publishing/human/manage/index.html',
  'publishing/admin/index.html','books/publishing/workspace/index.html',
];
const footerOf=html=>(/<footer\b[^>]*>[\s\S]*?<\/footer>/i.exec(html)||[])[0]||'';
const banned=/운영주체\s*에코디교회|대표\s*정찬균|Operator\s*·\s*EKODI Church|Representative\s*·\s*Jung Chan-gyun/;

test('shared footer preserves legal business identity without an operator or representative heading',()=>{
  const html=renderEkodiUserFooter();
  assert.doesNotMatch(html,banned);
  assert.match(html,/에코디비즈/);
  for(const value of ['정찬균','213-13-01959','2023-전남무안-0153','010-3501-8542']){
    assert.ok(html.includes(value),value+' must remain visible');
  }
});

test('central runtime church-history footer removes duplicate identity rows',async()=>{
  for(const path of church){
    const html=await read(path);
    const footer=footerOf(html);
    assert.ok(footer,path+' has no footer');
    assert.doesNotMatch(footer,banned,path);
    assert.match(footer,/고유번호 307-82-82097/,path+' organization number is preserved');
    assert.match(footer,/ekodichurch@gmail\.com/,path+' email is preserved');
  }
  // The 223-file historical shadow is SHA-pinned and must not be edited here.
  // Canonical public church pages belong to the independent ekodi-church source repository.
});

test('both publication generators and 20 committed pages keep an unlabeled seller identity',async()=>{
  for(const id of ['books','publishing']){
    const footer=renderBookFooter(id);
    assert.match(footer,/에코디비즈 · 정찬균/);
    assert.doesNotMatch(footer,/대표\s*정찬균|운영\s*에코디비즈|운영주체/);
  }
  for(const path of generated){
    const footer=footerOf(await read(path));
    assert.ok(footer,path+' generated footer missing');
    assert.match(footer,/에코디비즈 · 정찬균/,path);
    assert.doesNotMatch(footer,/대표\s*정찬균|운영\s*에코디비즈|운영주체/,path);
  }
});

test('business site, six translations and refund footer remove decorative representative titles',async()=>{
  const [staticHtml,localeSource,refund]=await Promise.all([
    read('ekodibiz/index.html'),read('ekodibiz/site.js'),read('ekodibiz-refund-policy-page.js'),
  ]);
  assert.match(footerOf(staticHtml),/에코디비즈 · 정찬균/);
  assert.doesNotMatch(footerOf(staticHtml),/대표\s*정찬균|운영주체/);
  const translations=localeSource.split('\n').filter(line=>line.includes('footerCompany:'));
  assert.equal(translations.length,6);
  for(const line of translations){
    assert.match(line,/(?:정찬균|Jung Chan-gyun)/);
    assert.doesNotMatch(line,/대표\s*정찬균|Representative\s*Jung|代表\s*Jung|प्रतिनिधि\s*Jung|Đại diện\s*Jung/);
  }
  assert.ok(refund.includes('${o.name} · ${o.representative} · 사업자등록번호'));
  assert.ok(!refund.includes('${o.name} · 대표 ${o.representative}'));
});

test('commercial legal notice fields are retained separately from decorative footer titles',async()=>{
  const [home,mall,terms]=await Promise.all([
    read('index.html'),read('sites/ekodi-mall/scripts/build.mjs'),read('terms.html'),
  ]);
  assert.doesNotMatch(home,/사업자 정보 · 운영 주체<\/h2>/);
  assert.match(home,/<dt>대표자명<\/dt><dd>정찬균<\/dd>/);
  assert.match(terms,/<dt>대표자<\/dt><dd>정찬균<\/dd>/);
  assert.ok(!mall.includes('<strong>대표</strong> ${esc(business.representative'));
  assert.ok(mall.includes('business.representative'));
});
