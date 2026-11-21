import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import {
  decryptSegment, deriveContentKeyBytes, encryptSegment, handleMediaShieldRequest, unwrapContentKey,
  MEDIA_SHIELD_PLAYER_SCRIPT, publicManifestView,
} from '../ekodi-media-shield.js';
import { mediaShieldPageResponse, MEDIA_SHIELD_PAGE_SCRIPTS } from '../ekodi-media-shield-pages.js';
import { MP4BOX_SOURCE, MP4BOX_VERSION } from '../vendor/mp4box/mp4box-source.js';

const SECRET='t'.repeat(40);
const MASTER='m'.repeat(48);

function r2(){
  const store=new Map();
  return {
    store,
    async get(key){if(!store.has(key))return null;const value=store.get(key);return {body:value,json:async()=>JSON.parse(typeof value==='string'?value:new TextDecoder().decode(value))};},
    async put(key,value){store.set(key,typeof value==='string'?value:new Uint8Array(await new Response(value).arrayBuffer()));},
    async list({prefix='',delimiter,cursor,limit=1000}={}){
      const keys=[...store.keys()].filter(k=>k.startsWith(prefix)).sort();
      if(delimiter){const prefixes=[...new Set(keys.map(k=>k.slice(prefix.length)).filter(k=>k.includes(delimiter)).map(k=>prefix+k.slice(0,k.indexOf(delimiter)+1)))];return {objects:[],delimitedPrefixes:prefixes,truncated:false};}
      const start=Number(cursor||0);const page=keys.slice(start,start+limit);
      return {objects:page.map(key=>({key})),truncated:start+limit<keys.length,cursor:String(start+limit)};
    },
    async delete(keys){for(const k of [].concat(keys))store.delete(k);},
  };
}
function controlApi(sessions){
  return {async fetch(request){const auth=request.headers.get('authorization')||'';const s=sessions[auth.replace(/^Bearer /,'')];return s?Response.json({authenticated:true,...s}):Response.json({authenticated:false},{status:401});}};
}
function makeEnv(){
  return {EKODI_MEDIA_SHIELD_TOKEN_SECRET:SECRET,EKODI_MEDIA_SHIELD_MASTER_KEY:MASTER,MEDIA_SHIELD_BUCKET:r2(),
    CONTROL_API:controlApi({admin:{email:'joseph@ekodi.kr',role:'super_admin'},member:{email:'member@ekodi.kr',role:'member'}})};
}
const req=(method,path,{token,body,raw}={})=>new Request('https://ekodi.kr/api/media-shield/'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(raw?{'content-type':'application/octet-stream'}:body!==undefined?{'content-type':'application/json'}:{})},body:raw||(body!==undefined?JSON.stringify(body):undefined)});
const call=(env,...args)=>handleMediaShieldRequest(req(...args),env,{});

async function adminKey(env,contentId){
  const viewer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const pub=await crypto.subtle.exportKey('jwk',viewer.publicKey);
  const res=await call(env,'POST','admin/key/'+contentId,{token:'admin',body:{publicKey:{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}}});
  assert.equal(res.status,200);
  return unwrapContentKey((await res.json()).envelope,viewer.privateKey);
}

test('admin API requires a real EKODI admin session',async()=>{
  const env=makeEnv();
  assert.equal((await call(env,'GET','admin/list')).status,401);
  assert.equal((await call(env,'GET','admin/list',{token:'forged'})).status,401);
  assert.equal((await call(env,'GET','admin/list',{token:'member'})).status,403);
  assert.equal((await call(env,'GET','admin/list',{token:'admin'})).status,200);
});

