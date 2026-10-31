// EKODI Live add-ons shared by every realtime tenant (church, mission, and any
// site registered in realtime-tenant-registry.js):
//   1. Multilingual interpretation captions: a host device sends source-language
//      segments (browser speech recognition or typed by an interpreter); the
//      Control API translates each segment once per target language with the
//      Workers AI translation model and viewers poll them by language.
//   2. External simulcast: Cloudflare Stream live input (RTMPS ingest from an
//      encoder such as OBS or Larix) with Stream "outputs" pushing the same
//      program to YouTube, Facebook or another RTMP(S) destination.
// Stream keys never reach viewers. Destination keys are forwarded to Cloudflare
// Stream once and never stored by EKODI; only a masked hint is kept.

import { SIMULCAST_RELAY_CAPABILITY, SIMULCAST_RELAY_COMMANDS, SIMULCAST_RELAY_FFMPEG, SIMULCAST_RELAY_INGEST, SIMULCAST_RELAY_MAX_DESTINATIONS, SIMULCAST_RELAY_POLICY_ID, sanitizeSimulcastRelayPayload, summarizeSimulcastRelayResult } from './simulcast-relay-policy.js';

export const LIVE_TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';
export const LIVE_CAPTION_MAX_CHARS = 400;
export const LIVE_CAPTION_PAGE = 60;
const STREAM_API = 'https://api.cloudflare.com/client/v4/accounts';
const TRANSLATION_TIMEOUT_MS = 6000;

// code → label, speech-recognition locale, m2m100 language name fallback.
export const LIVE_LANGUAGES = Object.freeze({
  ko:{label:'한국어',speech:'ko-KR',name:'korean'},
  en:{label:'English',speech:'en-US',name:'english'},
  zh:{label:'中文',speech:'zh-CN',name:'chinese'},
  ja:{label:'日本語',speech:'ja-JP',name:'japanese'},
  vi:{label:'Tiếng Việt',speech:'vi-VN',name:'vietnamese'},
  mn:{label:'Монгол',speech:'mn-MN',name:'mongolian'},
  uz:{label:'Oʻzbek',speech:'uz-UZ',name:'uzbek'},
  ru:{label:'Русский',speech:'ru-RU',name:'russian'},
  th:{label:'ไทย',speech:'th-TH',name:'thai'},
  id:{label:'Bahasa Indonesia',speech:'id-ID',name:'indonesian'},
  ne:{label:'नेपाली',speech:'ne-NP',name:'nepali'},
  tl:{label:'Filipino',speech:'fil-PH',name:'tagalog'},
  es:{label:'Español',speech:'es-ES',name:'spanish'},
  fr:{label:'Français',speech:'fr-FR',name:'french'},
});

const PLATFORM_RULES = Object.freeze({
  youtube:{label:'YouTube',hosts:host=>/(^|\.)youtube\.com$/.test(host)&&/rtmp/.test(host),
    keyHelp:'https://studio.youtube.com/channel/UC/livestreaming',
    defaultUrl:'rtmps://a.rtmps.youtube.com/live2'},
  facebook:{label:'Facebook',hosts:host=>/(^|\.)facebook\.com$/.test(host),
    keyHelp:'https://www.facebook.com/live/producer',
    defaultUrl:'rtmps://live-api-s.facebook.com:443/rtmp/'},
  // Instagram Live Producer (Professional account, desktop) issues a per-session
  // RTMPS server URL and key on Meta ingest hosts. Stored as 'custom' to keep the
  // existing table constraint; the label carries the channel name.
  instagram:{label:'Instagram Live',storeAs:'custom',hosts:host=>/(^|\.)(facebook\.com|fbcdn\.net|instagram\.com)$/.test(host),
    keyHelp:'https://www.instagram.com/',defaultUrl:'',requireRtmps:true},
  custom:{label:'기타 RTMP',hosts:host=>Boolean(host)&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)&&!host.includes(':')&&host!=='localhost'&&host.includes('.'),
    keyHelp:'',defaultUrl:''},
});

function clean(value,max=240){return String(value??'').trim().slice(0,max)}
function langCode(value){const code=clean(value,8).toLowerCase();return Object.hasOwn(LIVE_LANGUAGES,code)?code:''}
function nowIso(){return new Date().toISOString()}
function newId(prefix){return `${prefix}_${crypto.randomUUID().replaceAll('-','')}`}
export function maskKey(value){const key=clean(value,256);if(key.length<=4)return '••••';return `••••${key.slice(-4)}`}

export function normalizeTargetLanguages(list,sourceLang,maxLanguages=Infinity){
  const out=[];
  for(const item of Array.isArray(list)?list:[]){
    const code=langCode(item);
    if(code&&code!==sourceLang&&!out.includes(code))out.push(code);
  }
  return out.slice(0,Math.max(0,Math.min(Number.isFinite(maxLanguages)?maxLanguages:out.length,Object.keys(LIVE_LANGUAGES).length)));
}

