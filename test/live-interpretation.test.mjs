import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  handleLiveInterpretation, validateSimulcastDestination, normalizeTargetLanguages,
  normalizeCaptionText, streamIframeUrl, translateSegment, maskKey, LIVE_CAPTION_MAX_CHARS, LIVE_TRANSLATION_MODEL,
} from '../live-interpretation-control.js';
import { realtimeTenant } from '../realtime-tenant-registry.js';
import { evaluateRealtimeRequest } from '../src/realtime/entitlement.mjs';
import { handleRealtimeControl } from '../realtime-control.js';
import { tenantLivePage } from '../tenant-live-page.js';

const ACCOUNT='6986fd633f4e33bf804c921697b2d797';

function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0083_realtime_communication_core.sql',import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/202610250500_live_interpretation_simulcast.sql',import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({
    bind:(...values)=>statement(sql,values),
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}},
    _exec:()=>db.prepare(sql).run(...args),
  });
  return {raw:db,prepare:sql=>statement(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)s._exec();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return list.map(()=>({success:true}))}};
}

function json(_request,_env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})}

function harness({role='admin',authenticated=true,ai,stream}={}){
  const DB=d1();
  const calls=[];
  const env={DB,
    AI:ai===undefined?{run:async(model,input)=>{calls.push({model,input});return {translated_text:`[${input.target_lang}] ${input.text}`}}}:ai,
  };
  if(stream){Object.assign(env,{STREAM_API_TOKEN:'test-token',CLOUDFLARE_ACCOUNT_ID:ACCOUNT,__streamFetch:stream.fetch},stream.env||{})}
  const deps={json,realtimeTenant,evaluate:evaluateRealtimeRequest,subjectOf:id=>id.id,
    tenantAdminAccess:async(_req,_env,tenant)=>authenticated
      ?{identity:{id:`user:${role}`},role,tier:role==='admin'?'organization':'free',allowed:['owner','admin','tenant_admin','manager','operator'].includes(role),config:realtimeTenant(tenant)}
      :{identity:null,role:'',allowed:false}};
  const call=async(method,path,payload)=>{
    const url=new URL(`https://ekodi.kr${path}`);
    const request=new Request(url,{method,headers:{'content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
    const response=await handleLiveInterpretation(request,env,url,payload??null,deps);
    return {status:response.status,data:await response.json()};
  };
  return {env,DB,call,calls};
}

test('destination validation accepts official ingest hosts and rejects unsafe ones',()=>{
  const yt=validateSimulcastDestination({platform:'youtube',streamKey:'abcd-efgh-ijkl-mnop'});
  assert.equal(yt.ok,true);assert.equal(yt.url,'rtmps://a.rtmps.youtube.com/live2');assert.equal(yt.keyHint,'••••mnop');
  assert.equal(validateSimulcastDestination({platform:'youtube',url:'rtmp://a.rtmp.youtube.com/live2',streamKey:'k1234'}).ok,true);
  assert.equal(validateSimulcastDestination({platform:'facebook',streamKey:'FB-1234567890'}).host,'live-api-s.facebook.com');
  assert.equal(validateSimulcastDestination({platform:'youtube',url:'rtmps://live-api-s.facebook.com:443/rtmp/',streamKey:'k1234'}).error,'ingest_host_not_allowed_for_platform');
  assert.equal(validateSimulcastDestination({platform:'facebook',url:'https://www.facebook.com/live',streamKey:'k1234'}).error,'ingest_url_must_be_rtmp');
  assert.equal(validateSimulcastDestination({platform:'custom',url:'rtmp://10.0.0.5/live',streamKey:'k1234'}).error,'ingest_host_not_allowed_for_platform');
  assert.equal(validateSimulcastDestination({platform:'custom',url:'rtmp://user:pw@ingest.example.org/live',streamKey:'k1234'}).error,'ingest_url_credentials_forbidden');
  assert.equal(validateSimulcastDestination({platform:'custom',url:'rtmp://ingest.example.org/live',streamKey:'k1234'}).ok,true);
  assert.equal(validateSimulcastDestination({platform:'youtube',streamKey:'has space'}).error,'invalid_stream_key');
  assert.equal(validateSimulcastDestination({platform:'twitch',streamKey:'k1234'}).error,'unsupported_platform');
  assert.equal(maskKey('ab'),'••••');
});

test('language and caption normalization',()=>{
  assert.deepEqual(normalizeTargetLanguages(['en','EN','ko','xx','zh','ja'],'ko'),['en','zh','ja']);
  assert.deepEqual(normalizeTargetLanguages(['en','zh','ja'],'ko',2),['en','zh']);
  assert.deepEqual(normalizeTargetLanguages('en','ko'),[]);
  assert.equal(normalizeCaptionText(' 하나님\u0000은   사랑\n이십니다 '),'하나님 은 사랑 이십니다');
  assert.equal(normalizeCaptionText('가'.repeat(900)).length,LIVE_CAPTION_MAX_CHARS);
  assert.equal(streamIframeUrl({STREAM_CUSTOMER_CODE:'abc123xyz'},'0123456789abcdef0123456789abcdef'),'https://customer-abc123xyz.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe');
  assert.equal(streamIframeUrl({STREAM_CUSTOMER_CODE:'bad code'},'0123456789abcdef0123456789abcdef'),null);
  assert.equal(streamIframeUrl({STREAM_CUSTOMER_CODE:'abc123xyz'},'../x'),null);
});

test('translation is fail-open and retries with language names when codes return nothing',async()=>{
  const seen=[];
  const env={AI:{run:async(_m,input)=>{seen.push(input.target_lang);if(input.target_lang==='zh')throw new Error('boom');if(input.target_lang==='en')return {translated_text:''};return {translated_text:'ok'}}}};
  const out=await translateSegment(env,'은혜','ko',['en','zh','ja']);
  assert.deepEqual(out.map(x=>[x.lang,x.status]),[['en','ok'],['zh','failed'],['ja','ok']]);
  assert.equal(out[1].text,'은혜');
  assert.ok(seen.includes('english'),'name fallback attempted');
  const none=await translateSegment({},'은혜','ko',['en']);
  assert.deepEqual(none,[{lang:'en',text:'은혜',status:'failed'}]);
});

test('host runs an interpretation caption session that viewers read per language',async()=>{
  const h=harness();
  const start=await h.call('POST','/api/realtime/captions/sessions',{tenant:'church',sourceLang:'ko',targetLangs:['en','zh','ko','xx']});
  assert.equal(start.status,201);
  assert.deepEqual(start.data.session.targetLangs,['en','zh']);
  assert.equal(start.data.session.tenantId,'ekodichurch');
  const channels=h.DB.raw.prepare('SELECT language_code FROM realtime_language_channels ORDER BY language_code').all().map(r=>r.language_code);
  assert.deepEqual(channels,['en','zh']);

  const seg=await h.call('POST',`/api/realtime/captions/sessions/${start.data.session.id}/segments`,{text:'주님의 평강이 함께하길 바랍니다'});
  assert.equal(seg.status,201);assert.equal(seg.data.seq,1);
  assert.deepEqual(seg.data.translations.map(t=>t.text),['[en] 주님의 평강이 함께하길 바랍니다','[zh] 주님의 평강이 함께하길 바랍니다']);
  assert.ok(h.calls.every(c=>c.model===LIVE_TRANSLATION_MODEL));
  await h.call('POST',`/api/realtime/captions/sessions/${start.data.session.id}/segments`,{text:'두 번째 문장'});

  const en=await h.call('GET','/api/realtime/captions?tenant=ekodichurch&lang=en&after=0');
  assert.equal(en.status,200);assert.equal(en.data.lang,'en');
  assert.deepEqual(en.data.segments.map(s=>s.seq),[1,2]);assert.equal(en.data.next,2);
  const more=await h.call('GET','/api/realtime/captions?tenant=ekodichurch&lang=en&after=2');
  assert.deepEqual(more.data.segments,[]);assert.equal(more.data.next,2);
  const original=await h.call('GET','/api/realtime/captions?tenant=church&lang=original');
  assert.equal(original.data.lang,'ko');assert.equal(original.data.segments[0].text,'주님의 평강이 함께하길 바랍니다');
  const notOffered=await h.call('GET','/api/realtime/captions?tenant=ekodichurch&lang=ja');
  assert.equal(notOffered.data.lang,'ko','unsupported target falls back to source text');

  const isolated=await h.call('GET','/api/realtime/captions?tenant=ekodimission&lang=en');
  assert.equal(isolated.data.session,null,'another tenant never sees church captions');

  const end=await h.call('POST',`/api/realtime/captions/sessions/${start.data.session.id}/end`,{});
  assert.equal(end.data.session.status,'ended');
  const after=await h.call('GET','/api/realtime/captions?tenant=ekodichurch&lang=en');
  assert.equal(after.data.session,null);
  const late=await h.call('POST',`/api/realtime/captions/sessions/${start.data.session.id}/segments`,{text:'늦은 문장'});
  assert.equal(late.status,409);
});

test('caption session failure paths: auth, permission, empty input, AI outage',async()=>{
  const anon=harness({authenticated:false});
  const a=await anon.call('POST','/api/realtime/captions/sessions',{tenant:'ekodimission',targetLangs:['en']});
  assert.equal(a.status,401);assert.match(a.data.loginUrl,/site=mission/);
  const viewer=harness({role:'member'});
  assert.equal((await viewer.call('POST','/api/realtime/captions/sessions',{tenant:'ekodimission',targetLangs:['en']})).status,403);
  const h=harness({ai:{run:async()=>{throw new Error('ai down')}}});
  assert.equal((await h.call('POST','/api/realtime/captions/sessions',{tenant:'ekodimission',targetLangs:[]})).status,400);
  assert.equal((await h.call('POST','/api/realtime/captions/sessions',{tenant:'nope',targetLangs:['en']})).status,400);
  const s=await h.call('POST','/api/realtime/captions/sessions',{tenant:'ekodimission',sourceLang:'ko',targetLangs:['en','vi']});
  assert.equal((await h.call('POST',`/api/realtime/captions/sessions/${s.data.session.id}/segments`,{text:'   '})).status,400);
  const seg=await h.call('POST',`/api/realtime/captions/sessions/${s.data.session.id}/segments`,{text:'오늘도 함께 예배합니다'});
  assert.equal(seg.status,201);
  assert.deepEqual(seg.data.translations.map(t=>[t.status,t.text]),[['failed','오늘도 함께 예배합니다'],['failed','오늘도 함께 예배합니다']]);
  const row=h.DB.raw.prepare('SELECT translation_failures FROM live_caption_sessions WHERE id=?').get(s.data.session.id);
  assert.equal(row.translation_failures,2);
  const second=await h.call('POST','/api/realtime/captions/sessions',{tenant:'ekodimission',targetLangs:['en']});
  assert.equal(second.status,201);
  assert.equal(h.DB.raw.prepare("SELECT COUNT(*) AS n FROM live_caption_sessions WHERE tenant_id='ekodimission' AND status='active'").get().n,1,'a new session ends the previous one');
});

test('plan language limit trims targets instead of failing the broadcast',async()=>{
  const h=harness({role:'operator'});
  // operator is an admin role → admin tier; force a free tier to check trimming
  const env=h.env;const url=new URL('https://ekodi.kr/api/realtime/captions/sessions');
  const response=await handleLiveInterpretation(new Request(url,{method:'POST'}),env,url,{tenant:'church',targetLangs:['en','zh','ja','vi']},{json,realtimeTenant,evaluate:evaluateRealtimeRequest,subjectOf:x=>x.id,
    tenantAdminAccess:async()=>({identity:{id:'u'},role:'operator',tier:'free',allowed:true})});
  const data=await response.json();
  assert.equal(response.status,201);
  const max=evaluateRealtimeRequest({tier:'free',languages:4}).limits.maxLanguages;
  assert.equal(data.session.targetLangs.length,max);assert.equal(data.trimmedByPlan,4-max);
});

test('simulcast stays inert and explains setup when Cloudflare Stream is not configured',async()=>{
  const h=harness();
  const status=await h.call('GET','/api/realtime/simulcast?tenant=ekodichurch');
  assert.equal(status.status,200);assert.equal(status.data.configured,false);assert.equal(status.data.setup.reason,'stream_not_configured');
  assert.deepEqual(status.data.platforms.map(p=>p.id),['youtube','facebook','custom']);
  assert.equal((await h.call('POST','/api/realtime/simulcast/input',{tenant:'ekodichurch'})).status,503);
  const pub=await h.call('GET','/api/realtime/simulcast/public?tenant=ekodichurch');
  assert.deepEqual([pub.data.live,pub.data.player],[false,null]);
});

function fakeStream({state='disconnected',failCreate=false}={}){
  const requests=[];let outputs=0;
  const fetch=async(url,init={})=>{
    const method=init.method||'GET';const body=init.body?JSON.parse(init.body):undefined;
    requests.push({url,method,body,auth:init.headers?.authorization});
    const ok=(result)=>new Response(JSON.stringify({success:true,result}),{status:200});
    if(url.endsWith('/stream/live_inputs')&&method==='POST'){
      if(failCreate)return new Response(JSON.stringify({success:false,errors:[{message:'Stream subscription required'}]}),{status:403});
      return ok({uid:'0123456789abcdef0123456789abcdef',rtmps:{url:'rtmps://live.cloudflare.com:443/live/',streamKey:'INGEST-SECRET-KEY'}});
    }
    if(/\/live_inputs\/[a-f0-9]+$/.test(url)&&method==='GET')return ok({uid:'0123456789abcdef0123456789abcdef',status:{current:{state}},rtmps:{url:'rtmps://live.cloudflare.com:443/live/',streamKey:'INGEST-SECRET-KEY'}});
    if(url.endsWith('/outputs')&&method==='POST'){outputs++;return ok({uid:`out${outputs}abcdef`,url:body.url,streamKey:body.streamKey,enabled:true})}
    if(/\/outputs\/[^/]+$/.test(url))return ok(method==='DELETE'?null:{enabled:body?.enabled});
    return new Response(JSON.stringify({success:false,errors:[{message:'unexpected'}]}),{status:404});
  };
  return {fetch,requests};
}

test('simulcast engine: ingest, YouTube/Facebook outputs, toggle, delete, viewer player, no key at rest',async()=>{
  const stream=fakeStream({state:'connected'});
  const h=harness({stream:{fetch:stream.fetch,env:{STREAM_CUSTOMER_CODE:'ekodicode1'}}});
  const created=await h.call('POST','/api/realtime/simulcast/input',{tenant:'ekodichurch'});
  assert.equal(created.status,201);assert.equal(created.data.created,true);
  const again=await h.call('POST','/api/realtime/simulcast/input',{tenant:'church'});
  assert.equal(again.status,200);assert.equal(again.data.created,false);
  assert.equal(stream.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/live_inputs')).length,1,'input created once');
  assert.equal(stream.requests[0].url,`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/live_inputs`);
  assert.equal(stream.requests[0].auth,'Bearer test-token');
  assert.deepEqual(stream.requests[0].body.recording,{mode:'off'},'no paid recording storage by default');

  const status=await h.call('GET','/api/realtime/simulcast?tenant=ekodichurch');
  assert.equal(status.data.input.state,'connected');
  assert.equal(JSON.stringify(status.data).includes('INGEST-SECRET-KEY'),false,'status never exposes ingest key');
  const reveal=await h.call('POST','/api/realtime/simulcast/input/reveal',{tenant:'ekodichurch'});
  assert.equal(reveal.data.streamKey,'INGEST-SECRET-KEY');

  const yt=await h.call('POST','/api/realtime/simulcast/outputs',{tenant:'ekodichurch',platform:'youtube',streamKey:'yt-key-1234'});
  assert.equal(yt.status,201);assert.equal(yt.data.output.keyHint,'••••1234');
  const fb=await h.call('POST','/api/realtime/simulcast/outputs',{tenant:'ekodichurch',platform:'facebook',streamKey:'FB-9876543210'});
  assert.equal(fb.status,201);
  const outReq=stream.requests.filter(r=>r.url.endsWith('/outputs'));
  assert.deepEqual(outReq.map(r=>r.body.url),['rtmps://a.rtmps.youtube.com/live2','rtmps://live-api-s.facebook.com:443/rtmp/']);
  const bad=await h.call('POST','/api/realtime/simulcast/outputs',{tenant:'ekodichurch',platform:'youtube',url:'rtmp://evil.example.com/live',streamKey:'k1234'});
  assert.equal(bad.status,400);

  const dump=JSON.stringify([...h.DB.raw.prepare('SELECT * FROM live_stream_outputs').all(),...h.DB.raw.prepare('SELECT * FROM live_stream_inputs').all(),...h.DB.raw.prepare('SELECT * FROM realtime_audit_log').all()]);
  for(const secret of ['yt-key-1234','FB-9876543210','INGEST-SECRET-KEY'])assert.equal(dump.includes(secret),false,`${secret} must not be stored`);
  assert.ok(h.DB.raw.prepare("SELECT COUNT(*) AS n FROM realtime_audit_log WHERE action='simulcast.input.reveal'").get().n===1,'reveal is audited');

  const off=await h.call('POST',`/api/realtime/simulcast/outputs/${yt.data.output.id}`,{enabled:false});
  assert.equal(off.data.output.enabled,false);
  assert.equal(stream.requests.at(-1).method,'PUT');assert.deepEqual(stream.requests.at(-1).body,{enabled:false});
  const del=await h.call('DELETE',`/api/realtime/simulcast/outputs/${fb.data.output.id}`);
  assert.equal(del.status,200);
  const list=await h.call('GET','/api/realtime/simulcast?tenant=ekodichurch');
  assert.deepEqual(list.data.outputs.map(o=>o.platform),['youtube']);

  const pub=await h.call('GET','/api/realtime/simulcast/public?tenant=ekodichurch');
  assert.equal(pub.data.live,true);
  assert.equal(pub.data.player,'https://customer-ekodicode1.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe');
  assert.equal(JSON.stringify(pub.data).includes('SECRET'),false);

  const otherTenant=await h.call('GET','/api/realtime/simulcast/public?tenant=ekodimission');
  assert.equal(otherTenant.data.live,false,'mission has its own input');
  const viewerOnly=harness({role:'member',stream:{fetch:stream.fetch}});
  assert.equal((await viewerOnly.call('POST','/api/realtime/simulcast/input/reveal',{tenant:'ekodichurch'})).status,403);
});

test('simulcast provider errors are reported and audited, not swallowed',async()=>{
  const stream=fakeStream({failCreate:true});
  const h=harness({stream:{fetch:stream.fetch}});
  const created=await h.call('POST','/api/realtime/simulcast/input',{tenant:'ekodimission'});
  assert.equal(created.status,502);assert.equal(created.data.error,'stream_provider_error');
  assert.match(created.data.message,/subscription/);
  assert.equal(h.DB.raw.prepare("SELECT outcome FROM realtime_audit_log WHERE action='simulcast.input.create'").get().outcome,'failed');
  assert.equal((await h.call('POST','/api/realtime/simulcast/outputs',{tenant:'ekodimission',platform:'youtube',streamKey:'k12345'})).status,409);
});

test('realtime control routes add-on endpoints through the real handler',async()=>{
  const DB=d1();
  const env={DB,ALLOWED_ORIGINS:'https://ekodi.kr'};
  const get=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/captions?tenant=ekodichurch'),env);
  assert.equal(get.status,200);assert.equal((await get.json()).session,null);
  const langs=await (await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/interpretation/languages'),env)).json();
  assert.ok(langs.languages.some(l=>l.code==='mn'&&l.speechLocale==='mn-MN'));
  const post=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/captions/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenant:'ekodichurch',targetLangs:['en']})}),env);
  assert.equal(post.status,401,'no token → authentication required through the real identity chain');
  const room=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/rooms/none'),env);
  assert.equal(room.status,404,'existing room route still resolves');
});