test('studio flow: new → key → encrypted parts → publish → member plays → delete',async()=>{
  const env=makeEnv();
  const {contentId}=await (await call(env,'POST','admin/new',{token:'admin',body:{}})).json();
  assert.match(contentId,/^ms-\d{8}-[0-9a-f]{8}$/);
  const key=await adminKey(env,contentId);
  // the admin browser key can only encrypt in practice; the viewer derives the same content key
  const parts={'init.bin':new Uint8Array([0,0,0,8,1,2,3,4]),'s00001.bin':new Uint8Array(64).fill(7),'s00002.bin':new Uint8Array(64).fill(9)};
  const keyBytes=await deriveContentKeyBytes(MASTER,contentId);
  for(const [name,plain] of Object.entries(parts)){
    const sealed=await encryptSegment(keyBytes,contentId,name,plain);
    assert.equal((await call(env,'PUT',`admin/part/${contentId}/${name}`,{token:'admin',raw:sealed})).status,200);
  }
  assert.equal((await call(env,'PUT',`admin/part/${contentId}/../x.bin`,{token:'admin',raw:new Uint8Array(64)})).status!==200,true);
  assert.equal((await call(env,'PUT',`admin/part/${contentId}/evil.js`,{token:'admin',raw:new Uint8Array(64)})).status,400);
  const tooFew=await call(env,'POST','admin/publish/'+contentId,{token:'admin',body:{title:'주일 말씀',mime:'video/mp4; codecs="avc1.4d401e, mp4a.40.2"',times:[0,10,20],duration:30,audience:'members'}});
  assert.equal(tooFew.status,409,'missing s00003 must block publishing');
  assert.equal((await call(env,'POST','admin/publish/'+contentId,{token:'admin',body:{title:'x',mime:'text/html',times:[0,10],duration:20,audience:'members'}})).status,400);
  assert.equal((await call(env,'POST','admin/publish/'+contentId,{token:'admin',body:{title:'x',mime:'video/mp4; codecs="avc1.4d401e"',times:[0,10],duration:20,audience:'subjects',subjects:'not-an-email'}})).status,400);
  const published=await call(env,'POST','admin/publish/'+contentId,{token:'admin',body:{title:'<b>주일 말씀</b>',mime:'video/mp4; codecs="avc1.4d401e, mp4a.40.2"',times:[0,10],duration:20,audience:'members'}});
  assert.equal(published.status,200);
  assert.equal((await published.json()).watchPath,'/my/media/'+contentId);
  // immutable after publishing
  assert.equal((await call(env,'PUT',`admin/part/${contentId}/s00001.bin`,{token:'admin',raw:new Uint8Array(64)})).status,409);
  assert.equal((await call(env,'POST','admin/key/'+contentId,{token:'admin',body:{}})).status,409);
  // listing
  const list=await (await call(env,'GET','admin/list',{token:'admin'})).json();
  assert.equal(list.items[0].contentId,contentId);
  assert.equal(list.items[0].title,'b주일 말씀/b');
  assert.doesNotMatch(list.items[0].title,/[<>]/);
  // member signed in through the EKODI session plays it
  const tok=await call(env,'POST','token',{token:'member',body:{contentId}});
  assert.equal(tok.status,200);
  const {token}=await tok.json();
  const manifest=(await (await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/manifest/${contentId}?t=${token}`),env,{})).json()).manifest;
  assert.deepEqual(manifest.times,[0,10]);
  const seg=await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/segment/${contentId}/s00002.bin?t=${token}`),env,{});
  // the key delivered (wrapped) to the admin browser is exactly the server-derived content key
  assert.deepEqual(await decryptSegment(key,contentId,'s00002.bin',new Uint8Array(await seg.arrayBuffer())),parts['s00002.bin']);
  assert.deepEqual(await decryptSegment(keyBytes,contentId,'s00002.bin',env.MEDIA_SHIELD_BUCKET.store.get(`media-shield/${contentId}/s00002.bin`)),parts['s00002.bin']);
  // delete removes everything
  const deleted=await (await call(env,'DELETE','admin/content/'+contentId,{token:'admin'})).json();
  assert.equal(deleted.deleted,4);
  assert.equal([...env.MEDIA_SHIELD_BUCKET.store.keys()].length,0);
});

test('subject-only content: listed people and admins only',async()=>{
  const env=makeEnv();
  const contentId='ms-20261121-aaaabbbb';
  env.MEDIA_SHIELD_BUCKET.store.set(`media-shield/${contentId}/manifest.json`,JSON.stringify({version:'v1',contentId,title:'t',mime:'video/mp4; codecs="avc1.4d401e"',init:'init.bin',segments:['s00001.bin'],audience:'subjects',subjects:['someone@ekodi.kr']}));
  assert.equal((await call(env,'POST','token',{token:'member',body:{contentId}})).status,403);
  assert.equal((await call(env,'POST','token',{token:'admin',body:{contentId}})).status,200);
});

test('studio and watch pages are served with a strict CSP and safe ids only',async()=>{
  const studio=mediaShieldPageResponse(new Request('https://ekodi.kr/admin/media-shield'));
  assert.equal(studio.status,200);
  assert.match(studio.headers.get('content-security-policy'),/script-src 'self';/);
  assert.match(studio.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const body=await studio.text();
  assert.doesNotMatch(body,/<script>(?!<)/,'no inline scripts');
  const watch=await mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/ms-20261121-aaaabbbb')).text();
  assert.match(watch,/data-ekodi-media="ms-20261121-aaaabbbb"/);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/%3Cscript%3E')),null);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/')),null);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/profile')),null);
  for(const path of ['/__ekodi/mp4box.js','/__ekodi/media-studio.js','/__ekodi/media-watch.js','/__ekodi/media-pages.css'])
    assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr'+path)).status,200,path);
});

test('client scripts parse and never carry bundler helpers',()=>{
  for(const script of [MEDIA_SHIELD_PAGE_SCRIPTS.studio,MEDIA_SHIELD_PAGE_SCRIPTS.watch,MEDIA_SHIELD_PLAYER_SCRIPT,MP4BOX_SOURCE]){
    new vm.Script(script);
    assert.doesNotMatch(script,/__name\(/);
  }
  const sandbox={globalThis:{}};sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(MP4BOX_SOURCE,sandbox);
  assert.equal(typeof sandbox.EkodiMp4Box.createFile,'function');
  assert.equal(MP4BOX_VERSION,'2.6.0');
});

test('vendored mp4box keeps its BSD license next to it',async()=>{
  const license=await readFile(new URL('../vendor/mp4box/LICENSE',import.meta.url),'utf8');
  assert.match(license,/BSD|Redistribution and use in source and binary forms/);
});

test('manifest view exposes segment times only when consistent',()=>{
  assert.deepEqual(publicManifestView({version:'v1',contentId:'a-b-c',mime:'m',init:'init.bin',segments:['s00001.bin'],times:[0]}).times,[0]);
  assert.equal(publicManifestView({version:'v1',contentId:'a-b-c',mime:'m',init:'init.bin',segments:['s00001.bin'],times:[0,1]}).times,undefined);
});
