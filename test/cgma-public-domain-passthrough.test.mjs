import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeCgmaPublic,cgmaPublicUpstreamUrl,cgmaPublicLocation} from '../platform-router-entry-worker.js';

// Owner decision 2026-10-20 + amendment 2026-09-03 v1.5.2: cgma.or.kr is the
// representative public address and must never bounce visitors to ekodi.kr/cgma.

function siteEnv(status){
  const row={public_status:status,maintenance_display_type:'default',maintenance_redirect_url:'',maintenance_title:'점검 중',maintenance_message:'곧 돌아옵니다',redirect_mode:'button'};
  const stmt={bind:()=>stmt,first:async()=>row,run:async()=>({})};
  return {DB:{prepare:()=>stmt,batch:async()=>[]}};
}
function recordingUpstream(response=new Response('<html>ok</html>',{status:200,headers:{'content-type':'text/html'}})){
  const calls=[];
  const fetchImpl=async request=>{calls.push({url:request.url,method:request.method,host:request.headers.get('x-forwarded-host'),auth:request.headers.get('authorization'),body:request.body?await request.text():null});return response.clone()};
  return {calls,fetchImpl};
}

test('upstream and location mapping keep the cgma.or.kr address',()=>{
  assert.equal(cgmaPublicUpstreamUrl('https://cgma.or.kr/festival/2026/apply/?a=1').toString(),'https://cheonggye-market.pages.dev/festival/2026/apply/?a=1');
  assert.equal(cgmaPublicLocation('/member/'),'https://cgma.or.kr/member/');
  assert.equal(cgmaPublicLocation('https://cheonggye-market.pages.dev/x?y=1'),'https://cgma.or.kr/x?y=1');
  assert.equal(cgmaPublicLocation('https://example.com/login?site=cgma'),'https://example.com/login?site=cgma');
});

test('public mode serves the CGMA surface under cgma.or.kr (no redirect to ekodi.kr/cgma)',async()=>{
  const up=recordingUpstream();
  const res=await routeCgmaPublic(new Request('https://cgma.or.kr/?ref=kakao'),siteEnv('public'),up.fetchImpl);
  assert.equal(res.status,200);
  assert.equal(res.headers.get('location'),null);
  assert.equal(res.headers.get('x-ekodi-public-site-mode'),'public-passthrough');
  assert.equal(await res.text(),'<html>ok</html>');
  assert.deepEqual([up.calls[0].url,up.calls[0].host],['https://cheonggye-market.pages.dev/?ref=kakao','cgma.or.kr']);
});

test('public mode forwards writes with their body and authorization',async()=>{
  const up=recordingUpstream(new Response('{"ok":true}',{status:201,headers:{'content-type':'application/json'}}));
  const res=await routeCgmaPublic(new Request('https://cgma.or.kr/api/schedule',{method:'POST',headers:{authorization:'Bearer t','content-type':'application/json'},body:'{"title":"x"}'}),siteEnv('public'),up.fetchImpl);
  assert.equal(res.status,201);
  assert.deepEqual([up.calls[0].method,up.calls[0].auth,up.calls[0].body],['POST','Bearer t','{"title":"x"}']);
});

test('upstream redirects are rewritten onto cgma.or.kr',async()=>{
  const up=recordingUpstream(new Response(null,{status:301,headers:{location:'/'}}));
  const res=await routeCgmaPublic(new Request('https://cgma.or.kr/index.html'),siteEnv('public'),up.fetchImpl);
  assert.equal(res.status,301);
  assert.equal(res.headers.get('location'),'https://cgma.or.kr/');
});

test('www is folded into the apex address',async()=>{
  const up=recordingUpstream();
  const res=await routeCgmaPublic(new Request('https://www.cgma.or.kr/ai-education/?s=1'),siteEnv('public'),up.fetchImpl);
  assert.equal(res.status,308);
  assert.equal(res.headers.get('location'),'https://cgma.or.kr/ai-education/?s=1');
  assert.equal(up.calls.length,0);
});

test('maintenance mode still shows the maintenance page and refuses writes without touching upstream',async()=>{
  const up=recordingUpstream();
  const page=await routeCgmaPublic(new Request('https://cgma.or.kr/'),siteEnv('maintenance'),up.fetchImpl);
  assert.notEqual(page.headers.get('x-ekodi-public-site-mode'),'public-passthrough');
  assert.equal(page.headers.get('location'),null);
  const write=await routeCgmaPublic(new Request('https://cgma.or.kr/api/notices',{method:'POST',body:'{}'}),siteEnv('maintenance'),up.fetchImpl);
  assert.equal(write.status,503);
  assert.equal(up.calls.length,0);
});

test('the legacy redirect to ekodi.kr/cgma is gone and all methods reach the CGMA route',async()=>{
  const src=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/cgmaCanonicalRedirect/);
  assert.match(src,/if\(CGMA_HOSTS\.has\(host\)\)return routeCgmaPublic\(request,env\);/);
});