test('every tenant live page mounts the interpretation console, simulcast panel and assets',async()=>{
  for(const slug of ['ekodichurch','ekodimission','cgma']){
    const tenant=realtimeTenant(slug);
    const html=await tenantLivePage({...tenant,dedicated:false}).text();
    assert.match(html,/data-live-interpretation-console/);
    assert.match(html,/data-live-simulcast/);
    assert.match(html,/<script src="\/live-interpretation\.js" defer><\/script>/);
    assert.match(html,/href="\/live-interpretation\.css"/);
    assert.match(html,/id="viewerListenLanguage"/);
  }
  const build=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.match(build,/'live-interpretation\.css','live-interpretation\.js'/);
  const client=fs.readFileSync(new URL('../live-interpretation.js',import.meta.url),'utf8');
  assert.match(client,/sessionStorage\.getItem\('ekodi-auth-token'\)/);
  assert.equal(/streamKey['"]?\s*:\s*['"][A-Za-z0-9]/.test(client),false,'no hard-coded key in client');
  const space=fs.readFileSync(new URL('../space-worker.js',import.meta.url),'utf8');
  assert.match(space,/liveStudioHeaders\(withHeaders\(env,tenantLivePage\(tenant\)/);
  assert.match(space,/camera=\(self\), microphone=\(self\)/);
});
