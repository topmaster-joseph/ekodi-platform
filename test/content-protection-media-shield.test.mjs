import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  applyContentProtection, contentGuardCsp, contentProtectionAssetResponse, contentProtectionTier,
  CONTENT_GUARD_SCRIPT, CONTENT_GUARD_SCRIPT_PATH, isSourceMapRequest,
} from '../content-protection-policy.js';
import {
  decryptSegment, deriveContentKeyBytes, encryptSegment, handleMediaShieldRequest, issuePlaybackToken,
  maskSubject, MEDIA_SHIELD_PLAYER_SCRIPT, mediaShieldPlayerResponse, unwrapContentKey, verifyPlaybackToken, wrapContentKey,
} from '../ekodi-media-shield.js';

const SECRET='t'.repeat(40);
const MASTER='m'.repeat(48);

// ---------------------------------------------------------------- content protection
test('protection tier: admin and member surfaces protected, public pages untouched',()=>{
  for(const path of ['/admin','/admin/sites','/ekodichurch/admin/','/my','/my/invest','/singles/profile','/books/read/abc','/workspace/x'])
    assert.equal(contentProtectionTier(path),'protected',path);
  for(const path of ['/','/ekodichurch','/ekodimall/item/1','/books','/mypage-info','/administration-notice'])
    assert.equal(contentProtectionTier(path),'public',path);
  assert.equal(contentProtectionTier('/api/admin/x'),'none');
});

test('source maps are refused and guard assets served',async()=>{
  assert.equal(isSourceMapRequest('/shell/shell.js.map'),true);
  assert.equal(isSourceMapRequest('/shell/shell.js'),false);
  const map=contentProtectionAssetResponse(new Request('https://ekodi.kr/admin-shell.js.map'));
  assert.equal(map.status,404);
  const script=contentProtectionAssetResponse(new Request('https://ekodi.kr'+CONTENT_GUARD_SCRIPT_PATH));
  assert.equal(script.status,200);
  assert.match(script.headers.get('content-type'),/javascript/);
  assert.equal(contentProtectionAssetResponse(new Request('https://ekodi.kr/index.html')),null);
});

test('guard client script parses',()=>{new vm.Script(CONTENT_GUARD_SCRIPT);new vm.Script(MEDIA_SHIELD_PLAYER_SCRIPT);});

test('CSP is extended with the exact guard asset, replacing a lone none',()=>{
  const next=contentGuardCsp("default-src 'none'; script-src 'none'; style-src 'unsafe-inline'",'https://ekodi.kr');
  assert.match(next,/script-src https:\/\/ekodi\.kr\/__ekodi\/content-guard\.js/);
  assert.doesNotMatch(next,/script-src 'none'/);
  assert.match(next,/style-src 'unsafe-inline' https:\/\/ekodi\.kr\/__ekodi\/content-guard\.css/);
  const selfCsp="default-src 'self'; script-src 'self'";
  assert.equal(contentGuardCsp(selfCsp,'https://ekodi.kr').includes("script-src 'self'"),true);
});

test('protected HTML gets no-store, trace header and stripped source map headers',async()=>{
  const upstream=new Response('<html><head></head><body>x</body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60','SourceMap':'/a.js.map','content-security-policy':"script-src 'self'"}});
  const response=await applyContentProtection(upstream,new Request('https://ekodi.kr/admin/sites',{headers:{'cf-ray':'abc123'}}),{EKODI_CONTENT_TRACE_SECRET:'s'.repeat(40)});
  assert.equal(response.headers.get('x-ekodi-content-guard'),'v1');
  assert.match(response.headers.get('x-ekodi-trace'),/^[0-9A-F]{12}$/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('sourcemap'),null);
  assert.match(response.headers.get('x-robots-tag'),/noarchive/);
});

test('existing no-store directives are preserved verbatim for release contracts',async()=>{
  for(const value of ['no-store','private, no-store']){
    const upstream=new Response('<html><head></head></html>',{headers:{'content-type':'text/html','cache-control':value,'x-robots-tag':'noindex, nofollow, noarchive'}});
    const response=await applyContentProtection(upstream,new Request('https://ekodi.kr/mail'),{});
    assert.equal(response.headers.get('cache-control'),value);
    assert.match(`x-robots-tag: ${response.headers.get('x-robots-tag')}`,/x-robots-tag: noindex, nofollow, noarchive/);
  }
});

test('public HTML keeps caching and is not guarded',async()=>{
  const upstream=new Response('<html></html>',{headers:{'content-type':'text/html','cache-control':'public, max-age=60','X-SourceMap':'x'}});
  const response=await applyContentProtection(upstream,new Request('https://ekodi.kr/ekodichurch'),{});
  assert.equal(response.headers.get('x-ekodi-content-guard'),null);
  assert.equal(response.headers.get('cache-control'),'public, max-age=60');
  assert.equal(response.headers.get('x-sourcemap'),null);
});