export function normalizeCaptionText(value){
  return String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,LIVE_CAPTION_MAX_CHARS);
}

export function validateSimulcastDestination(input={}){
  const platform=clean(input.platform,20).toLowerCase();
  const rule=PLATFORM_RULES[platform];
  if(!rule)return {ok:false,error:'unsupported_platform'};
  const rawUrl=clean(input.url||rule.defaultUrl,500);
  let parsed;try{parsed=new URL(rawUrl)}catch{return {ok:false,error:'invalid_ingest_url'}}
  if(!['rtmp:','rtmps:'].includes(parsed.protocol))return {ok:false,error:'ingest_url_must_be_rtmp'};
  if(rule.requireRtmps&&parsed.protocol!=='rtmps:')return {ok:false,error:'ingest_url_must_be_rtmps'};
  if(parsed.username||parsed.password)return {ok:false,error:'ingest_url_credentials_forbidden'};
  const host=parsed.hostname.toLowerCase();
  if(!rule.hosts(host))return {ok:false,error:'ingest_host_not_allowed_for_platform'};
  const streamKey=String(input.streamKey??'').trim();
  if(streamKey.length<4||streamKey.length>256||/\s/.test(streamKey))return {ok:false,error:'invalid_stream_key'};
  const label=clean(input.label,60)||rule.label;
  return {ok:true,platform:rule.storeAs||platform,preset:platform,url:parsed.toString(),host,streamKey,label,keyHint:maskKey(streamKey)};
}

export function streamIframeUrl(env,liveInputUid){
  const code=clean(env?.STREAM_CUSTOMER_CODE,64).toLowerCase();
  const uid=clean(liveInputUid,64);
  if(!/^[a-z0-9]{6,64}$/.test(code)||!/^[a-f0-9]{16,64}$/i.test(uid))return null;
  return `https://customer-${code}.cloudflarestream.com/${uid}/iframe`;
}

export function streamConfigured(env){
  return Boolean(clean(env?.STREAM_API_TOKEN,400)&&/^[a-f0-9]{32}$/i.test(clean(env?.CLOUDFLARE_ACCOUNT_ID,64)));
}

function inputState(result){
  const status=result?.status;
  const state=typeof status==='string'?status:(status?.current?.state||status?.state||'');
  return clean(state,40).toLowerCase()||'unknown';
}

async function streamCall(env,path,{method='GET',payload}={}){
  if(!streamConfigured(env))throw Object.assign(new Error('stream_not_configured'),{status:503,code:'stream_not_configured'});
  const init={method,headers:{authorization:`Bearer ${clean(env.STREAM_API_TOKEN,400)}`,'content-type':'application/json'}};
  if(payload!==undefined)init.body=JSON.stringify(payload);
  const fetcher=env.__streamFetch||fetch;
  const response=await fetcher(`${STREAM_API}/${clean(env.CLOUDFLARE_ACCOUNT_ID,64)}/stream${path}`,init);
  const data=await response.json().catch(()=>({success:false,errors:[{message:'invalid_provider_response'}]}));
  if(!response.ok||data?.success===false){
    const message=clean(data?.errors?.[0]?.message||`stream_${response.status}`,200);
    throw Object.assign(new Error(message),{status:502,code:'stream_provider_error',providerStatus:response.status});
  }
  return data?.result??null;
}

// Translate one segment into every target language. Fail-open: a failed or
// slow translation keeps the original text so viewers never lose the speech.
export async function translateSegment(env,text,sourceLang,targets){
  const settled=await Promise.all(targets.map(async target=>{
    if(!env?.AI?.run)return {lang:target,text,status:'failed'};
    const attempt=async(source,targetName)=>{
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('translation_timeout')),TRANSLATION_TIMEOUT_MS)});
      try{
        const result=await Promise.race([env.AI.run(LIVE_TRANSLATION_MODEL,{text,source_lang:source,target_lang:targetName}),timeout]);
        return normalizeCaptionText(result?.translated_text??result?.response??'');
      }finally{clearTimeout(timer)}
    };
    try{
      let out=await attempt(sourceLang,target);
      if(!out)out=await attempt(LIVE_LANGUAGES[sourceLang].name,LIVE_LANGUAGES[target].name);
      return out?{lang:target,text:out,status:'ok'}:{lang:target,text,status:'failed'};
    }catch{return {lang:target,text,status:'failed'}}
  }));
  return settled;
}

