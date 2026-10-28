import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../search-visibility-control.js',import.meta.url),'utf8');

test('SeonamMedi standalone English canonical and Korean promotional IDN are separate properties',()=>{
  assert.match(source,/DOMAIN_CANONICAL_FOR_PATH=Object\.freeze\(\{'\/seonammedi':'https:\/\/seonammedi\.kr\/'\}\)/);
  assert.match(source,/'\/seonammedi':\['seonammedi\.kr','서남권국립의대\.kr'\]/);
  assert.match(source,/propertyType:'independent-domain',canonicalUrl:DOMAIN_CANONICAL_FOR_PATH\[key\]\|\|site\.url/);
  assert.match(source,/if\(!unique\.has\(url\)\)unique\.set\(url/);
  assert.match(source,/SITE_NOT_PUBLIC/);
});

test('Host normalization accepts canonical ASCII and Unicode IDN only, rejecting credentials and ports',()=>{
  const declaration=source.match(/const safeHost=value=>\{[\s\S]*?\n\};/)?.[0];
  assert.ok(declaration,'safeHost must remain an isolated strict normalizer');
  const normalize=vm.runInNewContext(
    '(value)=>{const safe=(v,n=320)=>String(v??"").trim().slice(0,n);'+declaration+'return safeHost(value);}',
    {URL},
  );
  assert.equal(normalize('seonammedi.kr'),'seonammedi.kr');
  assert.equal(normalize('서남권국립의대.kr'),new URL('https://서남권국립의대.kr/').hostname);
  assert.match(normalize('서남권국립의대.kr'),/^xn--/);
  for(const bad of ['ekodi.kr','www.seonammedi.kr','localhost','bad.com:443','abc.kr@evil.kr','abc.kr?key=x','abc.kr#top','not a host']){
    assert.equal(normalize(bad),'','must reject '+bad);
  }
});