// ---------------------------------------------------------------- media shield core
test('segments round-trip and are bound to content + segment name',async()=>{
  const key=await deriveContentKeyBytes(MASTER,'sermon-001');
  assert.equal(key.length,32);
  assert.notDeepEqual(key,await deriveContentKeyBytes(MASTER,'sermon-002'));
  const plain=new TextEncoder().encode('fmp4 bytes');
  const sealed=await encryptSegment(key,'sermon-001','s00001.bin',plain);
  assert.deepEqual(await decryptSegment(key,'sermon-001','s00001.bin',sealed),plain);
  await assert.rejects(decryptSegment(key,'sermon-001','s00002.bin',sealed));
  await assert.rejects(decryptSegment(key,'sermon-002','s00001.bin',sealed));
});

test('playback tokens: signature, expiry and content binding',async()=>{
  const now=Date.now();
  const {token}=await issuePlaybackToken({contentId:'sermon-001',subject:'joseph@ekodi.kr',ttlSeconds:60,now},SECRET);
  assert.equal((await verifyPlaybackToken(token,SECRET,{now,contentId:'sermon-001'})).ok,true);
  assert.equal((await verifyPlaybackToken(token,SECRET,{now:now+61000})).reason,'EXPIRED');
  assert.equal((await verifyPlaybackToken(token,SECRET,{now,contentId:'other-01'})).reason,'CONTENT_MISMATCH');
  assert.equal((await verifyPlaybackToken(token,'x'.repeat(40),{now})).reason,'BAD_SIGNATURE');
  const [p,b,s]=token.split('.');
  const forged=`${p}.${b.slice(0,-2)}AA.${s}`;
  assert.equal((await verifyPlaybackToken(forged,SECRET,{now})).ok,false);
  await assert.rejects(issuePlaybackToken({contentId:'sermon-001',subject:'a'},'short'));
});

test('content key is wrapped to the viewer and unwraps non-extractable',async()=>{
  const viewer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const pub=await crypto.subtle.exportKey('jwk',viewer.publicKey);
  const keyBytes=await deriveContentKeyBytes(MASTER,'lecture-01');
  const envelope=await wrapContentKey(keyBytes,{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y});
  const key=await unwrapContentKey(envelope,viewer.privateKey);
  assert.equal(key.extractable,false);
  const sealed=await encryptSegment(keyBytes,'lecture-01','init.bin',new Uint8Array([1,2,3]));
  assert.deepEqual(await decryptSegment(key,'lecture-01','init.bin',sealed),new Uint8Array([1,2,3]));
  // another viewer cannot unwrap
  const other=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  await assert.rejects(unwrapContentKey(envelope,other.privateKey));
  await assert.rejects(wrapContentKey(keyBytes,{kty:'EC',crv:'P-256',x:pub.x,y:pub.y,d:'leak'}));
});

test('masking never reveals the full subject',()=>{
  assert.equal(maskSubject('joseph@ekodi.kr'),'jo***@ekodi.kr');
  assert.equal(maskSubject('person:1234567890abcdef'),'pers…cdef');
});

// ---------------------------------------------------------------- media shield HTTP
function memoryBucket(objects){
  return {async get(key){if(!(key in objects))return null;const value=objects[key];return {body:value,json:async()=>JSON.parse(value)};}};
}
const manifest={version:'v1',contentId:'sermon-001',title:'주일 말씀',mime:'video/mp4; codecs="avc1.64001f"',init:'init.bin',segments:['s00001.bin'],audience:'subjects',subjects:['member@ekodi.kr']};
const env={EKODI_MEDIA_SHIELD_TOKEN_SECRET:SECRET,EKODI_MEDIA_SHIELD_MASTER_KEY:MASTER,MEDIA_SHIELD_BUCKET:memoryBucket({
  'media-shield/sermon-001/manifest.json':JSON.stringify(manifest),
  'media-shield/sermon-001/s00001.bin':'cipher',
})};
const asUser=email=>({resolvePrincipal:async()=>email?{id:'person:1',email}:null});
const post=(path,body)=>new Request('https://ekodi.kr/api/media-shield/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('media shield fails closed when not configured',async()=>{
  const response=await handleMediaShieldRequest(post('token',{contentId:'sermon-001'}),{},asUser('member@ekodi.kr'));
  assert.equal(response.status,503);
});

