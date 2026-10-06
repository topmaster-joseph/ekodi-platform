const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const STATES=new Set(['received','reviewing','answered','published','archived']);
function bearer(req){return req.headers.get('authorization')||''}
function pathOf(req){const path=new URL(req.url).pathname;return path==='/board'?'/':path.startsWith('/board/')?path.slice('/board'.length):path}
async function body(req){try{return await req.json()}catch{return{}}}
function category(v){const value=text(v).toLowerCase();return CATEGORIES.has(value)?value:'other'}
function state(v,fallback='published'){const value=text(v).toLowerCase();return STATES.has(value)?value:fallback}
async function ekodiVoiceAdmin(req){
  const authorization=bearer(req);if(!/^Bearer\s+\S+/i.test(authorization))return null;
  const url=new URL(req.url),verify=new URL('/api/seonammedi/admin/me',url.origin);
  try{
    const response=await fetch(verify,{headers:{authorization,'cache-control':'no-store'}});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data?.ok===true&&data?.permissions?.voices===true)return data;
  }catch{}
  return null;
}
async function requireVoiceAdmin(req){
  const auth=await ekodiVoiceAdmin(req);
  return auth?{ok:true,auth}:{ok:false,response:json({ok:false,error:'voice_forbidden'},403)};
}
async function list(env,url){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,author_name,category,title,body,created_at,updated_at FROM board_posts WHERE status='published'",args=[];
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=[`%${q}%`,`%${q}%`]}
  sql+=' ORDER BY id DESC LIMIT 100';
  const posts=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const replies=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,created_at FROM board_replies WHERE status='published' ORDER BY id").all()).results||[];
  return json({ok:true,boardId:env.BOARD_ID,storage:'independent-board-d1',items:posts.map(p=>({
    id:Number(p.id),category:p.category||'other',displayName:p.author_name||'익명',message:p.body||'',createdAt:p.created_at,updatedAt:p.updated_at,
    replies:replies.filter(r=>Number(r.post_id)===Number(p.id)).map(r=>({id:Number(r.id),displayName:r.author_name||'익명',message:r.body||'',createdAt:r.created_at}))
  }))});
}
async function adminList(req,env){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const posts=(await env.BOARD_DB.prepare("SELECT id,author_name,category,private_contact,body,status,created_at,updated_at FROM board_posts WHERE status<>'deleted' ORDER BY id DESC LIMIT 300").all()).results||[];
  const replies=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,status,created_at FROM board_replies WHERE status<>'deleted' ORDER BY id").all()).results||[];
  return json({ok:true,items:posts.map(p=>({
    id:Number(p.id),category:p.category||'other',displayName:p.author_name||'익명',contact:p.private_contact||'',message:p.body||'',status:p.status||'published',publicConsent:true,createdAt:p.created_at,updatedAt:p.updated_at,
    replies:replies.filter(r=>Number(r.post_id)===Number(p.id)).map(r=>({id:Number(r.id),displayName:r.author_name||'익명',message:r.body||'',status:r.status||'published',createdAt:r.created_at}))
  }))});
}
async function adminUpdate(req,env,id){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id,status FROM board_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const b=await body(req),name=text(b.displayName||b.name).slice(0,80)||'익명',contact=text(b.contact).slice(0,160),content=text(b.message||b.body).slice(0,12000);
  if(!content)return json({ok:false,error:'message_required'},400);
  const kind=category(b.category),nextState=state(b.status,existing.status||'published');
  await env.BOARD_DB.prepare('UPDATE board_posts SET author_name=?,category=?,private_contact=?,body=?,status=?,updated_at=? WHERE id=?').bind(name,kind,contact,content,nextState,now(),id).run();
  return json({ok:true,id});
}
async function adminDelete(req,env,id){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const t=now();
  await env.BOARD_DB.prepare("UPDATE board_posts SET status='deleted',updated_at=? WHERE id=?").bind(t,id).run();
  await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE post_id=?").bind(id).run();
  return json({ok:true,id});
}
async function adminDeleteReply(req,env,postId,replyId){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_replies WHERE id=? AND post_id=? AND status<>'deleted'").bind(replyId,postId).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE id=? AND post_id=?").bind(replyId,postId).run();
  return json({ok:true,id:replyId});
}
export default {async fetch(req,env){
  const url=new URL(req.url),path=pathOf(req);
  if(path==='/'&&req.method==='GET')return Response.redirect(new URL('/#voices',url),302);
  if(path==='/health'&&req.method==='GET')return json({ok:true,service:'independent-board',boardId:env.BOARD_ID,storage:'independent-board-d1',db:Boolean(env.BOARD_DB),files:Boolean(env.BOARD_FILES),auth:'ekodi'});
  if(path==='/api/posts'&&req.method==='GET')return list(env,url);
  if(path==='/api/posts'&&req.method==='POST'){
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,12000),title=text(b.title||name||'시민의견').slice(0,160),kind=category(b.category),contact=text(b.contact).slice(0,160);
    if(!content)return json({ok:false,error:'message_required',message:'의견 내용을 입력해 주세요.'},400);
    const t=now(),r=await env.BOARD_DB.prepare('INSERT INTO board_posts(author_name,category,private_contact,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(name||'익명',kind,contact,title,content,t,t).run();
    return json({ok:true,id:Number(r.meta.last_row_id||0),storage:'independent-board-d1',message:'시민의견이 등록되어 바로 게시되었습니다.'},201);
  }
  const reply=path.match(/^\/api\/posts\/(\d+)\/replies$/);
  if(reply&&req.method==='POST'){
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,6000);
    if(!content)return json({ok:false,error:'message_required',message:'답글 내용을 입력해 주세요.'},400);
    const post=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status='published'").bind(+reply[1]).first();if(!post)return json({ok:false,error:'not_found'},404);
    const r=await env.BOARD_DB.prepare('INSERT INTO board_replies(post_id,author_name,body,created_at) VALUES(?,?,?,?)').bind(post.id,name||'익명',content,now()).run();
    return json({ok:true,id:Number(r.meta.last_row_id||0),message:'답글이 등록되었습니다.'},201);
  }
  if(path==='/api/admin/posts'&&req.method==='GET')return adminList(req,env);
  const item=path.match(/^\/api\/admin\/posts\/(\d+)$/);
  if(item&&req.method==='PUT')return adminUpdate(req,env,+item[1]);
  if(item&&req.method==='DELETE')return adminDelete(req,env,+item[1]);
  const adminReply=path.match(/^\/api\/admin\/posts\/(\d+)\/replies\/(\d+)$/);
  if(adminReply&&req.method==='DELETE')return adminDeleteReply(req,env,+adminReply[1],+adminReply[2]);
  return json({ok:false,error:'not_found'},404);
}};