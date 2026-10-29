import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateEvidence} from '../search-visibility-control.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const source=read('search-visibility-control.js');
const gateway=read('seonammedi-domain-gateway.js');
const board=read('services/independent-board/worker.js');
const idn='xn--3e0b8b58jw4co4mnpll3k.kr';
const canonical='https://'+idn+'/';

test('SeonamMedi Search Visibility property canonical follows the current public Korean IDN gateway',()=>{
  assert.match(gateway,/const CANONICAL_ORIGIN = 'https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr'/);
  assert.match(board,/const SEONAM_PUBLIC_ORIGIN='https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr'/);
  assert.match(source,/DOMAIN_CANONICAL_FOR_PATH=Object\.freeze\(\{\s*'\/seonammedi':'https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr\/'/);
  assert.match(source,/'\/seonammedi':\['seonammedi\.kr','서남권국립의대\.kr'\]/);
  assert.match(source,/canonicalUrl:DOMAIN_CANONICAL_FOR_PATH\[key\]\|\|site\.url/);
  assert.match(source,/propertyType:'independent-domain'/);
  assert.match(source,/name:site\.name\+' · '\+\(host==='xn--3e0b8b58jw4co4mnpll3k\.kr'/);
});

test('Unicode promotional IDN is safely normalized and dangerous alias inputs rejected',()=>{
  const declaration=source.match(/const safeHost=value=>\{[\s\S]*?\n\};/)?.[0];
  assert.ok(declaration,'Missing strict alias normalizer');
  const safeHost=vm.runInNewContext('(value)=>{const safe=(v,n=320)=>String(v??" ").trim().slice(0,n);'+declaration+'return safeHost(value);}',{URL});
  assert.equal(safeHost('seonammedi.kr'),'seonammedi.kr');
  assert.equal(safeHost('서남권국립의대.kr'),idn);
  assert.equal(safeHost(idn),idn);
  for(const invalid of ['ekodi.kr','www.seonammedi.kr','localhost','bad.com:443','abc.kr@evil.kr','abc.kr?key=x','abc.kr#top','invalid host','https://abc.kr:443/']){
    assert.equal(safeHost(invalid),'','Alias validation must reject '+invalid);
  }
});

test('Distinct canonical mount and independent hosts never share provider evidence key',()=>{
  const sites=[
    {url:'https://ekodi.kr/seonammedi/',propertyType:'canonical'},
    {url:'https://seonammedi.kr/',propertyType:'independent-domain',canonicalUrl:canonical},
    {url:canonical,propertyType:'independent-domain',canonicalUrl:canonical},
  ];
  const make=siteUrl=>validateEvidence({
    siteUrl,providerId:'google',checkType:'ownership',state:'pending',evidenceUrl:'',detail:'',
  },sites);
  assert.deepEqual(sites.map(x=>make(x.url).siteUrl),sites.map(x=>x.url));
  assert.notEqual(make(sites[0].url).siteUrl,make(sites[1].url).siteUrl);
  assert.notEqual(make(sites[1].url).siteUrl,make(sites[2].url).siteUrl);
  assert.throws(()=>make('https://other.example/'),/SITE_NOT_PUBLIC/);
  assert.throws(()=>make('http://seonammedi.kr/'),/SITE_NOT_PUBLIC/);
});

test('Evidence source cannot be marked automatically verified from property metadata',()=>{
  const sites=[{url:canonical,propertyType:'independent-domain',canonicalUrl:canonical}];
  const item=validateEvidence({
    siteUrl:canonical,providerId:'naver',checkType:'ownership',state:'pending',
    source:'provider_verified',actor:'administrator',observedAt:'2050-01-01',
  },sites);
  assert.equal(item.state,'pending');
  assert.equal(Object.hasOwn(item,'source'),false);
  assert.equal(Object.hasOwn(item,'actor'),false);
  assert.equal(Object.hasOwn(item,'observedAt'),false);
});
