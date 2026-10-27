
/**
 * Fresh citizen voice board V3.
 * No references to legacy board_posts, board_replies, legacy queue or board UI.
 * API access uses the existing EKODI Google proof and server-side voices admin gate.
 */
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const invalid=(code,status)=>reply({ok:false,error:code},status);
const stamp=()=>new Date().toISOString();
export const FRESH_QUEUE_KIND='citizen-voices-fresh.post.v1';
export const FRESH_REPLY_QUEUE_KIND='citizen-voices-fresh.reply.v1';
const REPLY_MAX=2000;
export async function consumeFreshVoiceQueue(env,payload){
  const key=String(payload?.submissionId||'');
  if(!/^[a-f0-9-]{36}$/i.test(key))throw Error('invalid_fresh_submission');
  const existing=await env.BOARD_DB.prepare('SELECT id FROM citizen_voices_fresh WHERE submission_key=? LIMIT 1').bind(key).first();
  if(existing?.id)return Number(existing.id);
  try{
    const time=String(payload.createdAt||stamp());
    const result=await env.BOARD_DB.prepare("INSERT INTO citizen_voices_fresh(google_subject,submission_key,title,body,status,created_at,updated_at) VALUES(?,?,?,?,'published',?,?)")
      .bind(String(payload.googleSubject||''),key,String(payload.title||'').slice(0,160),String(payload.message||''),time,time).run();
    const id=Number(result?.meta?.last_row_id||0);
    if(id>0)return id;
  }catch(error){
    const duplicate=await env.BOARD_DB.prepare('SELECT id FROM citizen_voices_fresh WHERE submission_key=? LIMIT 1').bind(key).first().catch(()=>null);
    if(duplicate?.id)return Number(duplicate.id);
    throw error;
  }
  throw Error('fresh_write_unconfirmed');
}
// Replies follow the same durable-queue path as voices. A reply whose voice is gone is dropped (returns 0).
export async function consumeFreshReplyQueue(env,payload){
  const key=String(payload?.submissionId||''),voiceId=Number(payload?.voiceId);
  if(!/^[a-f0-9-]{36}$/i.test(key)||!Number.isSafeInteger(voiceId)||voiceId<1)throw Error('invalid_fresh_reply');
  const existing=await env.BOARD_DB.prepare('SELECT id FROM citizen_voice_replies_fresh WHERE submission_key=? LIMIT 1').bind(key).first();
  if(existing?.id)return Number(existing.id);
  const parent=await env.BOARD_DB.prepare("SELECT id FROM citizen_voices_fresh WHERE id=? AND status='published'").bind(voiceId).first();
  if(!parent?.id)return 0;
  try{
    const time=String(payload.createdAt||stamp());
    const result=await env.BOARD_DB.prepare("INSERT INTO citizen_voice_replies_fresh(voice_id,google_subject,submission_key,body,status,created_at,updated_at) VALUES(?,?,?,?,'published',?,?)")
      .bind(voiceId,String(payload.googleSubject||''),key,String(payload.message||'').slice(0,REPLY_MAX),time,time).run();
    const id=Number(result?.meta?.last_row_id||0);
    if(id>0)return id;
  }catch(error){
    const duplicate=await env.BOARD_DB.prepare('SELECT id FROM citizen_voice_replies_fresh WHERE submission_key=? LIMIT 1').bind(key).first().catch(()=>null);
    if(duplicate?.id)return Number(duplicate.id);
    throw error;
  }
  throw Error('fresh_reply_write_unconfirmed');
}
async function listReplies(env,ids){
  if(!ids.length)return new Map();
  const grouped=new Map();
  try{
    const result=await env.BOARD_DB.prepare("SELECT id,voice_id,body,created_at FROM citizen_voice_replies_fresh WHERE status='published' AND voice_id IN ("+ids.map(()=>'?').join(',')+") ORDER BY id ASC LIMIT 2000").bind(...ids).all();
    for(const r of result?.results||[]){
      const voiceId=Number(r.voice_id);
      if(!ids.includes(voiceId)||typeof r.body!=='string')continue;
      if(!grouped.has(voiceId))grouped.set(voiceId,[]);
      grouped.get(voiceId).push({id:Number(r.id),message:r.body,createdAt:r.created_at});
    }
  }catch{}
  // Replies are additive: if they cannot be read, voices are still listed.
  return grouped;
}
export async function handleFreshVoiceApi(req,env,path,{google,admin,limit}){
  const root='/api/voices-fresh';
  if(!path.startsWith(root))return null;
  const tail=path.slice(root.length),url=new URL(req.url);
  if(!env?.BOARD_DB?.prepare)return invalid('storage_unavailable',503);
  const polling=tail.match(/^\/submissions\/([a-f0-9-]{36})$/i);
  if(req.method==='GET'&&polling){
    const record=await env.BOARD_DB.prepare("SELECT id FROM citizen_voices_fresh WHERE submission_key=? AND status='published'").bind(polling[1]).first().catch(()=>null);
    return reply({ok:true,status:record?.id?'published':'pending',...(record?.id?{id:Number(record.id)}:{})});
  }
  const replyPolling=tail.match(/^\/replies\/submissions\/([a-f0-9-]{36})$/i);
  if(req.method==='GET'&&replyPolling){
    const record=await env.BOARD_DB.prepare("SELECT id FROM citizen_voice_replies_fresh WHERE submission_key=? AND status='published'").bind(replyPolling[1]).first().catch(()=>null);
    return reply({ok:true,status:record?.id?'published':'pending',...(record?.id?{id:Number(record.id)}:{})});
  }
  if(req.method==='GET'&&(tail===''||tail==='/admin')){
    if(tail==='/admin'){
      const gate=await admin(req);
      if(!gate.ok)return gate.response;
    }
    const q=String(url.searchParams.get('q')||'').trim().slice(0,100);
    const sql="SELECT id,title,body,created_at,updated_at FROM citizen_voices_fresh WHERE status='published'"+(q?" AND (body LIKE ? OR title LIKE ?)":"")+" ORDER BY id DESC LIMIT 100";
    try{
      const stmt=env.BOARD_DB.prepare(sql),result=await(q?stmt.bind('%'+q+'%','%'+q+'%').all():stmt.all());
      const items=(result.results||[]).map(p=>({id:Number(p.id),title:String(p.title||''),message:p.body,createdAt:p.created_at,updatedAt:p.updated_at}));
      const replies=await listReplies(env,items.map(p=>p.id).filter(id=>Number.isSafeInteger(id)&&id>0));
      return reply({ok:true,items:items.map(p=>({...p,replies:replies.get(p.id)||[]}))});
    }catch{return invalid('storage_unavailable',503)}
  }
  if(req.method==='POST'&&tail===''){
    const identity=await google(req);
    if(!identity)return invalid('google_login_required',401);
    const limiter=await limit(req,env,'citizen-fresh');
    if(!limiter.available)return invalid('write_protection_unavailable',503);
    if(!limiter.allowed)return invalid('rate_limited',429);
    let data;try{data=await req.json()}catch{return invalid('invalid_json',400)}
    const message=String(data?.message||'').trim();
    if(!message||message.length>12000)return invalid('invalid_message',400);
    const title=String(data?.title||'').replace(/\s+/g,' ').trim();
    if(!title||title.length>160)return invalid('invalid_title',400);
    const producer=env?.BOARD_WRITE_QUEUE;
    if(!producer?.send)return invalid('durable_queue_unavailable',503);
    const submissionId=crypto.randomUUID();
    try{
      await producer.send({kind:FRESH_QUEUE_KIND,payload:{submissionId,googleSubject:identity.id,title,message,createdAt:stamp()}},{contentType:'json'});
      return reply({ok:true,queued:true,submissionId,statusUrl:'/board/api/voices-fresh/submissions/'+submissionId},202);
    }catch{return invalid('durable_queue_unavailable',503)}
  }
  const replyPost=tail.match(/^\/(\d+)\/replies$/);
  if(req.method==='POST'&&replyPost){
    const identity=await google(req);
    if(!identity)return invalid('google_login_required',401);
    const voiceId=Number(replyPost[1]);
    if(!Number.isSafeInteger(voiceId)||voiceId<1)return invalid('invalid_post',400);
    const limiter=await limit(req,env,'citizen-fresh-reply');
    if(!limiter.available)return invalid('write_protection_unavailable',503);
    if(!limiter.allowed)return invalid('rate_limited',429);
    let data;try{data=await req.json()}catch{return invalid('invalid_json',400)}
    const message=String(data?.message||'').trim();
    if(!message||message.length>REPLY_MAX)return invalid('invalid_message',400);
    const parent=await env.BOARD_DB.prepare("SELECT id FROM citizen_voices_fresh WHERE id=? AND status='published'").bind(voiceId).first().catch(()=>undefined);
    if(parent===undefined)return invalid('storage_unavailable',503);
    if(!parent)return invalid('not_found',404);
    const producer=env?.BOARD_WRITE_QUEUE;
    if(!producer?.send)return invalid('durable_queue_unavailable',503);
    const submissionId=crypto.randomUUID();
    try{
      await producer.send({kind:FRESH_REPLY_QUEUE_KIND,payload:{submissionId,voiceId,googleSubject:identity.id,message,createdAt:stamp()}},{contentType:'json'});
      return reply({ok:true,queued:true,submissionId,statusUrl:'/board/api/voices-fresh/replies/submissions/'+submissionId},202);
    }catch{return invalid('durable_queue_unavailable',503)}
  }
  const replyItem=tail.match(/^\/replies\/(\d+)$/);
  if(replyItem&&req.method==='DELETE'){
    const gate=await admin(req);
    if(!gate.ok)return gate.response;
    const id=Number(replyItem[1]);
    if(!Number.isSafeInteger(id)||id<1)return invalid('invalid_reply',400);
    try{
      const found=await env.BOARD_DB.prepare("SELECT id FROM citizen_voice_replies_fresh WHERE id=? AND status='published'").bind(id).first();
      if(!found)return invalid('not_found',404);
      await env.BOARD_DB.prepare("UPDATE citizen_voice_replies_fresh SET status='deleted',updated_at=? WHERE id=?").bind(stamp(),id).run();
      return reply({ok:true,id});
    }catch{return invalid('storage_unavailable',503)}
  }
  const item=tail.match(/^\/(\d+)$/);
  if(item&&(req.method==='PUT'||req.method==='DELETE')){
    const gate=await admin(req);
    if(!gate.ok)return gate.response;
    const id=Number(item[1]);
    if(!Number.isSafeInteger(id)||id<1)return invalid('invalid_post',400);
    try{
      const found=await env.BOARD_DB.prepare("SELECT id FROM citizen_voices_fresh WHERE id=? AND status='published'").bind(id).first();
      if(!found)return invalid('not_found',404);
      if(req.method==='DELETE'){
        await env.BOARD_DB.prepare("UPDATE citizen_voices_fresh SET status='deleted',updated_at=? WHERE id=?").bind(stamp(),id).run();
        return reply({ok:true,id});
      }
      let payload;try{payload=await req.json()}catch{return invalid('invalid_json',400)}
      const message=String(payload?.message||'').trim();
      if(!message||message.length>12000)return invalid('invalid_message',400);
      const title=String(payload?.title??'').replace(/\s+/g,' ').trim();
      if(title.length>160)return invalid('invalid_title',400);
      await env.BOARD_DB.prepare("UPDATE citizen_voices_fresh SET title=?,body=?,updated_at=? WHERE id=?").bind(title,message,stamp(),id).run();
      return reply({ok:true,id});
    }catch{return invalid('storage_unavailable',503)}
  }
  return invalid('not_found',404);
}