async function audit(env,tenant,actor,action,outcome,detail={}){
  await env.DB.prepare(`INSERT INTO realtime_audit_log(id,tenant_id,room_id,actor_user_id,action,outcome,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(newId('audit'),tenant,null,actor||null,action,outcome,JSON.stringify(detail).slice(0,2000),nowIso()).run().catch(()=>{});
}

function safeSession(row){
  if(!row)return null;
  let targets=[];try{targets=JSON.parse(row.target_langs_json||'[]')}catch{}
  return {id:row.id,tenantId:row.tenant_id,roomId:row.room_id||null,sourceLang:row.source_lang,targetLangs:targets,status:row.status,segmentCount:Number(row.segment_count||0),translationFailures:Number(row.translation_failures||0),createdAt:row.created_at,updatedAt:row.updated_at,endedAt:row.ended_at||null};
}
function safeOutput(row){
  return {id:row.id,platform:row.platform,label:row.label,ingestHost:row.ingest_host,keyHint:row.key_hint,enabled:Boolean(row.enabled),createdAt:row.created_at,updatedAt:row.updated_at};
}

async function activeSession(env,tenant){
  return env.DB.prepare(`SELECT * FROM live_caption_sessions WHERE tenant_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).bind(tenant).first();
}

function catalog(){
  return Object.entries(LIVE_LANGUAGES).map(([code,item])=>({code,label:item.label,speechLocale:item.speech}));
}

