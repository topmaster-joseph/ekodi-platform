import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { applyPlatformSecurityHeaders } from '../platform-security-policy.js';

const run=(path,type,status=200)=>applyPlatformSecurityHeaders(new Response('x',{status,headers:{'content-type':type}}),new Request('https://ekodi.kr'+path));

test('every HTML document is isolated from cross-site openers (popups still allowed)',()=>{
  for(const path of ['/','/ekodichurch','/ekodimall/item/1','/books','/my/media/ms-20261121-aaaabbbb'])
    assert.equal(run(path,'text/html; charset=utf-8').headers.get('cross-origin-opener-policy'),'same-origin-allow-popups',path);
  assert.equal(run('/logo.png','image/png').headers.get('cross-origin-opener-policy'),null,'not on images');
});

test('JSON responses cannot be pulled cross-site without CORS',()=>{
  assert.equal(run('/api/x','application/json; charset=utf-8').headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal(run('/api/x','application/problem+json').headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal(run('/logo.png','image/png').headers.get('cross-origin-resource-policy'),null,'images stay embeddable');
  const own=applyPlatformSecurityHeaders(new Response('{}',{headers:{'content-type':'application/json','cross-origin-resource-policy':'cross-origin'}}),new Request('https://ekodi.kr/api/public-feed'));
  assert.equal(own.headers.get('cross-origin-resource-policy'),'cross-origin','an explicit route choice is kept');
});

test('unused device APIs are off everywhere, live studio keeps camera and microphone',()=>{
  const pub=run('/ekodichurch','text/html').headers.get('permissions-policy');
  for(const f of ['browsing-topics=()','bluetooth=()','serial=()','hid=()','midi=()','magnetometer=()','camera=()','usb=()'])assert.ok(pub.includes(f),f);
  assert.doesNotMatch(pub,/accelerometer|gyroscope/,'YouTube 360 embeds keep motion sensors');
  const live=run('/live/studio','text/html').headers.get('permissions-policy');
  assert.match(live,/camera=\(self\), microphone=\(self\), display-capture=\(self\)/);
  assert.match(live,/bluetooth=\(\)/);
});

// Regression guardrail: no production release header marker may disappear.
test('platform headers preserve every release-manifest header marker',async()=>{
  const dir=new URL('../deploy/manifests/',import.meta.url);
  const lost=[];
  for(const file of await readdir(dir)){
    if(!file.endsWith('.json'))continue;
    let manifest;try{manifest=JSON.parse(await readFile(new URL(file,dir),'utf8'));}catch{continue;}
    for(const entry of ((manifest.worker||manifest).requests||[])){
      const markers=[...(entry.headerExpect||[]),...(entry.candidateHeaderExpect||[])];
      if(!markers.length||!entry.url)continue;
      const headers=new Headers({'content-type':/\.js(\?|$)/.test(entry.url)?'text/javascript':/\/api\//.test(entry.url)?'application/json':'text/html; charset=utf-8'});
      for(const marker of markers){const i=marker.indexOf(":");if(i>0)headers.set(marker.slice(0,i).trim(),marker.slice(i+1).trim());}
      let request;try{request=new Request(entry.url,{method:entry.method||'GET'});}catch{continue;}
      const status=markers.some(m=>m.toLowerCase().startsWith('location:'))?302:200;
      const out=applyPlatformSecurityHeaders(new Response('x',{status,headers}),request);
      const text=[...out.headers.entries()].map(([k,v])=>`${k}: ${v}`).join('\n').toLowerCase();
      for(const marker of markers){
        const name=marker.slice(0,marker.indexOf(':')).trim().toLowerCase();
        // headers the platform owns by design (HSTS, nosniff, …) may differ from an upstream echo
        if(['strict-transport-security','x-content-type-options','x-permitted-cross-domain-policies','origin-agent-cluster'].includes(name))continue;
        if(!text.includes(marker.toLowerCase()))lost.push(`${file} ${entry.url} → ${marker}`);
      }
    }
  }
  assert.deepEqual(lost,[]);
});
