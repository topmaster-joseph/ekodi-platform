import { durableWriteQueueAvailable, enqueueDurableWrite } from './write-ingress.js';
import { createBoardAdapter, handleBoardAdapter, consumeBoardAdapter } from './common-board-adapter.js';
import { createBoardRuntimeGuard } from './board-runtime-guard.js';

const API_PATH='/api/seonammedi/voices';
const HEALTH_PATH=API_PATH+'/health';
const REPLY_PATH=/^\/api\/seonammedi\/voices\/(\d+)\/replies$/;
const SUBMISSION_PATH=/^\/api\/seonammedi\/voices\/submissions\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const QUEUE_KIND='seonammedi.citizen_voice.v1';
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const json=(body,status=200,extraHeaders={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extraHeaders}});

async function fingerprint(request){
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  const bytes=new TextEncoder().encode(ip);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function ensureSubmissionKey(db){
  try{await db.prepare('SELECT submission_key FROM seonammedi_civic_voices LIMIT 0').all()}
  catch{await db.prepare("ALTER TABLE seonammedi_civic_voices ADD COLUMN submission_key TEXT NOT NULL DEFAULT ''").run()}
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_submission ON seonammedi_civic_voices(submission_key) WHERE submission_key<>''").run();
}

async function ensureSchema(db){
  const canonical=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seonammedi_civic_voices'").first().catch(()=>null);
  if(!canonical?.name){
    const legacy=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seonam_med_civic_voices'").first().catch(()=>null);
    await db.exec(`CREATE TABLE IF NOT EXISTS seonammedi_civic_voices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      public_consent INTEGER NOT NULL DEFAULT 0,
      privacy_consent INTEGER NOT NULL DEFAULT 1,
      review_status TEXT NOT NULL DEFAULT 'received',
      request_fingerprint TEXT NOT NULL DEFAULT '',
      submission_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_created ON seonammedi_civic_voices(created_at);
    CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_review ON seonammedi_civic_voices(review_status,created_at);`);
    if(legacy?.name)await db.exec(`INSERT OR IGNORE INTO seonammedi_civic_voices
      (id,category,display_name,contact,message,public_consent,privacy_consent,review_status,request_fingerprint,created_at,updated_at)
      SELECT id,category,display_name,contact,message,public_consent,privacy_consent,review_status,request_fingerprint,created_at,updated_at
      FROM seonam_med_civic_voices;`);
  }
  await ensureSubmissionKey(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS seonammedi_civic_voice_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id INTEGER NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (voice_id) REFERENCES seonammedi_civic_voices(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_civic_voice_replies_voice ON seonammedi_civic_voice_replies(voice_id,id);`);
}

async function health(env){
  if(!env?.DB?.prepare)return json({ok:false,storage:'unavailable',canonicalTable:false,legacyTable:false,queue:durableWriteQueueAvailable(env)?'ready':'unavailable'},503);
  try{
    // Health probes must remain read-only. Production schema is provisioned by
    // migrations before Worker promotion; request-time DDL can contend with D1
    // during a versioned 0% candidate gate and produce a false deployment failure.
    const canonical=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seonammedi_civic_voices'").first();
    const legacy=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seonam_med_civic_voices'").first().catch(()=>null);
    const submissionKey=canonical?.name
      ? await env.DB.prepare("SELECT submission_key FROM seonammedi_civic_voices LIMIT 0").all().then(()=>true).catch(()=>false)
      : false;
    const ok=Boolean(canonical?.name&&submissionKey);
    return json({ok,storage:'d1',canonicalTable:Boolean(canonical?.name),legacyTable:Boolean(legacy?.name),submissionKey,queue:durableWriteQueueAvailable(env)?'ready':'unavailable'},ok?200:503);
  }catch(error){
    console.error('seonammedi civic health failed',error);
    return json({ok:false,storage:'error',canonicalTable:false,legacyTable:false,submissionKey:false,queue:durableWriteQueueAvailable(env)?'ready':'unavailable'},503);
  }
}

async function applyIngressRateLimit(env,key){
  const limiter=env?.PLATFORM_PUBLIC_WRITE_RATE_LIMITER;
  if(!limiter||typeof limiter.limit!=='function')return {success:true};
  try{return await limiter.limit({key:'seonammedi:voice:'+key})}catch(error){
    console.error('seonammedi voice rate limiter unavailable',error);
    return {success:true};
  }
}

async function persistVoice(env,payload){
  if(!env?.DB?.prepare)throw new Error('storage_unavailable');
  await ensureSchema(env.DB);
  const existing=await env.DB.prepare('SELECT id FROM seonammedi_civic_voices WHERE submission_key=? LIMIT 1').bind(payload.submissionId).first().catch(()=>null);
  if(existing?.id)return Number(existing.id);
  const now=payload.acceptedAt||new Date().toISOString();
  const result=await env.DB.prepare(`INSERT INTO seonammedi_civic_voices
    (category,display_name,contact,message,public_consent,privacy_consent,review_status,request_fingerprint,submission_key,created_at,updated_at)
    VALUES (?,?,?,?,1,1,'published',?,?,?,?)`)
    .bind(payload.category,payload.displayName,payload.contact,payload.message,payload.requestFingerprint,payload.submissionId,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);
  if(id)return id;
  const duplicate=await env.DB.prepare('SELECT id FROM seonammedi_civic_voices WHERE submission_key=? LIMIT 1').bind(payload.submissionId).first();
  if(duplicate?.id)return Number(duplicate.id);
  throw new Error('voice_insert_not_confirmed');
}


async function submissionStatus(env,submissionId){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  try{
    const row=await env.DB.prepare("SELECT id,review_status FROM seonammedi_civic_voices WHERE submission_key=? LIMIT 1").bind(submissionId).first();
    if(!row?.id)return json({ok:true,status:'pending',submissionId});
    return json({ok:true,status:row.review_status==='published'?'published':'processing',submissionId,id:Number(row.id)});
  }catch(error){
    console.error('seonammedi submission status failed',error);
    return json({ok:false,error:'status_lookup_failed'},503);
  }
}

async function listPublicVoices(env){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  // Public reads are deliberately read-only. Schema is provisioned by migrations;
  // request-time DDL can contend with D1 and make the list fail while health is green.
  const voices=await env.DB.prepare(`SELECT id,category,display_name,message,created_at,updated_at
    FROM seonammedi_civic_voices WHERE review_status='published' ORDER BY id DESC LIMIT 100`).all();
  const replies=await env.DB.prepare(`SELECT r.id,r.voice_id,r.display_name,r.message,r.created_at
    FROM seonammedi_civic_voice_replies r
    JOIN seonammedi_civic_voices v ON v.id=r.voice_id
    WHERE v.review_status='published'
    ORDER BY r.id ASC LIMIT 1000`).all();
  const byVoice=new Map();
  for(const row of replies.results||[]){
    const key=Number(row.voice_id);if(!byVoice.has(key))byVoice.set(key,[]);
    byVoice.get(key).push({id:Number(row.id),displayName:row.display_name||'익명',message:row.message||'',createdAt:row.created_at});
  }
  return json({ok:true,items:(voices.results||[]).map(row=>({id:Number(row.id),category:row.category,displayName:row.display_name||'익명',message:row.message||'',createdAt:row.created_at,updatedAt:row.updated_at,replies:byVoice.get(Number(row.id))||[]}))});
}

async function createPublicReply(request,env,voiceId){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',message:'저장소를 사용할 수 없습니다.'},503);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>8192)return json({ok:false,error:'payload_too_large'},413);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(clean(body?.website,200))return json({ok:false,error:'spam_trap_triggered',message:'입력값을 다시 확인해 주세요.'},400);
  const displayName=clean(body?.name,80);
  const message=clean(body?.message,1500);
  if(!message)return json({ok:false,error:'invalid_message',message:'답글 내용을 입력해 주세요.'},400);
  const voice=await env.DB.prepare("SELECT id FROM seonammedi_civic_voices WHERE id=? AND review_status='published'").bind(voiceId).first();
  if(!voice?.id)return json({ok:false,error:'voice_not_found'},404);
  const requestFingerprint=await fingerprint(request);
  const limited=await applyIngressRateLimit(env,'reply:'+requestFingerprint);
  if(limited?.success===false)return json({ok:false,error:'rate_limited',message:'등록이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'30'});
  const now=new Date().toISOString();
  const result=await env.DB.prepare('INSERT INTO seonammedi_civic_voice_replies (voice_id,display_name,message,request_fingerprint,created_at) VALUES (?,?,?,?,?)')
    .bind(voiceId,displayName,message,requestFingerprint,now).run();
  return json({ok:true,id:Number(result?.meta?.last_row_id||0),message:'답글이 등록되었습니다.'},201);
}

function originAllowed(request,env){
  if(env?.ENVIRONMENT!=='production')return true;
  const origin=request.headers.get('origin')||'';
  return new Set(['https://ekodi.kr','https://seonammedi.kr','https://www.seonammedi.kr','https://xn--3e0b8b58jw4co4mnpll3k.kr','https://www.xn--3e0b8b58jw4co4mnpll3k.kr']).has(origin);
}

async function consumeVoice(envelope,env){
  if(!envelope||envelope.kind!==QUEUE_KIND)return false;
  const payload=envelope.payload||{};
  if(!payload.submissionId||!payload.message||!CATEGORIES.has(payload.category))throw new Error('invalid_seonammedi_voice_queue_message');
  await persistVoice(env,payload);
  return true;
}

async function createPublicVoice(request,env){
  if(!originAllowed(request,env))return json({ok:false,error:'origin_not_allowed'},403);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>16384)return json({ok:false,error:'payload_too_large'},413);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(clean(body?.website,200))return json({ok:false,error:'spam_trap_triggered',message:'입력값을 다시 확인해 주세요.'},400);

  const category=clean(body?.category||'other',24).toLowerCase();
  const displayName=clean(body?.name,80);
  const contact=clean(body?.contact,160);
  const message=clean(body?.message,3000);
  if(!CATEGORIES.has(category))return json({ok:false,error:'invalid_category',message:'의견 유형을 확인해 주세요.'},400);
  if(!message)return json({ok:false,error:'invalid_message',message:'의견 내용을 입력해 주세요.'},400);
  if(body?.privacyConsent!==true)return json({ok:false,error:'privacy_consent_required',message:'개인정보 처리 동의가 필요합니다.'},400);

  const requestFingerprint=await fingerprint(request);
  const limited=await applyIngressRateLimit(env,requestFingerprint);
  if(limited?.success===false)return json({ok:false,error:'rate_limited',message:'등록이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'30'});
  const submissionId=crypto.randomUUID();
  const acceptedAt=new Date().toISOString();
  const payload={submissionId,category,displayName,contact,message,publicConsent:true,requestFingerprint,acceptedAt};

  try{
    if(durableWriteQueueAvailable(env)){
      const queued=await enqueueDurableWrite(env,{kind:QUEUE_KIND,workspaceId:'seonammedi',idempotencyKey:submissionId,payload,acceptedAt});
      if(!queued.ok)throw new Error(queued.error||'queue_rejected');
      return json({ok:true,queued:true,submissionId,message:'시민의견이 등록되었습니다. 저장 처리되는 즉시 공개됩니다.'},202);
    }
    if(env?.ENVIRONMENT!=='production'&&env?.DB?.prepare){
      const id=await persistVoice(env,payload);
      return json({ok:true,queued:false,id,submissionId,message:'시민의견이 등록되어 바로 게시되었습니다.'},201);
    }
    return json({ok:false,error:'durable_queue_unavailable',message:'등록 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'5'});
  }catch(error){
    console.error('seonammedi civic durable ingress failed',error);
    return json({ok:false,error:'write_ingress_failed',message:'등록이 많습니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'5'});
  }
}

const citizenVoiceAdapter=createBoardAdapter({
  boardId:'seonammedi.citizen_voice',
  list:(_request,env)=>listPublicVoices(env),
  create:createPublicVoice,
  reply:createPublicReply,
  health:(_request,env)=>health(env),
  consume:consumeVoice
});
const citizenVoiceBoard=createBoardRuntimeGuard({adapter:citizenVoiceAdapter});

export async function consumeSeonamMediVoiceMessage(envelope,env){
  // Standalone board persistence is canonical after cutover. Treat queued
  // legacy citizen-opinion envelopes as handled without writing them again.
  if(envelope?.kind===QUEUE_KIND)return true;
  return false;
}

function retiredCivicResponse(){
  return json({ok:false,error:'legacy_citizen_voice_retired',location:'/board/voices'},410,{
    link:'</board/voices>; rel="successor-version"'
  });
}

export async function handleSeonamMediCivicApi(request,env){
  const url=new URL(request.url);
  if(url.pathname===HEALTH_PATH&&request.method==='GET'){
    return json({ok:true,retired:true,location:'/board/voices',queueDrain:'ack-drop'},200,{
      link:'</board/voices>; rel="successor-version"'
    });
  }
  if(url.pathname===API_PATH||REPLY_PATH.test(url.pathname)||SUBMISSION_PATH.test(url.pathname)){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'GET, POST, OPTIONS','cache-control':'no-store',link:'</board/voices>; rel="successor-version"'}});
    return retiredCivicResponse();
  }
  return null;
}
export const SEONAMMEDI_VOICE_QUEUE_KIND=QUEUE_KIND;
