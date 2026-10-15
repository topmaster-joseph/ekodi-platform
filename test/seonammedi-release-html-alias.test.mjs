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


test('photo-shell live HTML permits only the existing first-party board category script mount alias',async()=>{
  const {readFile}=await import('node:fs/promises');
  const [homepage,script,verifier]=await Promise.all([
    readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/board-central-category.js',import.meta.url),'utf8'),
    readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8')
  ]);
  assert.match(homepage,/<script src="\/seonammedi\/board-central-category\.js\?v=[^"]+" defer><\/script>/);
  assert.match(script,/Central category tabs on standalone SeonamMedi boards/);
  assert.match(verifier,/'board-central-category\.js'/);
  const canonical='<html><script src="/seonammedi/board-central-category.js?v=photo-shell-1" defer></script></html>';
  const customer='<html><script src="/board-central-category.js?v=photo-shell-1" defer></script></html>';
  const approved=['board-central-category.js'];
  const result=compareSeonamMediPublishedHtml(canonical,customer,approved);
  assert.equal(result.matched,true,JSON.stringify(result));
  assert.deepEqual(result.aliases,approved);
  assert.equal(compareSeonamMediPublishedHtml(canonical,canonical,approved).matched,true);
  assert.equal(compareSeonamMediPublishedHtml(canonical,customer,[]).matched,false);
  for(const changed of [
    customer.replace('photo-shell-1','photo-shell-2'),
    customer.replace('board-central-category.js','untrusted.js'),
    customer.replace(' defer',''),
    customer.replace('</html>','<script src="/other.js"></script></html>')
  ])assert.equal(compareSeonamMediPublishedHtml(canonical,changed,approved).matched,false,changed);
});