test('media shield HTTP flow: auth, audience, token, manifest, segment, key',async()=>{
  assert.equal((await handleMediaShieldRequest(post('token',{contentId:'sermon-001'}),env,asUser(null))).status,401);
  assert.equal((await handleMediaShieldRequest(post('token',{contentId:'sermon-001'}),env,asUser('stranger@x.kr'))).status,403);
  assert.equal((await handleMediaShieldRequest(post('token',{contentId:'missing-01'}),env,asUser('member@ekodi.kr'))).status,404);
  const tokenResponse=await handleMediaShieldRequest(post('token',{contentId:'sermon-001'}),env,asUser('member@ekodi.kr'));
  assert.equal(tokenResponse.status,200);
  assert.equal(tokenResponse.headers.get('cache-control'),'private, no-store, max-age=0');
  const {token}=await tokenResponse.json();
  const manifestResponse=await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/manifest/sermon-001?t=${token}`),env,{});
  const view=(await manifestResponse.json()).manifest;
  assert.equal(view.subjects,undefined,'audience list must not leak');
  assert.deepEqual(view.segments,['s00001.bin']);
  assert.equal((await handleMediaShieldRequest(new Request('https://ekodi.kr/api/media-shield/segment/sermon-001/s00001.bin'),env,{})).status,401);
  assert.notEqual((await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/segment/sermon-001/../manifest.json?t=${token}`),env,{})).status,200);
  assert.equal((await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/segment/sermon-001/manifest.json?t=${token}`),env,{})).status,404);
  const segment=await handleMediaShieldRequest(new Request(`https://ekodi.kr/api/media-shield/segment/sermon-001/s00001.bin?t=${token}`),env,{});
  assert.equal(segment.status,200);
  assert.equal(await segment.text(),'cipher');
  const viewer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const pub=await crypto.subtle.exportKey('jwk',viewer.publicKey);
  const keyResponse=await handleMediaShieldRequest(post('key',{token,publicKey:{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}}),env,{});
  const body=await keyResponse.json();
  assert.equal(keyResponse.status,200);
  assert.match(body.watermark,/^EKODI me\*\*\*@ekodi\.kr /);
  const key=await unwrapContentKey(body.envelope,viewer.privateKey);
  const sealed=await encryptSegment(await deriveContentKeyBytes(MASTER,'sermon-001'),'sermon-001','s00001.bin',new Uint8Array([9]));
  assert.deepEqual(await decryptSegment(key,'sermon-001','s00001.bin',sealed),new Uint8Array([9]));
  assert.equal((await handleMediaShieldRequest(post('key',{token:'ms1.bad.sig',publicKey:pub}),env,{})).status,401);
});

test('player script is served from a fixed path only',()=>{
  assert.equal(mediaShieldPlayerResponse(new Request('https://ekodi.kr/__ekodi/media-shield-player.js')).status,200);
  assert.equal(mediaShieldPlayerResponse(new Request('https://ekodi.kr/__ekodi/other.js')),null);
});

// Regression guardrail (2026-11-18 rollback): the protection layer must never break a
// header marker that the Shared Site guarded release verifies in production.
test('protection layer preserves every Shared Site release header marker',async()=>{
  const { readFile }=await import('node:fs/promises');
  const { applyPlatformSecurityHeaders }=await import('../platform-security-policy.js');
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const requests=(manifest.worker||manifest).requests||[];
  const norm=res=>[...res.headers.entries()].map(([k,v])=>`${k}: ${v}`).join('\n').toLowerCase();
  const info=console.info;console.info=()=>{};
  const regressions=[];
  try{
    for(const entry of requests){
      const markers=entry.headerExpect||[];
      if(!markers.length)continue;
      const base=new Headers({'content-type':/\.js(\?|$)/.test(entry.url)?'text/javascript':/\.css(\?|$)/.test(entry.url)?'text/css':'text/html; charset=utf-8'});
      for(const marker of markers){const i=marker.indexOf(':');base.append(marker.slice(0,i).trim(),marker.slice(i+1).trim());}
      const status=markers.some(m=>m.toLowerCase().startsWith('location:'))?302:200;
      const request=new Request(entry.url,{method:entry.method||'GET'});
      const before=norm(applyPlatformSecurityHeaders(new Response('<html><head></head></html>',{status,headers:new Headers(base)}),request));
      const after=norm(applyPlatformSecurityHeaders(await applyContentProtection(new Response('<html><head></head></html>',{status,headers:new Headers(base)}),request,{}),request));
      for(const marker of markers)if(before.includes(marker.toLowerCase())&&!after.includes(marker.toLowerCase()))regressions.push(`${entry.url} → ${marker}`);
    }
  }finally{console.info=info;}
  assert.deepEqual(regressions,[]);
});
