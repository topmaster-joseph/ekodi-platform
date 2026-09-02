const TARGETS=new Map([
  ['ko-KR','ko'],['en','en'],['zh-CN','zh'],['ja','ja'],['my','my'],['kac','kac'],['vi','vi'],['mn','mn'],['id','id']
]);
const M2M_MODEL='@cf/meta/m2m100-1.2b';
const FALLBACK_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const TARGET_LABELS=Object.freeze({'en':'English','zh-CN':'Simplified Chinese','ja':'Japanese','my':'Burmese (Myanmar)','kac':'Jinghpaw (Kachin)','vi':'Vietnamese','mn':'Mongolian','id':'Indonesian'});
function json(data,status=200,cache='no-store'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,'access-control-allow-origin':'*','x-content-type-options':'nosniff'}});}
function originAllowed(request){
  const origin=String(request.headers.get('origin')||'').trim();
  if(!origin)return true;
  try{const host=new URL(origin).hostname.toLowerCase();return host==='ekodi.kr'||host==='www.ekodi.kr'||host.endsWith('.ekodi.kr')||host.endsWith('.workers.dev');}catch{return false;}
}
async function translationRateLimit(request,env){
  if(!env.TRANSLATION_RATE_LIMITER?.limit)return {available:false,allowed:false};
  try{
    const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
    const key=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const result=await env.TRANSLATION_RATE_LIMITER.limit({key});
    return {available:true,allowed:result?.success!==false};
  }catch(error){console.error('EKODI translation rate limiter unavailable',error);return {available:false,allowed:false};}
}
function normalizeBody(body){
  const source=String(body?.source||'ko-KR');
  const target=String(body?.target||'');
  const surface=String(body?.surface||'public').toLowerCase()==='workspace'?'workspace':'public';
  const texts=Array.isArray(body?.texts)?body.texts.map(v=>String(v||'').replace(/\s+/g,' ').trim()).filter(Boolean):[];
  if(!TARGETS.has(source)||!TARGETS.has(target))throw new Error('unsupported_locale');
  if(!texts.length||texts.length>24)throw new Error('invalid_text_count');
  if(texts.some(text=>text.length>600)||texts.join('').length>8000)throw new Error('payload_too_large');
  return {source,target,surface,texts};
}
async function cacheKey(payload){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const hex=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  return new Request(`https://shell.ekodi.kr/__translation-cache/${hex}`);
}
async function translateWithFallback(env,text,target){
  const language=TARGET_LABELS[target]||target;
  const prompt=`Translate the following Korean website UI text into natural ${language}. Preserve meaning, numbers and brand names. Return only the translation, with no explanation.\n\n${text}`;
  const result=await env.AI.run(FALLBACK_MODEL,{prompt,max_tokens:700,temperature:0.1});
  return String(result?.response||result?.result||'').trim()||text;
}
async function translateOne(env,text,source,target){
  if(target==='ko-KR')return text;
  if(target==='kac')return translateWithFallback(env,text,target);
  try{
    const result=await env.AI.run(M2M_MODEL,{text,source_lang:TARGETS.get(source),target_lang:TARGETS.get(target)});
    const translated=String(result?.translated_text||result?.translation||result?.response||'').trim();
    if(translated&&translated!==text)return translated;
    return await translateWithFallback(env,text,target);
  }catch(error){
    console.warn('EKODI translation model fallback',target,error?.message||error);
    return await translateWithFallback(env,text,target);
  }
}
async function translateTexts(env,payload){
  const translations=[];
  for(let i=0;i<payload.texts.length;i+=6){
    const chunk=payload.texts.slice(i,i+6);
    const done=await Promise.all(chunk.map(text=>translateOne(env,text,payload.source,payload.target)));
    translations.push(...done);
  }
  return translations;
}
export async function handleUserTranslation(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400'}});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!originAllowed(request))return json({error:'origin_not_allowed'},403);
  const rate=await translationRateLimit(request,env);
  if(!rate.available)return json({error:'translation_rate_limiter_unavailable'},503);
  if(!rate.allowed)return json({error:'translation_rate_limited'},429);
  if(!env.AI)return json({error:'translation_unavailable'},503);
  let payload;
  try{payload=normalizeBody(await request.json());}catch(error){return json({error:error?.message||'invalid_request'},400);}
  if(payload.target==='ko-KR')return json({translations:payload.texts,source:payload.source,target:payload.target,provider:'identity'},200,'public, max-age=86400');
  const key=payload.surface==='public'?await cacheKey(payload):null;
  if(key){
    const hit=await caches.default.match(key);
    if(hit)return json(await hit.json(),200,'public, max-age=86400, stale-while-revalidate=604800');
  }
  const translations=await translateTexts(env,payload);
  const body={translations,source:payload.source,target:payload.target,provider:'workers-ai',surface:payload.surface};
  if(key){
    const cached=json(body,200,'public, max-age=86400, stale-while-revalidate=604800');
    await caches.default.put(key,cached.clone());
  }
  return json(body,200,payload.surface==='public'?'public, max-age=86400, stale-while-revalidate=604800':'private, no-store');
}
export const USER_TRANSLATION_CONTRACT=Object.freeze({version:1,source:'ko-KR',targets:[...TARGETS.keys()],publicCache:true,workspaceCache:false,maxTexts:24,maxTextLength:600,maxPayloadCharacters:8000});
