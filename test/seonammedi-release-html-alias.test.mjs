import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSeonamMediPublishedHtml} from '../scripts/seonammedi-release-html-alias.mjs';

const expected=[
  '<!doctype html><head>',
  '<link rel="stylesheet" href="/seonammedi/app.0123456789ab.css">',
  '<meta name="ekodi-release" content="release-test">',
  '</head><body>',
  '<a href="/seonammedi/assets/campaign-reconsideration-20261013.png">',
  '<img src="/seonammedi/assets/campaign-reconsideration-20261013.png">',
  '<script src="/seonammedi/app.0123456789ab.js"></script>',
  '<script src="/seonammedi/voice-public-admin.0123456789ab.js"></script>',
  '</a><h1>Public content unchanged</h1></body>'
].join('\n');
const allowed=[
  'app.0123456789ab.css','app.0123456789ab.js',
  'voice-public-admin.0123456789ab.js',
  'assets/campaign-reconsideration-20261013.png'
];

test('customer public HTML can remove only five allowlisted asset mount prefixes',()=>{
  const customer=expected.replaceAll('"/seonammedi/','"/');
  const result=compareSeonamMediPublishedHtml(expected,customer,allowed);
  assert.equal(result.matched,true);
  assert.equal(result.aliases.length,5);
  assert.equal(compareSeonamMediPublishedHtml(expected,expected,allowed).matched,true);
});
test('actual article, login, script or DOM changes never pass the alias-only check',()=>{
  const customer=expected.replaceAll('"/seonammedi/','"/');
  for(const mutated of [
    customer.replace('Public content unchanged','Public content changed'),
    customer.replace('release-test','another-release'),
    customer.replace('app.0123456789ab.js','app.1123456789ab.js'),
    customer.replace('</body>','<script>alert(1)</script></body>')
  ])assert.equal(compareSeonamMediPublishedHtml(expected,mutated,allowed).matched,false);
});
test('unapproved asset path alias fails closed, even if byte-for-byte otherwise',()=>{
  const source='<a href="/seonammedi/unregistered.js">read</a>';
  assert.equal(compareSeonamMediPublishedHtml(source,'<a href="/unregistered.js">read</a>',allowed).matched,false);
});

test('matching initial characters do not conceal approved customer-domain mount aliases',()=>{
 const expected='<link href="/seonammedi/shared-site-header.css"><link href="/seonammedi/home-public-feed.css?v=2"><script src="/seonammedi/home-public-feed.js?v=2"></script>';
 const customer=expected.replaceAll('"/seonammedi/','"/');
 const allowed=['shared-site-header.css','home-public-feed.css','home-public-feed.js'];
 const result=compareSeonamMediPublishedHtml(expected,customer,allowed);
 assert.equal(result.matched,true,JSON.stringify(result));
 assert.deepEqual(result.aliases,allowed);
 assert.equal(compareSeonamMediPublishedHtml(expected,expected,allowed).matched,true);
 assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('home-public-feed.js','untrusted.js'),allowed).matched,false);
 assert.equal(compareSeonamMediPublishedHtml(expected,customer,['shared-site-header.css','home-public-feed.css']).matched,false);
});

test('photo home board Worker script keeps exact approved customer-domain mount alias',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [homepage,verifier]=await Promise.all([
   readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8'),
   readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8')
 ]);
 assert.ok(homepage.includes('src="/seonammedi/board/ui/central-category.js?v=20261016-home-photo-worker-1"'));
 assert.ok(verifier.includes("'board/ui/central-category.js'"),'strict live validator must name only this first-party Worker asset');
 const published='<script src="/seonammedi/board/ui/central-category.js?v=20261016-home-photo-worker-1" defer></script>';
 const customer='<script src="/board/ui/central-category.js?v=20261016-home-photo-worker-1" defer></script>';
 const result=compareSeonamMediPublishedHtml(published,customer,['board/ui/central-category.js']);
 assert.equal(result.matched,true,JSON.stringify(result));
 assert.deepEqual(result.aliases,['board/ui/central-category.js']);
 for(const changed of [
   customer.replace('central-category.js','untrusted.js'),
   customer.replace('home-photo-worker-1','unknown-release'),
   customer.replace(' defer',''),
 ])assert.equal(compareSeonamMediPublishedHtml(published,changed,['board/ui/central-category.js']).matched,false);
 assert.equal(compareSeonamMediPublishedHtml(published,customer,[]).matched,false);
});
