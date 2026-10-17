
/**
 * Fresh citizen voice board V3.
 * No references to legacy board_posts, board_replies, legacy queue or board UI.
 * API access uses the existing EKODI Google proof and server-side voices admin gate.
 */
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const invalid=(code,status)=>reply({ok:false,error:code},status);
const stamp=()=>new Date().toISOString();
export async function handleFreshVoiceApi(req,env,path,{google,admin,limit}){
  const root='/api/voices-fresh';
  if(!path.startsWith(root))return null;
  const tail=path.slice(root.length),url=new URL(req.url);
  if(!env?.BOARD_DB?.prepare)return invalid('storage_unavailable',503);
  if(req.method==='GET'&&(tail===''||tail==='/admin')){
    if(tail==='/admin'){
      const gate=await admin(req);
      if(!gate.ok)return gate.response;
    }
    const q=String(url.searchParams.get('q')||'').trim().slice(0,100);
    const sql="SELECT id,body,created_at,updated_at FROM citizen_voices_fresh WHERE status='published'"+(q?" AND body LIKE ?":"")+" ORDER BY id DESC LIMIT 100";
    try{
      const stmt=env.BOARD_DB.prepare(sql),result=await(q?stmt.bind('%'+q+'%').all():stmt.all());
      return reply({ok:true,items:(result.results||[]).map(p=>({id:Number(p.id),message:p.body,createdAt:p.created_at,updatedAt:p.updated_at}))});
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
    try{
      const time=stamp();
      const result=await env.BOARD_DB.prepare("INSERT INTO citizen_voices_fresh(google_subject,body,status,created_at,updated_at) VALUES(?,?,'published',?,?)")
        .bind(identity.id,message,time,time).run();
      const id=Number(result?.meta?.last_row_id);
      if(!Number.isSafeInteger(id)||id<1)return invalid('write_not_confirmed',503);
      const saved=await env.BOARD_DB.prepare("SELECT id,body FROM citizen_voices_fresh WHERE id=? AND status='published'").bind(id).first();
      if(!saved||saved.body!==message)return invalid('write_not_confirmed',503);
      return reply({ok:true,published:true,id},201);
    }catch{return invalid('write_failed',503)}
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
      await env.BOARD_DB.prepare("UPDATE citizen_voices_fresh SET body=?,updated_at=? WHERE id=?").bind(message,stamp(),id).run();
      return reply({ok:true,id});
    }catch{return invalid('storage_unavailable',503)}
  }
  return invalid('not_found',404);
}
