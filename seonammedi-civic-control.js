import { listSiteBoardPostsWithComments, createSiteBoardPost, createSiteBoardComment } from './site-board-control.js';
import { createBoardAdapter, handleBoardAdapter } from './common-board-adapter.js';
import { createBoardRuntimeGuard } from './board-runtime-guard.js';

const API_PATH='/api/seonammedi/voices';
const HEALTH_PATH=API_PATH+'/health';
const REPLY_PATH=/^\/api\/seonammedi\/voices\/(\d+)\/replies$/;
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const json=(body,status=200,extraHeaders={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extraHeaders}});

async function fingerprint(request){
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  const bytes=new TextEncoder().encode(ip);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
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

async function listPublicVoices(env){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  const posts=await listSiteBoardPostsWithComments(env,'seonammedi');
  return json({ok:true,storage:'site-board',items:posts.map(post=>({
    id:Number(post.id),
    category:post.categoryId||'other',
    displayName:post.title||'익명',
    message:post.body||'',
    createdAt:post.createdAt,
    updatedAt:post.updatedAt,
    replies:(post.comments||[]).map(reply=>({id:Number(reply.id),displayName:'익명',message:reply.body||'',createdAt:reply.createdAt}))
  }))});
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
  const requestFingerprint=await fingerprint(request);
  const limited=await applyIngressRateLimit(env,'reply:'+requestFingerprint);
  if(limited?.success===false)return json({ok:false,error:'rate_limited',message:'등록이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'30'});
  try{
    const id=await createSiteBoardComment(env,'seonammedi',voiceId,{body:message});
    return json({ok:true,id,message:'답글이 등록되었습니다.'},201);
  }catch(error){
    if(String(error?.message||error)==='post_not_found')return json({ok:false,error:'voice_not_found'},404);
    console.error('seonammedi board reply failed',error);
    return json({ok:false,error:'board_write_failed',message:'답글 저장에 실패했습니다.'},503);
  }
}

function originAllowed(request,env){
  if(env?.ENVIRONMENT!=='production')return true;
  const origin=request.headers.get('origin')||'';
  return new Set(['https://ekodi.kr','https://seonammedi.kr','https://www.seonammedi.kr','https://xn--3e0b8b58jw4co4mnpll3k.kr','https://www.xn--3e0b8b58jw4co4mnpll3k.kr']).has(origin);
}

async function createPublicVoice(request,env){
  if(!originAllowed(request,env))return json({ok:false,error:'origin_not_allowed'},403);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>16384)return json({ok:false,error:'payload_too_large'},413);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(clean(body?.website,200))return json({ok:false,error:'spam_trap_triggered',message:'입력값을 다시 확인해 주세요.'},400);

  const category=clean(body?.category||'other',24).toLowerCase();
  const displayName=clean(body?.name,80);
  const message=clean(body?.message,3000);
  if(!CATEGORIES.has(category))return json({ok:false,error:'invalid_category',message:'의견 유형을 확인해 주세요.'},400);
  if(!message)return json({ok:false,error:'invalid_message',message:'의견 내용을 입력해 주세요.'},400);
  if(body?.privacyConsent!==true)return json({ok:false,error:'privacy_consent_required',message:'개인정보 처리 동의가 필요합니다.'},400);

  const requestFingerprint=await fingerprint(request);
  const limited=await applyIngressRateLimit(env,requestFingerprint);
  if(limited?.success===false)return json({ok:false,error:'rate_limited',message:'등록이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'30'});
  try{
    const id=await createSiteBoardPost(env,'seonammedi',{title:displayName||'익명',body:message,categoryId:category});
    return json({ok:true,queued:false,id,storage:'site-board',message:'시민의견이 등록되어 바로 게시되었습니다.'},201);
  }catch(error){
    console.error('seonammedi independent board write failed',error);
    return json({ok:false,error:'board_write_failed',message:'게시판 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'5'});
  }
}

const citizenVoiceAdapter=createBoardAdapter({
  boardId:'seonammedi.citizen_voice',
  list:(_request,env)=>listPublicVoices(env),
  create:createPublicVoice,
  reply:createPublicReply,
  health:(_request,env)=>health(env)
});
const citizenVoiceBoard=createBoardRuntimeGuard({adapter:citizenVoiceAdapter});

export async function consumeSeonamMediVoiceMessage(){
  // Legacy queue messages are intentionally ignored after the site-board cutover.
  return false;
}

export async function handleSeonamMediCivicApi(request,env){
  const url=new URL(request.url);
  if(url.pathname===HEALTH_PATH&&request.method==='GET')return handleBoardAdapter(citizenVoiceBoard,{action:'health',request,env});
  const replyMatch=url.pathname.match(REPLY_PATH);
  if(replyMatch){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}});
    if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    return handleBoardAdapter(citizenVoiceBoard,{action:'reply',request,env,itemId:replyMatch[1]});
  }
  if(url.pathname!==API_PATH)return null;
  if(request.method==='GET')return handleBoardAdapter(citizenVoiceBoard,{action:'list',request,env});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'GET, POST, OPTIONS','cache-control':'no-store'}});
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  return handleBoardAdapter(citizenVoiceBoard,{action:'create',request,env});
}
export const SEONAMMEDI_VOICE_QUEUE_KIND='';