export async function handleLiveInterpretation(request,env,url,input,deps){
  const {json,tenantAdminAccess,subjectOf,realtimeTenant,evaluate}=deps;
  const path=url.pathname;
  if(!/^\/api\/realtime\/(captions|interpretation|simulcast|relay)(\/|$)/.test(path))return null;
  if(!env.DB)return json(request,env,{ok:false,error:'database_not_configured'},503);

  const tenantOf=value=>realtimeTenant(clean(value,80)||'');
  const requireHost=async tenantValue=>{
    const config=tenantOf(tenantValue);
    if(!config)return {response:json(request,env,{ok:false,error:'invalid_tenant'},400)};
    const access=await tenantAdminAccess(request,env,config.apiTenant);
    if(!access.identity)return {response:json(request,env,{ok:false,error:'authentication_required',loginUrl:`https://ekodi.kr/auth/?site=${encodeURIComponent(config.authSite)}&return_to=${encodeURIComponent('https://ekodi.kr'+config.path+'?mode=studio')}`},401)};
    if(!access.allowed)return {response:json(request,env,{ok:false,error:'tenant_host_permission_required'},403)};
    return {config,access,actor:subjectOf(access.identity)};
  };

  // ---------- public reads ----------
  if(request.method==='GET'&&path==='/api/realtime/interpretation/languages'){
    return json(request,env,{ok:true,model:LIVE_TRANSLATION_MODEL,languages:catalog()});
  }
  if(request.method==='GET'&&path==='/api/realtime/captions'){
    const config=tenantOf(url.searchParams.get('tenant'));
    if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const session=await activeSession(env,config.apiTenant);
    if(!session)return json(request,env,{ok:true,tenant:config.apiTenant,session:null,segments:[],next:0});
    const view=safeSession(session);
    const wanted=clean(url.searchParams.get('lang'),12).toLowerCase();
    const lang=wanted==='original'||!wanted?view.sourceLang:(langCode(wanted)||view.sourceLang);
    const servedLang=lang===view.sourceLang||view.targetLangs.includes(lang)?lang:view.sourceLang;
    const after=Math.max(0,Math.floor(Number(url.searchParams.get('after')||0))||0);
    const rows=await env.DB.prepare(`SELECT seq,lang,text,translation_status,created_at FROM live_caption_segments WHERE session_id=? AND lang=? AND seq>? ORDER BY seq ASC LIMIT ?`).bind(session.id,servedLang,after,LIVE_CAPTION_PAGE).all();
    const segments=(rows.results||[]).map(row=>({seq:Number(row.seq),lang:row.lang,text:row.text,status:row.translation_status,at:row.created_at}));
    const next=segments.length?segments[segments.length-1].seq:after;
    return json(request,env,{ok:true,tenant:config.apiTenant,session:{id:view.id,sourceLang:view.sourceLang,targetLangs:view.targetLangs,status:view.status},lang:servedLang,requestedLang:wanted||'original',segments,next});
  }
  if(request.method==='GET'&&path==='/api/realtime/simulcast/public'){
    const config=tenantOf(url.searchParams.get('tenant'));
    if(!config)return json(request,env,{ok:false,error:'invalid_tenant'},400);
    const row=await env.DB.prepare(`SELECT live_input_uid FROM live_stream_inputs WHERE tenant_id=?`).bind(config.apiTenant).first();
    if(!row||!streamConfigured(env))return json(request,env,{ok:true,tenant:config.apiTenant,live:false,player:null});
    let state='unknown';
    try{state=inputState(await streamCall(env,`/live_inputs/${encodeURIComponent(row.live_input_uid)}`))}catch{state='unknown'}
    const live=state==='connected';
    return json(request,env,{ok:true,tenant:config.apiTenant,live,state,player:live?streamIframeUrl(env,row.live_input_uid):null});
  }

  // ---------- host-only ----------
  if(path==='/api/realtime/captions/sessions'&&request.method==='POST'){
    const host=await requireHost(input?.tenant);if(host.response)return host.response;
    const sourceLang=langCode(input?.sourceLang)||'ko';
    const requested=normalizeTargetLanguages(input?.targetLangs,sourceLang);
    const decision=evaluate({tier:host.access.tier,languages:requested.length});
    const maxLanguages=Number(decision?.limits?.maxLanguages??requested.length);
    const targets=requested.slice(0,Math.max(0,maxLanguages));
    if(!targets.length)return json(request,env,{ok:false,error:'target_language_required',languages:catalog()},400);
    const stamp=nowIso(),tenant=host.config.apiTenant;
    await env.DB.prepare(`UPDATE live_caption_sessions SET status='ended',ended_at=?,updated_at=? WHERE tenant_id=? AND status='active'`).bind(stamp,stamp,tenant).run();
    const room=await env.DB.prepare(`SELECT id FROM realtime_rooms WHERE tenant_id=? AND status='live' ORDER BY updated_at DESC LIMIT 1`).bind(tenant).first().catch(()=>null);
    const id=newId('caps');
    await env.DB.prepare(`INSERT INTO live_caption_sessions(id,tenant_id,room_id,source_lang,target_langs_json,status,created_by,segment_count,translation_failures,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,0,0,?,?)`)
      .bind(id,tenant,room?.id||null,sourceLang,JSON.stringify(targets),host.actor,stamp,stamp).run();
    for(const code of targets){
      await env.DB.prepare(`INSERT OR REPLACE INTO realtime_language_channels(room_id,tenant_id,language_code,status,listener_count,provider_key,last_latency_ms,updated_at) VALUES(?,?,?,'active',0,?,NULL,?)`)
        .bind(room?.id||id,tenant,code,`captions:${LIVE_TRANSLATION_MODEL}`,stamp).run().catch(()=>{});
    }
    await audit(env,tenant,host.actor,'captions.session.start','allowed',{sessionId:id,sourceLang,targets,trimmed:requested.length-targets.length});
    return json(request,env,{ok:true,session:safeSession(await env.DB.prepare('SELECT * FROM live_caption_sessions WHERE id=?').bind(id).first()),trimmedByPlan:requested.length-targets.length},201);
  }
  const segMatch=path.match(/^\/api\/realtime\/captions\/sessions\/([^/]+)\/(segments|end)$/);
  if(segMatch&&request.method==='POST'){
    const session=await env.DB.prepare('SELECT * FROM live_caption_sessions WHERE id=?').bind(decodeURIComponent(segMatch[1])).first();
    if(!session)return json(request,env,{ok:false,error:'caption_session_not_found'},404);
    const host=await requireHost(session.tenant_id);if(host.response)return host.response;
    if(session.status!=='active')return json(request,env,{ok:false,error:'caption_session_ended'},409);
    const stamp=nowIso();
    if(segMatch[2]==='end'){
      await env.DB.prepare(`UPDATE live_caption_sessions SET status='ended',ended_at=?,updated_at=? WHERE id=?`).bind(stamp,stamp,session.id).run();
      await audit(env,session.tenant_id,host.actor,'captions.session.end','allowed',{sessionId:session.id});
      return json(request,env,{ok:true,session:safeSession(await env.DB.prepare('SELECT * FROM live_caption_sessions WHERE id=?').bind(session.id).first())});
    }
    const text=normalizeCaptionText(input?.text);
    if(!text)return json(request,env,{ok:false,error:'caption_text_required'},400);
    const view=safeSession(session);
    const bumped=await env.DB.prepare(`UPDATE live_caption_sessions SET segment_count=segment_count+1,updated_at=? WHERE id=? AND status='active' RETURNING segment_count`).bind(stamp,session.id).first();
    const seq=Number(bumped?.segment_count||0);
    if(!seq)return json(request,env,{ok:false,error:'caption_session_ended'},409);
    const started=Date.now();
    const translations=await translateSegment(env,text,view.sourceLang,view.targetLangs);
    const latency=Date.now()-started;
    const failures=translations.filter(item=>item.status==='failed').length;
    const statements=[env.DB.prepare(`INSERT OR REPLACE INTO live_caption_segments(session_id,seq,lang,text,is_source,translation_status,created_at) VALUES(?,?,?,?,1,'source',?)`).bind(session.id,seq,view.sourceLang,text,stamp)];
    for(const item of translations)statements.push(env.DB.prepare(`INSERT OR REPLACE INTO live_caption_segments(session_id,seq,lang,text,is_source,translation_status,created_at) VALUES(?,?,?,?,0,?,?)`).bind(session.id,seq,item.lang,item.text,item.status,stamp));
    if(failures)statements.push(env.DB.prepare(`UPDATE live_caption_sessions SET translation_failures=translation_failures+? WHERE id=?`).bind(failures,session.id));
    await env.DB.batch(statements);
    for(const item of translations){
      await env.DB.prepare(`UPDATE realtime_language_channels SET last_latency_ms=?,status=?,updated_at=? WHERE room_id=? AND language_code=?`).bind(latency,item.status==='ok'?'active':'degraded',stamp,session.room_id||session.id,item.lang).run().catch(()=>{});
    }
    return json(request,env,{ok:true,seq,latencyMs:latency,source:{lang:view.sourceLang,text},translations:translations.map(item=>({lang:item.lang,text:item.text,status:item.status}))},201);
  }

  if(path==='/api/realtime/simulcast'&&request.method==='GET'){
    const host=await requireHost(url.searchParams.get('tenant'));if(host.response)return host.response;
    const tenant=host.config.apiTenant;
    const row=await env.DB.prepare('SELECT * FROM live_stream_inputs WHERE tenant_id=?').bind(tenant).first();
    const outputs=await env.DB.prepare('SELECT * FROM live_stream_outputs WHERE tenant_id=? ORDER BY created_at').bind(tenant).all();
    const configured=streamConfigured(env);
    let state=row?'unknown':'none',rtmpsUrl='';
    if(row&&configured){try{const result=await streamCall(env,`/live_inputs/${encodeURIComponent(row.live_input_uid)}`);state=inputState(result);rtmpsUrl=clean(result?.rtmps?.url,300)}catch{state='unknown'}}
    return json(request,env,{ok:true,tenant,engine:'cloudflare-stream',configured,
      setup:configured?null:{reason:'stream_not_configured',dashboardUrl:'https://dash.cloudflare.com/?to=/:account/stream',secrets:['STREAM_API_TOKEN'],vars:['STREAM_CUSTOMER_CODE']},
      input:row?{state,rtmpsUrl,createdAt:row.created_at}:null,
      outputs:(outputs.results||[]).map(safeOutput),
      platforms:Object.entries(PLATFORM_RULES).map(([id,rule])=>({id,label:rule.label,defaultUrl:rule.defaultUrl,keyHelpUrl:rule.keyHelp})),
      viewerPlayer:Boolean(row&&streamIframeUrl(env,row.live_input_uid))});
  }
  if(path==='/api/realtime/simulcast/input'&&request.method==='POST'){
    const host=await requireHost(input?.tenant);if(host.response)return host.response;
    if(!streamConfigured(env))return json(request,env,{ok:false,error:'stream_not_configured'},503);
    const tenant=host.config.apiTenant;
    let row=await env.DB.prepare('SELECT * FROM live_stream_inputs WHERE tenant_id=?').bind(tenant).first();
    const existed=Boolean(row);
    try{
      if(!row){
        const created=await streamCall(env,'/live_inputs',{method:'POST',payload:{meta:{name:`ekodi-live:${tenant}`},recording:{mode:'off'}}});
        const uid=clean(created?.uid,64);
        if(!uid)throw Object.assign(new Error('stream_input_uid_missing'),{status:502});
        const stamp=nowIso();
        await env.DB.prepare(`INSERT INTO live_stream_inputs(tenant_id,provider,live_input_uid,created_by,created_at,updated_at) VALUES(?,'cloudflare-stream',?,?,?,?)`).bind(tenant,uid,host.actor,stamp,stamp).run();
        row=await env.DB.prepare('SELECT * FROM live_stream_inputs WHERE tenant_id=?').bind(tenant).first();
        await audit(env,tenant,host.actor,'simulcast.input.create','allowed',{liveInputUid:uid});
      }
      return json(request,env,{ok:true,created:!existed,input:{createdAt:row.created_at}},existed?200:201);
    }catch(error){
      await audit(env,tenant,host.actor,'simulcast.input.create','failed',{error:error.message});
      return json(request,env,{ok:false,error:error.code||'stream_provider_error',message:error.message},error.status||502);
    }
  }
  if(path==='/api/realtime/simulcast/input/reveal'&&request.method==='POST'){
    const host=await requireHost(input?.tenant);if(host.response)return host.response;
    const tenant=host.config.apiTenant;
    const row=await env.DB.prepare('SELECT * FROM live_stream_inputs WHERE tenant_id=?').bind(tenant).first();
    if(!row)return json(request,env,{ok:false,error:'stream_input_not_created'},404);
    try{
      const result=await streamCall(env,`/live_inputs/${encodeURIComponent(row.live_input_uid)}`);
      await audit(env,tenant,host.actor,'simulcast.input.reveal','allowed',{});
      return json(request,env,{ok:true,rtmpsUrl:clean(result?.rtmps?.url,300),streamKey:clean(result?.rtmps?.streamKey,300),warning:'이 키를 아는 사람은 누구나 방송을 보낼 수 있습니다. 공유하지 마세요.'});
    }catch(error){return json(request,env,{ok:false,error:error.code||'stream_provider_error'},error.status||502)}
  }
  if(path==='/api/realtime/simulcast/outputs'&&request.method==='POST'){
    const host=await requireHost(input?.tenant);if(host.response)return host.response;
    const tenant=host.config.apiTenant;
    const check=validateSimulcastDestination(input||{});
    if(!check.ok)return json(request,env,{ok:false,error:check.error},400);
    const row=await env.DB.prepare('SELECT * FROM live_stream_inputs WHERE tenant_id=?').bind(tenant).first();
    if(!row)return json(request,env,{ok:false,error:'stream_input_not_created'},409);
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_stream_outputs WHERE tenant_id=?').bind(tenant).first();
    if(Number(count?.n||0)>=10)return json(request,env,{ok:false,error:'simulcast_destination_limit'},409);
    try{
      const created=await streamCall(env,`/live_inputs/${encodeURIComponent(row.live_input_uid)}/outputs`,{method:'POST',payload:{url:check.url,streamKey:check.streamKey,enabled:true}});
      const outUid=clean(created?.uid,64);
      if(!outUid)throw Object.assign(new Error('stream_output_uid_missing'),{status:502});
      const id=newId('simul'),stamp=nowIso();
      await env.DB.prepare(`INSERT INTO live_stream_outputs(id,tenant_id,live_input_uid,provider_output_uid,platform,label,ingest_host,key_hint,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`)
        .bind(id,tenant,row.live_input_uid,outUid,check.platform,check.label,check.host,check.keyHint,host.actor,stamp,stamp).run();
      await audit(env,tenant,host.actor,'simulcast.output.create','allowed',{platform:check.platform,host:check.host,keyHint:check.keyHint});
      return json(request,env,{ok:true,output:safeOutput(await env.DB.prepare('SELECT * FROM live_stream_outputs WHERE id=?').bind(id).first())},201);
    }catch(error){
      await audit(env,tenant,host.actor,'simulcast.output.create','failed',{platform:check.platform,error:error.message});
      return json(request,env,{ok:false,error:error.code||'stream_provider_error',message:error.message},error.status||502);
    }
  }
  const outMatch=path.match(/^\/api\/realtime\/simulcast\/outputs\/([^/]+)$/);
  if(outMatch&&['POST','DELETE'].includes(request.method)){
    const output=await env.DB.prepare('SELECT * FROM live_stream_outputs WHERE id=?').bind(decodeURIComponent(outMatch[1])).first();
    if(!output)return json(request,env,{ok:false,error:'simulcast_destination_not_found'},404);
    const host=await requireHost(output.tenant_id);if(host.response)return host.response;
    const providerPath=`/live_inputs/${encodeURIComponent(output.live_input_uid)}/outputs/${encodeURIComponent(output.provider_output_uid)}`;
    try{
      if(request.method==='DELETE'){
        await streamCall(env,providerPath,{method:'DELETE'}).catch(error=>{if(Number(error.providerStatus)!==404)throw error});
        await env.DB.prepare('DELETE FROM live_stream_outputs WHERE id=?').bind(output.id).run();
        await audit(env,output.tenant_id,host.actor,'simulcast.output.delete','allowed',{platform:output.platform});
        return json(request,env,{ok:true,deleted:output.id});
      }
      const enabled=input?.enabled!==false;
      await streamCall(env,providerPath,{method:'PUT',payload:{enabled}});
      await env.DB.prepare('UPDATE live_stream_outputs SET enabled=?,updated_at=? WHERE id=?').bind(enabled?1:0,nowIso(),output.id).run();
      await audit(env,output.tenant_id,host.actor,'simulcast.output.toggle','allowed',{platform:output.platform,enabled});
      return json(request,env,{ok:true,output:safeOutput(await env.DB.prepare('SELECT * FROM live_stream_outputs WHERE id=?').bind(output.id).first())});
    }catch(error){return json(request,env,{ok:false,error:error.code||'stream_provider_error',message:error.message},error.status||502)}
  }
  // ---------- EKODI-SIMULCAST-RELAY-001 (EKODI-owned simulcast, no paid service) ----------
  if(path.startsWith('/api/realtime/relay'))return relayRoute({request,env,url,input,json,requireHost,tenantOf});
  return json(request,env,{ok:false,error:'live_addon_endpoint_not_found'},404);
}

