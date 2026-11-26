import test from 'node:test';
import assert from 'node:assert/strict';
import {PRINT_PATHS,verifyPrintProduction} from '../scripts/verify-print-production.mjs';
const pages=[...PRINT_PATHS,'/print/studio.js','/print/studio.css'];
const html='<!doctype html><meta name="robots" content="noindex,nofollow"><div id="products"></div><div id="editor"></div><div id="cardHandoff"></div><button id="requestQuote"></button><a href="/ekodibiz/cards/">명함</a><script src="/print/studio.js"></script><link rel="stylesheet" href="/print/studio.css">';
const js="const createObjectURL=()=>{}; const marker='mailto:ekodibiz@gmail.com'; function svgFor(){}; const id='requestQuote';";
const css='.products{} @media print{} @media(max-width:480px){}';
function fixture(path){
  if(path==='/__ekodi/version')return new Response(JSON.stringify({ok:true,service:'shared-site',versionId:'test-version'}),{status:200,headers:{'content-type':'application/json'}});
  const c=path.endsWith('.js')?js:path.endsWith('.css')?css:html;
  const type=path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html';
  return new Response(c,{status:200,headers:{'content-type':type}});
}
test('canary is GET-only and covers all seven HTML paths, both assets and release receipt',async()=>{
  const seen=[];
  const r=await verifyPrintProduction({fetchImpl:(url,opts)=>{seen.push({url,opts});return fixture(new URL(url).pathname);}});
  assert.equal(r.checked.length,9);
  assert.equal(r.versionId,'test-version');
  assert.deepEqual(seen.map(x=>new URL(x.url).pathname),[...pages,'/__ekodi/version']);
  assert.ok(seen.every(x=>x.url.startsWith('https://ekodi.kr/')&&x.opts.method==='GET'&&x.opts.redirect==='manual'));
});
test('canary rejects redirects, missing pages, wrong assets and absent release attestation',async()=>{
  for(const bad of [
    path=>path==='/print/'?new Response(null,{status:308,headers:{location:'/print/banners/'}}):null,
    path=>path==='/print/cards/'?new Response('Not Found',{status:404}):null,
    path=>path==='/print/studio.js'?new Response('fake',{status:200,headers:{'content-type':'application/javascript'}}):null,
    path=>path==='/__ekodi/version'?new Response(JSON.stringify({ok:false,service:'shared-site',versionId:'unknown'}),{status:200,headers:{'content-type':'application/json'}}):null
  ]){
    await assert.rejects(verifyPrintProduction({fetchImpl:(url)=>{
      const path=new URL(url).pathname;
      return bad(path)||fixture(path);
    }}));
  }
});
