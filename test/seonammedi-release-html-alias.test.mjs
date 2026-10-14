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
