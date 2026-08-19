import { runAiEnhancedTask } from './ai-resilience-runtime.js';
import { buildChannelEnvelope, dispatchChannelEnvelope } from './messenger-channel-adapters.js';
import { freeAssistReply } from './messenger-triage.js';

const clean=(value,max=8000)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const safeJson=value=>{try{return JSON.stringify(value??{})}catch{return '{}'}};
const safeParse=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};

export async function enqueueMessengerOutbox(env,{threadId,messageId=null,eventType,consumer='assistant',payload={},idempotencyKey}={}){
  if(!env?.DB||!Number(threadId)||!clean(eventType,120)||!clean(idempotencyKey,240))return null;
  const now=nowIso();
  await env.DB.prepare(`INSERT OR IGNORE INTO messenger_outbox(idempotency_key,thread_id,message_id,event_type,consumer,payload_json,status,attempts,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',0,?,?,?)`)
    .bind(clean(idempotencyKey,240),Number(threadId),Number(messageId)||null,clean(eventType,120),clean(consumer,80),safeJson(payload),now,now,now).run();
  return env.DB.prepare('SELECT id,status,consumer,event_type FROM messenger_outbox WHERE idempotency_key=?').bind(clean(idempotencyKey,240)).first();
}

function aiProviders(env,context){
  const providers=[];
  if(env.MESSENGER_AI&&typeof env.MESSENGER_AI.fetch==='function')providers.push({id:'messenger_ai_binding',invoke:async()=>{
    const response=await env.MESSENGER_AI.fetch('https://ekodi.internal/messenger/respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(context)});
    if(!response.ok)throw new Error('MESSENGER_AI_BINDING_FAILED');const data=await response.json();const reply=clean(data?.reply||data?.message);if(!reply)throw new Error('MESSENGER_AI_EMPTY_REPLY');return {reply};
  }});
  const endpoint=clean(env.MESSENGER_AI_URL,2048);
  if(endpoint){let url;try{url=new URL(endpoint)}catch{url=null}if(url?.protocol==='https:')providers.push({id:'messenger_ai_http',invoke:async()=>{
    const response=await fetch(url.href,{method:'POST',headers:{'content-type':'application/json',...(env.MESSENGER_AI_TOKEN?{authorization:`Bearer ${env.MESSENGER_AI_TOKEN}`}:{})},body:JSON.stringify(context),signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw new Error('MESSENGER_AI_HTTP_FAILED');const data=await response.json();const reply=clean(data?.reply||data?.message);if(!reply)throw new Error('MESSENGER_AI_EMPTY_REPLY');return {reply};
  }})}
  return providers;
}

async function processAssistant(env,row,payload){
  const handoff=await env.DB.prepare(`SELECT id,status,assigned_to_user_id FROM messenger_handoffs WHERE thread_id=? AND status IN ('requested','accepted') ORDER BY id DESC LIMIT 1`).bind(row.thread_id).first();
  if(handoff?.status==='accepted')return {ok:true,result:{suppressed:true,reason:'human_operator_active',handoffId:handoff.id}};
  const thread=await env.DB.prepare(`SELECT id,target_service,subject_type,subject_key FROM messenger_threads WHERE id=?`).bind(row.thread_id).first();
  if(!thread)return {ok:true,result:{suppressed:true,reason:'thread_missing'}};
  const sourceMessage=row.message_id?await env.DB.prepare(`SELECT id,body FROM messenger_messages WHERE id=? AND thread_id=?`).bind(row.message_id,row.thread_id).first():null;
  const message=clean(payload.message||sourceMessage?.body);
  if(!message)return {ok:true,result:{suppressed:true,reason:'message_missing'}};
  const triage=payload.triage&&typeof payload.triage==='object'?payload.triage:{};
  const context={threadId:row.thread_id,subject:{type:thread.subject_type,key:thread.subject_key},targetService:thread.target_service||'',message,triage};
  const result=await runAiEnhancedTask({env,providers:aiProviders(env,context),taskName:'messenger_reply',timeoutMs:4000,fallback:async()=>({reply:freeAssistReply(triage)})});
  const reply=clean(result.value?.reply||freeAssistReply(triage));const now=nowIso();const authorKind=result.mode==='ai'?'ai':'agent';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(row.thread_id,'ekodi-assistant',authorKind,reply,safeJson({mode:result.mode,degraded:Boolean(result.degraded),provider:result.provider||null,priority:triage.priority||'normal',triage}),now),
    env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`).bind(row.thread_id,'assistant.reply',authorKind,'ekodi-assistant',safeJson({mode:result.mode,degraded:Boolean(result.degraded),priority:triage.priority||'normal',requiresHuman:Boolean(triage.requiresHuman)}),now),
    env.DB.prepare(`UPDATE messenger_threads SET updated_at=? WHERE id=?`).bind(now,row.thread_id),
  ]);
  return {ok:true,result:{mode:result.mode,degraded:Boolean(result.degraded),provider:result.provider||null}};
}

async function processChannel(env,row,payload){
  const channel=clean(payload.channel,40).toLowerCase();
  const link=await env.DB.prepare(`SELECT channel,external_thread_id,status FROM messenger_channel_links WHERE thread_id=? AND channel=? ORDER BY id DESC LIMIT 1`).bind(row.thread_id,channel).first();
  if(!link||!['pending','active'].includes(String(link.status||'')))return {ok:true,result:{suppressed:true,reason:'channel_not_active'}};
  const message=row.message_id?await env.DB.prepare(`SELECT id,body,metadata_json FROM messenger_messages WHERE id=? AND thread_id=?`).bind(row.message_id,row.thread_id).first():null;
  if(!message)return {ok:true,result:{suppressed:true,reason:'message_missing'}};
  const envelope=buildChannelEnvelope({channel,threadId:row.thread_id,messageId:message.id,body:message.body,externalThreadId:link.external_thread_id,metadata:{source:'ekodi-messenger',message:safeParse(message.metadata_json,{})}});
  const result=await dispatchChannelEnvelope(env,envelope);
  if(result.delivered){
    const now=nowIso();
    await env.DB.batch([
      env.DB.prepare(`UPDATE messenger_channel_links SET status='active',updated_at=? WHERE thread_id=? AND channel=?`).bind(now,row.thread_id,channel),
      env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`).bind(row.thread_id,'channel.delivered','system',channel,safeJson(result),now),
    ]);
    return {ok:true,result};
  }
  return {ok:false,retryable:result.retryable!==false,error:result.error||'CHANNEL_DELIVERY_FAILED'};
}

