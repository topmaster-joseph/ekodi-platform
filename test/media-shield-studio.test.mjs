import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  externalEmbedUrl, handleMediaShieldRequest, MEDIA_SHIELD_PLAYER_SCRIPT, parseExternalVideoUrl, publicManifestView,
} from '../ekodi-media-shield.js';
import { mediaShieldPageResponse, MEDIA_SHIELD_PAGE_SCRIPTS } from '../ekodi-media-shield-pages.js';

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

test('admin API requires a real EKODI admin session',async()=>{
  const env=makeEnv();
  assert.equal((await call(env,'GET','admin/list')).status,401);
  assert.equal((await call(env,'GET','admin/list',{token:'forged'})).status,401);
  assert.equal((await call(env,'GET','admin/list',{token:'member'})).status,403);
  assert.equal((await call(env,'GET','admin/list',{token:'admin'})).status,200);
});

test('owner policy: video files are never stored on EKODI',async()=>{
  const env=makeEnv();
  for(const [method,path,opts] of [['POST','admin/new',{body:{}}],['POST','admin/key/ms-20261121-aaaabbbb',{body:{}}],['PUT','admin/part/ms-20261121-aaaabbbb/init.bin',{raw:new Uint8Array(64)}],['POST','admin/publish/ms-20261121-aaaabbbb',{body:{}}]]){
    const res=await call(env,method,path,{token:'admin',...opts});
    assert.equal(res.status,410,path);
    assert.equal((await res.json()).code,'VIDEO_STORAGE_DISABLED');
  }
  assert.equal(env.MEDIA_SHIELD_BUCKET.store.size,0);
});

test('external video URLs are parsed strictly',()=>{
  assert.deepEqual(parseExternalVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=90'),{provider:'youtube',videoId:'dQw4w9WgXcQ',start:90});
  assert.deepEqual(parseExternalVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s'),{provider:'youtube',videoId:'dQw4w9WgXcQ',start:65});
  assert.equal(parseExternalVideoUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ').videoId,'dQw4w9WgXcQ');
  assert.equal(parseExternalVideoUrl('https://www.youtube.com/live/dQw4w9WgXcQ').videoId,'dQw4w9WgXcQ');
  assert.deepEqual(parseExternalVideoUrl('https://vimeo.com/123456789/abcdef1234'),{provider:'vimeo',videoId:'123456789',hash:'abcdef1234',start:0});
  for(const bad of ['','javascript:alert(1)','https://evil.example/watch?v=dQw4w9WgXcQ','https://youtube.com/watch?v=short','https://youtube.com/watch?v=dQw4w9WgXcQ"><script>','ftp://youtu.be/dQw4w9WgXcQ'])
    assert.equal(parseExternalVideoUrl(bad),null,bad);
  assert.equal(externalEmbedUrl({provider:'youtube',videoId:'dQw4w9WgXcQ',start:90}),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&start=90');
  assert.equal(externalEmbedUrl({provider:'vimeo',videoId:'123456789',hash:'abcdef1234'}),'https://player.vimeo.com/video/123456789?dnt=1&title=0&byline=0&portrait=0&h=abcdef1234');
  assert.equal(externalEmbedUrl({provider:'youtube',videoId:'x"onload'}),'');
});

test('link flow: register → permitted member gets embed (never in HTML) → delete',async()=>{
  const env=makeEnv();
  assert.equal((await call(env,'POST','admin/link',{token:'member',body:{url:'https://youtu.be/dQw4w9WgXcQ',audience:'members'}})).status,403);
  assert.equal((await call(env,'POST','admin/link',{token:'admin',body:{url:'https://example.com/v.mp4',audience:'members'}})).status,400);
  assert.equal((await call(env,'POST','admin/link',{token:'admin',body:{url:'https://youtu.be/dQw4w9WgXcQ',audience:'subjects',subjects:'nope'}})).status,400);
  const res=await call(env,'POST','admin/link',{token:'admin',body:{url:'https://youtu.be/dQw4w9WgXcQ',title:'<i>주일 말씀</i>',audience:'members'}});
  assert.equal(res.status,200);
  const {contentId,watchPath}=await res.json();
  assert.equal(watchPath,'/my/media/'+contentId);
  const stored=[...env.MEDIA_SHIELD_BUCKET.store.keys()];
  assert.deepEqual(stored,[`media-shield/${contentId}/manifest.json`],'only metadata is stored');
  const list=await (await call(env,'GET','admin/list',{token:'admin'})).json();
  assert.equal(list.items[0].provider,'youtube');
  assert.equal(list.items[0].title,'i주일 말씀/i');
  // the watch page HTML never carries the video address
  const page=await mediaShieldPageResponse(new Request('https://ekodi.kr'+watchPath)).text();
  assert.doesNotMatch(page,/dQw4w9WgXcQ|youtube/);
  assert.equal((await call(env,'POST','token',{body:{contentId}})).status,401);
  const view=await call(env,'POST','token',{token:'member',body:{contentId}});
  assert.equal(view.status,200);
  const body=await view.json();
  assert.equal(body.kind,'link');
  assert.match(body.embedUrl,/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  assert.match(body.watermark,/^EKODI me\*\*\*@ekodi\.kr /);
  assert.equal(view.headers.get('cache-control'),'private, no-store, max-age=0');
  const {token}=await (await call(env,'POST','token',{token:'member',body:{contentId}})).json().catch(()=>({}));
  const t=(await (await handleMediaShieldRequest(req('POST','token',{token:'admin',body:{contentId}}),env,{})).json());
  assert.equal(t.kind,'link');
  const manifest=await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/manifest/${contentId}?t=${encodeURIComponent(token||'')}`),env,{});
  assert.notEqual(manifest.status,500);
  assert.equal((await call(env,'DELETE','admin/content/'+contentId,{token:'admin'})).status,200);
  assert.equal(env.MEDIA_SHIELD_BUCKET.store.size,0);
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
  assert.match(studio.headers.get('content-security-policy'),/frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com;/);
  const body=await studio.text();
  assert.doesNotMatch(body,/<script>(?!<)/,'no inline scripts');
  const watch=await mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/ms-20261121-aaaabbbb')).text();
  assert.match(watch,/data-ekodi-media="ms-20261121-aaaabbbb"/);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/%3Cscript%3E')),null);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/media/')),null);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/my/profile')),null);
  assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr/__ekodi/mp4box.js')),null,'no video packaging library is served');
  for(const path of ['/__ekodi/media-studio.js','/__ekodi/media-watch.js','/__ekodi/media-pages.css'])
    assert.equal(mediaShieldPageResponse(new Request('https://ekodi.kr'+path)).status,200,path);
});

test('client scripts parse and never carry bundler helpers',()=>{
  for(const script of [MEDIA_SHIELD_PAGE_SCRIPTS.studio,MEDIA_SHIELD_PAGE_SCRIPTS.watch,MEDIA_SHIELD_PLAYER_SCRIPT]){
    new vm.Script(script);
    assert.doesNotMatch(script,/__name\(/);
  }
  assert.doesNotMatch(MEDIA_SHIELD_PAGE_SCRIPTS.studio,/type="file"|EkodiMp4Box|PUT/);
});

test('manifest view exposes segment times only when consistent',()=>{
  assert.deepEqual(publicManifestView({version:'v1',contentId:'a-b-c',mime:'m',init:'init.bin',segments:['s00001.bin'],times:[0]}).times,[0]);
  assert.equal(publicManifestView({version:'v1',contentId:'a-b-c',mime:'m',init:'init.bin',segments:['s00001.bin'],times:[0,1]}).times,undefined);
});