const RELAY_ONLINE_MS=3*60*1000;
async function enqueueRelayCommand(env,deviceId,type,payload,actor){
  const id=`cmd_${crypto.randomUUID()}`,stamp=nowIso();
  await env.DB.prepare(`INSERT INTO device_commands (id, device_id, command_type, payload_json, status, issued_at, issued_by) VALUES (?, ?, ?, ?, 'queued', ?, NULL)`)
    .bind(id,deviceId,type,JSON.stringify(payload||{}),stamp).run();
  return id;
}
function relayDeviceView(row){
  if(!row)return null;
  let caps={};try{caps=JSON.parse(row.capabilities_json||'{}')}catch{}
  const seen=Date.parse(String(row.last_seen_at||''));
  return {id:row.id,label:row.label,hostname:row.hostname,agentVersion:row.agent_version,online:Number.isFinite(seen)&&Date.now()-seen<RELAY_ONLINE_MS,lastSeenAt:row.last_seen_at||null,relayCapable:caps?.[SIMULCAST_RELAY_CAPABILITY]===true,revoked:Boolean(row.revoked_at)};
}
async function relayRoute({request,env,url,input,json,requireHost,tenantOf}){
  const path=url.pathname,method=request.method;
  const tenantValue=method==='GET'?url.searchParams.get('tenant'):input?.tenant;
  if(path==='/api/realtime/relay/devices'&&method==='GET'){
    const host=await requireHost(tenantValue);if(host.response)return host.response;
    if(host.access.identity?.platformAdminRole!=='super_admin')return json(request,env,{ok:false,error:'relay_binding_super_admin_required'},403);
    const rows=await env.DB.prepare(`SELECT id,label,hostname,agent_version,capabilities_json,last_seen_at,revoked_at FROM device_registry WHERE revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 50`).all().catch(()=>({results:[]}));
    return json(request,env,{ok:true,devices:(rows.results||[]).map(relayDeviceView)});
  }
  const host=await requireHost(tenantValue);if(host.response)return host.response;
  const tenant=host.config.apiTenant,actor=host.actor;
  const binding=await env.DB.prepare('SELECT * FROM live_relay_bindings WHERE tenant_id=?').bind(tenant).first();
  const device=binding?await env.DB.prepare('SELECT id,label,hostname,agent_version,capabilities_json,last_seen_at,revoked_at FROM device_registry WHERE id=?').bind(binding.device_id).first():null;
  const audit=(action,outcome,detail)=>env.DB.prepare(`INSERT INTO realtime_audit_log(id,tenant_id,room_id,actor_user_id,action,outcome,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(newId('audit'),tenant,null,actor||null,action,outcome,JSON.stringify(detail||{}).slice(0,2000),nowIso()).run().catch(()=>{});
  if(path==='/api/realtime/relay'&&method==='GET'){
    const dests=await env.DB.prepare('SELECT id,label,preset,ingest_host,key_hint,enabled,created_at FROM live_relay_destinations WHERE tenant_id=? ORDER BY created_at').bind(tenant).all();
    let last=null,pending=0;
    if(binding){
      const row=await env.DB.prepare(`SELECT command_type,status,completed_at,result_json FROM device_commands WHERE device_id=? AND command_type LIKE 'simulcast.relay.%' AND status IN ('completed','failed') ORDER BY completed_at DESC LIMIT 1`).bind(binding.device_id).first().catch(()=>null);
      if(row){let r={};try{r=JSON.parse(row.result_json||'{}')}catch{}last={command:row.command_type,status:row.status,at:row.completed_at,relay:summarizeSimulcastRelayResult(r?.simulcastRelay||r?.result?.simulcastRelay||r),message:clean(r?.message||r?.result?.message||'',300)}}
      const q=await env.DB.prepare(`SELECT COUNT(*) AS n FROM device_commands WHERE device_id=? AND command_type LIKE 'simulcast.relay.%' AND status IN ('queued','claimed')`).bind(binding.device_id).first().catch(()=>null);pending=Number(q?.n||0);
    }
    return json(request,env,{ok:true,policy:SIMULCAST_RELAY_POLICY_ID,engine:'ekodi-device-relay',tenant,
      binding:binding?{deviceId:binding.device_id,armed:Boolean(binding.armed),boundAt:binding.bound_at,device:relayDeviceView(device)}:null,
      canBind:host.access.identity?.platformAdminRole==='super_admin',
      ingest:{server:SIMULCAST_RELAY_INGEST.url,streamKey:SIMULCAST_RELAY_INGEST.streamKey,full:SIMULCAST_RELAY_INGEST.full,note:'방송 PC의 OBS 설정 → 방송 → 서비스: 사용자 지정, 서버와 스트림 키를 입력합니다.'},
      ffmpeg:{version:SIMULCAST_RELAY_FFMPEG.version},
      destinations:(dests.results||[]).map(d=>({id:d.id,label:d.label,preset:d.preset,ingestHost:d.ingest_host,keyHint:d.key_hint,enabled:Boolean(d.enabled),createdAt:d.created_at})),
      platforms:Object.entries(PLATFORM_RULES).map(([id,rule])=>({id,label:rule.label,defaultUrl:rule.defaultUrl,keyHelpUrl:rule.keyHelp})),
      lastResult:last,pendingCommands:pending});
  }
  if(path==='/api/realtime/relay/bind'&&method==='POST'){
    if(host.access.identity?.platformAdminRole!=='super_admin')return json(request,env,{ok:false,error:'relay_binding_super_admin_required'},403);
    const deviceId=clean(input?.deviceId,80);
    const row=await env.DB.prepare('SELECT id,revoked_at FROM device_registry WHERE id=?').bind(deviceId).first().catch(()=>null);
    if(!row||row.revoked_at)return json(request,env,{ok:false,error:'relay_device_not_found'},404);
    const stamp=nowIso();
    await env.DB.prepare(`INSERT INTO live_relay_bindings(tenant_id,device_id,bound_by,bound_at,armed,updated_at) VALUES(?,?,?,?,0,?) ON CONFLICT(tenant_id) DO UPDATE SET device_id=excluded.device_id,bound_by=excluded.bound_by,bound_at=excluded.bound_at,armed=0,updated_at=excluded.updated_at`).bind(tenant,deviceId,actor,stamp,stamp).run();
    await audit('relay.bind','allowed',{deviceId});
    return json(request,env,{ok:true,binding:{deviceId}});
  }
  if(!binding)return json(request,env,{ok:false,error:'relay_device_not_bound'},409);
  const enqueue=async(type,payload,detail)=>{const id=await enqueueRelayCommand(env,binding.device_id,type,payload,actor);await audit(type,'allowed',{commandId:id,...(detail||{})});return id};
  if(path==='/api/realtime/relay/install'&&method==='POST'){
    return json(request,env,{ok:true,commandId:await enqueue(SIMULCAST_RELAY_COMMANDS.install,{})},202);
  }
  if(path==='/api/realtime/relay/status'&&method==='POST'){
    return json(request,env,{ok:true,commandId:await enqueue(SIMULCAST_RELAY_COMMANDS.status,{})},202);
  }
  if((path==='/api/realtime/relay/arm'||path==='/api/realtime/relay/disarm')&&method==='POST'){
    const arm=path.endsWith('/arm');
    const commandId=await enqueue(SIMULCAST_RELAY_COMMANDS.configure,sanitizeSimulcastRelayPayload({op:arm?'arm':'disarm'}));
    await env.DB.prepare('UPDATE live_relay_bindings SET armed=?,updated_at=? WHERE tenant_id=?').bind(arm?1:0,nowIso(),tenant).run();
    return json(request,env,{ok:true,armed:arm,commandId},202);
  }
  if(path==='/api/realtime/relay/destinations'&&method==='POST'){
    const check=validateSimulcastDestination(input||{});
    if(!check.ok)return json(request,env,{ok:false,error:check.error},400);
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_relay_destinations WHERE tenant_id=?').bind(tenant).first();
    if(Number(count?.n||0)>=SIMULCAST_RELAY_MAX_DESTINATIONS)return json(request,env,{ok:false,error:'simulcast_destination_limit'},409);
    const id=`relay_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`;
    // The tee muxer needs one URL per destination: base ingest URL + '/' + key.
    let payload;
    try{payload=sanitizeSimulcastRelayPayload({op:'add',destination:{id,label:check.label,url:check.url,key:check.streamKey}})}catch(error){return json(request,env,{ok:false,error:'invalid_stream_key'},400)}
    const commandId=await enqueue(SIMULCAST_RELAY_COMMANDS.configure,payload,{destinationId:id,host:check.host,keyHint:check.keyHint});
    const stamp=nowIso();
    await env.DB.prepare(`INSERT INTO live_relay_destinations(id,tenant_id,device_id,label,preset,ingest_host,key_hint,enabled,command_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?,?)`).bind(id,tenant,binding.device_id,check.label,check.preset||check.platform,check.host,check.keyHint,commandId,actor,stamp,stamp).run();
    return json(request,env,{ok:true,destination:{id,label:check.label,preset:check.preset||check.platform,ingestHost:check.host,keyHint:check.keyHint,enabled:true},commandId},201);
  }
  const dm=path.match(/^\/api\/realtime\/relay\/destinations\/(relay_[a-f0-9]{16,40})$/);
  if(dm&&['POST','DELETE'].includes(method)){
    const row=await env.DB.prepare('SELECT * FROM live_relay_destinations WHERE id=? AND tenant_id=?').bind(dm[1],tenant).first();
    if(!row)return json(request,env,{ok:false,error:'simulcast_destination_not_found'},404);
    if(method==='DELETE'){
      const commandId=await enqueue(SIMULCAST_RELAY_COMMANDS.configure,sanitizeSimulcastRelayPayload({op:'remove',destinationId:row.id}));
      await env.DB.prepare('DELETE FROM live_relay_destinations WHERE id=?').bind(row.id).run();
      return json(request,env,{ok:true,deleted:row.id,commandId});
    }
    const enabled=input?.enabled!==false;
    const commandId=await enqueue(SIMULCAST_RELAY_COMMANDS.configure,sanitizeSimulcastRelayPayload({op:enabled?'enable':'disable',destinationId:row.id}));
    await env.DB.prepare('UPDATE live_relay_destinations SET enabled=?,updated_at=? WHERE id=?').bind(enabled?1:0,nowIso(),row.id).run();
    return json(request,env,{ok:true,enabled,commandId});
  }
  return json(request,env,{ok:false,error:'relay_endpoint_not_found'},404);
}