async function processRow(env,row){
  const payload=safeParse(row.payload_json,{});
  if(row.consumer==='assistant')return processAssistant(env,row,payload);
  if(row.consumer==='channel')return processChannel(env,row,payload);
  return {ok:true,result:{suppressed:true,reason:'unknown_consumer'}};
}

function retryAt(attempts){
  const delay=Math.min(300,Math.max(5,5*Math.pow(2,Math.min(Number(attempts)||0,6))));
  return new Date(Date.now()+delay*1000).toISOString();
}

export async function drainMessengerOutbox(env,{limit=12}={}){
  if(!env?.DB)return {processed:0,delivered:0,failed:0};
  const now=nowIso();
  await env.DB.prepare(`UPDATE messenger_outbox SET status='pending',locked_at=NULL,updated_at=? WHERE status='processing' AND locked_at IS NOT NULL AND locked_at < ?`).bind(now,new Date(Date.now()-120000).toISOString()).run();
  const rows=await env.DB.prepare(`SELECT * FROM messenger_outbox WHERE status IN ('pending','failed') AND available_at<=? AND attempts<8 ORDER BY id ASC LIMIT ?`).bind(now,Math.max(1,Math.min(Number(limit)||12,30))).all();
  let processed=0,delivered=0,failed=0;
  for(const row of rows.results||[]){
    const lock=await env.DB.prepare(`UPDATE messenger_outbox SET status='processing',locked_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('pending','failed')`).bind(nowIso(),nowIso(),row.id).run();
    if(Number(lock.meta?.changes||0)!==1)continue;
    processed+=1;
    try{
      const result=await processRow(env,{...row,attempts:Number(row.attempts||0)+1});
      if(result.ok){
        delivered+=1;
        await env.DB.prepare(`UPDATE messenger_outbox SET status='delivered',locked_at=NULL,last_error='',updated_at=? WHERE id=?`).bind(nowIso(),row.id).run();
      }else{
        failed+=1;const attempts=Number(row.attempts||0)+1;const dead=result.retryable===false||attempts>=8;
        await env.DB.prepare(`UPDATE messenger_outbox SET status=?,locked_at=NULL,last_error=?,available_at=?,updated_at=? WHERE id=?`).bind(dead?'dead':'failed',clean(result.error,500),dead?nowIso():retryAt(attempts),nowIso(),row.id).run();
      }
    }catch(error){
      failed+=1;const attempts=Number(row.attempts||0)+1;const dead=attempts>=8;
      await env.DB.prepare(`UPDATE messenger_outbox SET status=?,locked_at=NULL,last_error=?,available_at=?,updated_at=? WHERE id=?`).bind(dead?'dead':'failed',clean(error?.message||error,500),dead?nowIso():retryAt(attempts),nowIso(),row.id).run();
    }
  }
  return {processed,delivered,failed};
}
