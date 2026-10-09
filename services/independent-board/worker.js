import { BOARD_DISCUSSION_QUEUE_KIND, listBoardDiscussionComments, publishBoardComment, consumeDiscussionComment, updateBoardDiscussionComment, deleteBoardDiscussionComment } from './discussion-comments.js';

const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const STATES=new Set(['received','reviewing','answered','published','archived']);
const FINANCE_TYPES=new Set(['income','expense']);
const EVIDENCE_STATES=new Set(['none','held','verified']);
const MEDIA_MAX=5,MEDIA_BYTES=1600000;
const POST_QUEUE_KIND='independent-board.post.v1';
const REPLY_QUEUE_KIND='independent-board.reply.v1';
const QUEUE_BINDING='BOARD_WRITE_QUEUE';
function queueAvailable(env){return Boolean(env?.[QUEUE_BINDING]&&typeof env[QUEUE_BINDING].send==='function')}
async function requestIdentity(req){
  const raw=[req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',String(req.headers.get('user-agent')||'').slice(0,160)].join('|');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function publicWriteAllowed(req,env,scope){
  const limiter=env?.BOARD_PUBLIC_WRITE_RATE_LIMITER;
  if(!limiter?.limit)return env?.ENVIRONMENT==='production'?{available:false,allowed:false}:{available:true,allowed:true};
  try{const result=await limiter.limit({key:`${scope}:${await requestIdentity(req)}`});return{available:true,allowed:result?.success!==false}}catch(error){console.error('board public write limiter unavailable',error);return{available:false,allowed:false}}
}
async function enqueueBoardWrite(env,envelope){
  if(!queueAvailable(env))return false;
  await env[QUEUE_BINDING].send(envelope,{contentType:'json'});return true;
}
function imageKeys(v){try{const a=Array.isArray(v)?v:JSON.parse(v||'[]');return a.filter(x=>typeof x==='string'&&x).slice(0,MEDIA_MAX)}catch{return[]}}
function mediaUrls(v){return imageKeys(v).map(k=>'/board/api/files/'+encodeURIComponent(k))}
function b64bytes(v){const raw=String(v||'').replace(/^data:[^,]+,/,'');if(raw.length>Math.ceil(MEDIA_BYTES*4/3)+16)return new Uint8Array(0);const bin=atob(raw);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function saveImages(env,scope,postId,images){
  if(!env.BOARD_FILES)return[];
  const safeScope=scope==='notices'?'notices':'voices',keys=[];
  for(let i=0;i<Math.min((images||[]).length,MEDIA_MAX);i++){
    const x=images[i]||{},type=String(x.type||'image/jpeg').toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(type))continue;
    let bytes;try{bytes=b64bytes(x.data)}catch{continue}
    if(!bytes.length||bytes.length>MEDIA_BYTES)continue;
    const ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
    const key='seonammedi/'+safeScope+'/'+postId+'/'+crypto.randomUUID()+'.'+ext;
    await env.BOARD_FILES.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
    keys.push(key);
  }
  return keys;
}
async function deleteImages(env,keys){if(!env.BOARD_FILES)return;for(const key of imageKeys(keys))try{await env.BOARD_FILES.delete(key)}catch{}}
function bearer(req){return req.headers.get('authorization')||''}
function pathOf(req){const path=new URL(req.url).pathname;if(path==='/board'||path==='/seonammedi/board')return'/';if(path.startsWith('/seonammedi/board/'))return path.slice('/seonammedi/board'.length);return path.startsWith('/board/')?path.slice('/board'.length):path}
function boardMount(req){return new URL(req.url).pathname.startsWith('/seonammedi/board')?'/seonammedi':''}
function sitePath(req,suffix=''){const mount=boardMount(req);return mount+(suffix||'/')}
function boardPath(req,key){return boardMount(req)+'/board/'+key}
async function body(req){try{return await req.json()}catch{return{}}}
function category(v){const value=text(v).toLowerCase();return CATEGORIES.has(value)?value:'other'}
function state(v,fallback='published'){const value=text(v).toLowerCase();return STATES.has(value)?value:fallback}
function financeType(v){const value=text(v).toLowerCase();return FINANCE_TYPES.has(value)?value:'expense'}
function evidenceState(v){const value=text(v).toLowerCase();return EVIDENCE_STATES.has(value)?value:'none'}
function safeAmount(v){const n=Math.round(Number(v)||0);return Math.max(0,Math.min(n,999999999999))}
function dateOnly(v){const value=text(v);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Date().toISOString().slice(0,10)}
const SUPABASE_VERIFY_URL='https://renzehysxirjilvdxacv.supabase.co/auth/v1/verify';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SUPABASE_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
function authReturnHtml(session,path){
  const payload=JSON.stringify(session).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  const target=JSON.stringify(path||'/board/voices');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>로그인 복귀</title></head><body><p>관리자 로그인을 확인하고 있습니다.</p><script>(()=>{const session='+payload+',target='+target+';try{localStorage.setItem("'+SUPABASE_SESSION_KEY+'",JSON.stringify(session));sessionStorage.removeItem("ekodi-auth-token")}catch{}history.replaceState(null,"",target);location.replace(target)})()</script></body></html>';
}
async function boardAuthReturn(req){
  if(req.method!=='POST')return null;
  const type=String(req.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('application/x-www-form-urlencoded')&&!type.includes('multipart/form-data'))return null;
  let form;try{form=await req.clone().formData()}catch{return null}
  if(String(form.get('ekodi_auth_return')||'')!=='1')return null;
  const tokenHash=text(form.get('ekodi_token')||form.get('token_hash'));
  const tokenType=text(form.get('ekodi_type')||'email').toLowerCase();
  if(!tokenHash||tokenType!=='email')return new Response('로그인 복귀 인증값이 올바르지 않습니다.',{status:400,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
  const response=await fetch(SUPABASE_VERIFY_URL,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({token_hash:tokenHash,type:tokenType})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token)return new Response('로그인 복귀를 완료하지 못했습니다. 관리자 로그인을 다시 진행해 주세요.',{status:response.status>=400&&response.status<600?response.status:502,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
  const session={access_token:String(data.access_token),refresh_token:String(data.refresh_token||''),expires_at:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:data.user||null};
  return new Response(authReturnHtml(session,new URL(req.url).pathname),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0','pragma':'no-cache','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-ekodi-auth-return':'form-post-v1'}});
}

async function adminMe(req){
  const authorization=bearer(req);if(!/^Bearer\s+\S+/i.test(authorization))return null;
  const verify=new URL('/api/seonammedi/admin/me',new URL(req.url).origin);
  try{
    const response=await fetch(verify,{headers:{authorization,'cache-control':'no-store'}});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data?.ok===true?data:null;
  }catch{return null}
}
async function signedInGoogle(req){
  const authorization=bearer(req);if(!/^Bearer\s+\S+/i.test(authorization))return null;
  const token=authorization.replace(/^Bearer\s+/i,'').trim();if(!token||token.length>8192)return null;
  try{
    const response=await fetch(SUPABASE_VERIFY_URL.replace(/\/verify$/,'/user'),{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-store'}});
    const user=await response.json().catch(()=>null);if(!response.ok||!user?.id||!user?.email_confirmed_at)return null;
    const providers=[user?.app_metadata?.provider,...(Array.isArray(user?.app_metadata?.providers)?user.app_metadata.providers:[]),...(Array.isArray(user?.identities)?user.identities.map(x=>x?.provider):[])].filter(Boolean).map(x=>String(x).toLowerCase());
    return providers.includes('google')?{id:String(user.id),email:text(user.email).toLowerCase()}:null;
  }catch{return null}
}
async function requireSignedInGoogle(req){
  const user=await signedInGoogle(req);
  return user?{ok:true,user}:{ok:false,response:json({ok:false,error:'google_login_required',message:'Google 로그인 후 총괄내역을 확인할 수 있습니다.'},401)};
}
async function requirePermission(req,permission){
  const auth=await adminMe(req);
  return auth&&(auth.platform===true||auth.permissions?.[permission]===true)?{ok:true,auth}:{ok:false,response:json({ok:false,error:permission+'_forbidden'},403)};
}
async function requireVoiceAdmin(req){return requirePermission(req,'voices')}
async function signedInBoardMember(req){
  const authorization=bearer(req);
  if(!/^Bearer\s+\S+/i.test(authorization))return null;
  const token=authorization.replace(/^Bearer\s+/i,'').trim();
  if(!token||token.length>8192)return null;
  try{
    const response=await fetch(SUPABASE_VERIFY_URL.replace(/\/verify$/,'/user'),{
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-store'}
    });
    const user=await response.json().catch(()=>null);
    if(!response.ok||!user?.id||user.is_anonymous===true||(!user.email_confirmed_at&&!user.phone_confirmed_at))return null;
    return {id:String(user.id),displayName:text(user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'회원').slice(0,80)};
  }catch{return null}
}
async function requireVoiceWriter(req){
  const user=await signedInBoardMember(req);
  return user?{ok:true,user}:{ok:false,response:json({ok:false,error:'login_required',message:'시민의견 글쓰기와 답글은 로그인 후 가능합니다.'},401)};
}

async function list(env,url){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,author_name,category,title,body,image_keys,created_at,updated_at FROM board_posts WHERE status='published'",args=[];
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=['%'+q+'%','%'+q+'%']}
  sql+=' ORDER BY id DESC LIMIT 100';
  const posts=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const replies=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,created_at FROM board_replies WHERE status='published' ORDER BY id").all()).results||[];
  return json({ok:true,boardId:env.BOARD_ID,storage:'independent-board-d1',items:posts.map(p=>({
    id:Number(p.id),category:p.category||'other',displayName:p.author_name||'익명',message:p.body||'',imageUrls:mediaUrls(p.image_keys),createdAt:p.created_at,updatedAt:p.updated_at,
    replies:replies.filter(r=>Number(r.post_id)===Number(p.id)).map(r=>({id:Number(r.id),displayName:r.author_name||'익명',message:r.body||'',createdAt:r.created_at}))
  }))});
}
async function persistQueuedPost(env,payload){
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE submission_key=? LIMIT 1").bind(payload.submissionId).first();
  if(existing?.id)return Number(existing.id);
  const imageJson=JSON.stringify(imageKeys(payload.imageKeys));
  try{
    const r=await env.BOARD_DB.prepare('INSERT INTO board_posts(author_name,category,private_contact,title,body,image_keys,submission_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(payload.name||'익명',payload.category||'other',payload.contact||'',payload.title||payload.name||'시민의견',payload.content,imageJson,payload.submissionId,payload.createdAt,payload.createdAt).run();
    if(Number(r?.meta?.last_row_id||0))return Number(r.meta.last_row_id);
  }catch(error){
    const duplicate=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE submission_key=? LIMIT 1").bind(payload.submissionId).first().catch(()=>null);
    if(duplicate?.id)return Number(duplicate.id);throw error;
  }
  throw new Error('board_post_insert_not_confirmed');
}
async function persistQueuedReply(env,payload){
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_replies WHERE submission_key=? LIMIT 1").bind(payload.submissionId).first();
  if(existing?.id)return Number(existing.id);
  const post=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status='published'").bind(payload.postId).first();
  if(!post?.id)throw new Error('reply_parent_unavailable');
  try{
    const r=await env.BOARD_DB.prepare('INSERT INTO board_replies(post_id,author_name,body,submission_key,created_at) VALUES(?,?,?,?,?)')
      .bind(post.id,payload.name||'익명',payload.content,payload.submissionId,payload.createdAt).run();
    if(Number(r?.meta?.last_row_id||0))return Number(r.meta.last_row_id);
  }catch(error){
    const duplicate=await env.BOARD_DB.prepare("SELECT id FROM board_replies WHERE submission_key=? LIMIT 1").bind(payload.submissionId).first().catch(()=>null);
    if(duplicate?.id)return Number(duplicate.id);throw error;
  }
  throw new Error('board_reply_insert_not_confirmed');
}
async function consumeBoardWrite(envelope,env){
  if(envelope?.kind===POST_QUEUE_KIND){await persistQueuedPost(env,envelope.payload||{});return true}
  if(envelope?.kind===REPLY_QUEUE_KIND){await persistQueuedReply(env,envelope.payload||{});return true}
  if(envelope?.kind===BOARD_DISCUSSION_QUEUE_KIND){await consumeDiscussionComment(envelope,env);return true}
  return false;
}
async function submissionStatus(env,submissionId){
  const post=await env.BOARD_DB.prepare("SELECT id,status FROM board_posts WHERE submission_key=? LIMIT 1").bind(submissionId).first().catch(()=>null);
  if(post?.id)return json({ok:true,status:post.status==='published'?'published':'processing',kind:'post',id:Number(post.id),submissionId});
  const reply=await env.BOARD_DB.prepare("SELECT id,status FROM board_replies WHERE submission_key=? LIMIT 1").bind(submissionId).first().catch(()=>null);
  if(reply?.id)return json({ok:true,status:reply.status==='published'?'published':'processing',kind:'reply',id:Number(reply.id),submissionId});
  const comment=await env.BOARD_DB.prepare("SELECT id,status FROM board_discussion_comments WHERE submission_key=?").bind(submissionId).first().catch(()=>null);
  if(comment?.id)return json({ok:true,status:comment.status==='published'?'published':'processing',kind:'discussion-comment',id:Number(comment.id),submissionId});
  return json({ok:true,status:'pending',submissionId});
}
async function adminList(req,env){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const posts=(await env.BOARD_DB.prepare("SELECT id,author_name,category,private_contact,body,image_keys,status,created_at,updated_at FROM board_posts WHERE status<>'deleted' ORDER BY id DESC LIMIT 300").all()).results||[];
  const replies=(await env.BOARD_DB.prepare("SELECT id,post_id,author_name,body,status,created_at FROM board_replies WHERE status<>'deleted' ORDER BY id").all()).results||[];
  return json({ok:true,items:posts.map(p=>({
    id:Number(p.id),category:p.category||'other',displayName:p.author_name||'익명',contact:p.private_contact||'',message:p.body||'',imageUrls:mediaUrls(p.image_keys),status:p.status||'published',publicConsent:true,createdAt:p.created_at,updatedAt:p.updated_at,
    replies:replies.filter(r=>Number(r.post_id)===Number(p.id)).map(r=>({id:Number(r.id),displayName:r.author_name||'익명',message:r.body||'',status:r.status||'published',createdAt:r.created_at}))
  }))});
}
async function adminUpdate(req,env,id){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id,status FROM board_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const b=await body(req),name=text(b.displayName||b.name).slice(0,80)||'익명',contact=text(b.contact).slice(0,160),content=text(b.message||b.body).slice(0,12000);
  if(!content)return json({ok:false,error:'message_required'},400);
  await env.BOARD_DB.prepare('UPDATE board_posts SET author_name=?,category=?,private_contact=?,body=?,status=?,updated_at=? WHERE id=?')
    .bind(name,category(b.category),contact,content,state(b.status,existing.status||'published'),now(),id).run();
  return json({ok:true,id});
}
async function adminDelete(req,env,id){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id,image_keys FROM board_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const t=now();await deleteImages(env,existing.image_keys);await env.BOARD_DB.prepare("UPDATE board_posts SET status='deleted',image_keys='[]',updated_at=? WHERE id=?").bind(t,id).run();await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE post_id=?").bind(id).run();
  return json({ok:true,id});
}
async function adminDeleteReply(req,env,postId,replyId){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_replies WHERE id=? AND post_id=? AND status<>'deleted'").bind(replyId,postId).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE id=? AND post_id=?").bind(replyId,postId).run();
  return json({ok:true,id:replyId});
}

// Guarded release trigger: promote the verified finance access tiers to the independent-board production worker.
async function financeSummary(env){
  const rows=(await env.BOARD_DB.prepare("SELECT entry_type,amount FROM finance_posts WHERE status='published'").all()).results||[];
  const raised=rows.filter(x=>x.entry_type==='income').reduce((a,x)=>a+Number(x.amount||0),0),spent=rows.filter(x=>x.entry_type==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
  return {raised,spent,balance:raised-spent};
}
async function memberFinanceSummary(req,env){
  return json({ok:true,boardId:'seonammedi.finance',storage:'independent-board-d1',viewer:'public',summary:await financeSummary(env)});
}
async function listFinance(env,url,admin=false){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,status,created_by,created_at,updated_at FROM finance_posts WHERE status<>'deleted'",args=[];
  if(!admin)sql+=" AND status='published'";
  if(q){sql+=' AND (purpose LIKE ? OR related_event LIKE ? OR public_note LIKE ?)';args=['%'+q+'%','%'+q+'%','%'+q+'%']}
  sql+=' ORDER BY entry_date DESC,id DESC LIMIT '+(admin?'300':'150');
  const rows=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const items=rows.map(r=>({id:Number(r.id),date:r.entry_date,type:r.entry_type,amount:Number(r.amount||0),purpose:r.purpose||'',event:r.related_event||'',note:r.public_note||'',status:r.status||'published',createdAt:r.created_at,updatedAt:r.updated_at,...(admin?{evidenceStatus:r.evidence_status||'none',createdBy:r.created_by||''}:{})}));
  const visible=items.filter(x=>admin||x.status==='published');
  // The list is paginated/limited; grand totals must include every published ledger row.
  const summary=await financeSummary(env);
  return json({ok:true,boardId:'seonammedi.finance',storage:'independent-board-d1',summary,items:await listBoardDiscussionComments(env,'finance',visible)});
}
async function createFinance(req,env){
  const gate=await requirePermission(req,'finance');if(!gate.ok)return gate.response;
  const b=await body(req),purpose=text(b.purpose).slice(0,500);if(!purpose)return json({ok:false,error:'purpose_required'},400);
  const t=now(),r=await env.BOARD_DB.prepare('INSERT INTO finance_posts(entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(dateOnly(b.date),financeType(b.type),safeAmount(b.amount),purpose,text(b.event).slice(0,300),evidenceState(b.evidenceStatus),text(b.note).slice(0,1000),'published',text(gate.auth?.email).slice(0,200),t,t).run();
  return json({ok:true,id:Number(r.meta.last_row_id||0)},201);
}
async function updateFinance(req,env,id){
  const gate=await requirePermission(req,'finance');if(!gate.ok)return gate.response;
  const b=await body(req),purpose=text(b.purpose).slice(0,500);if(!purpose)return json({ok:false,error:'purpose_required'},400);
  const found=await env.BOARD_DB.prepare("SELECT id FROM finance_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare('UPDATE finance_posts SET entry_date=?,entry_type=?,amount=?,purpose=?,related_event=?,evidence_status=?,public_note=?,updated_at=? WHERE id=?')
    .bind(dateOnly(b.date),financeType(b.type),safeAmount(b.amount),purpose,text(b.event).slice(0,300),evidenceState(b.evidenceStatus),text(b.note).slice(0,1000),now(),id).run();
  return json({ok:true,id});
}
async function deleteFinance(req,env,id){
  const gate=await requirePermission(req,'finance');if(!gate.ok)return gate.response;
  const found=await env.BOARD_DB.prepare("SELECT id FROM finance_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare("UPDATE finance_posts SET status='deleted',updated_at=? WHERE id=?").bind(now(),id).run();
  await env.BOARD_DB.prepare("UPDATE board_discussion_comments SET status='deleted',updated_at=? WHERE board_kind='finance' AND post_id=? AND status='published'").bind(now(),id).run();
  return json({ok:true,id});
}
async function listNotices(env,url,admin=false){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,title,body,pinned,image_keys,status,created_by,created_at,updated_at FROM notice_posts WHERE status<>'deleted'",args=[];
  if(!admin)sql+=" AND status='published'";
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=['%'+q+'%','%'+q+'%']}
  sql+=' ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT '+(admin?'300':'100');
  const rows=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const items=rows.map(r=>({id:Number(r.id),title:r.title||'',body:r.body||'',pinned:Boolean(r.pinned),imageUrls:mediaUrls(r.image_keys),status:r.status||'published',createdAt:r.created_at,updatedAt:r.updated_at,...(admin?{createdBy:r.created_by||''}:{})}));
  return json({ok:true,boardId:'seonammedi.notice',storage:'independent-board-d1',items:await listBoardDiscussionComments(env,'notices',items)});
}
async function createNotice(req,env){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const b=await body(req),title=text(b.title).slice(0,180),copy=text(b.body).slice(0,12000);if(!title)return json({ok:false,error:'title_required'},400);
  const t=now(),r=await env.BOARD_DB.prepare('INSERT INTO notice_posts(title,body,pinned,image_keys,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(title,copy,b.pinned?1:0,'[]','published',text(gate.auth?.email).slice(0,200),t,t).run();
  const id=Number(r.meta.last_row_id||0),keys=await saveImages(env,'notices',id,Array.isArray(b.images)?b.images:[]);
  if(keys.length)await env.BOARD_DB.prepare('UPDATE notice_posts SET image_keys=? WHERE id=?').bind(JSON.stringify(keys),id).run();
  return json({ok:true,id},201);
}
async function updateNotice(req,env,id){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const b=await body(req),title=text(b.title).slice(0,180),copy=text(b.body).slice(0,12000);if(!title)return json({ok:false,error:'title_required'},400);
  const found=await env.BOARD_DB.prepare("SELECT id,image_keys FROM notice_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  let keys=imageKeys(found.image_keys);
  if(Array.isArray(b.images)&&b.images.length&&keys.length<MEDIA_MAX){const added=await saveImages(env,'notices',id,b.images.slice(0,MEDIA_MAX-keys.length));keys=keys.concat(added).slice(0,MEDIA_MAX)}
  await env.BOARD_DB.prepare('UPDATE notice_posts SET title=?,body=?,pinned=?,image_keys=?,updated_at=? WHERE id=?').bind(title,copy,b.pinned?1:0,JSON.stringify(keys),now(),id).run();
  return json({ok:true,id});
}
async function deleteNotice(req,env,id){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const found=await env.BOARD_DB.prepare("SELECT id,image_keys FROM notice_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  await deleteImages(env,found.image_keys);await env.BOARD_DB.prepare("UPDATE notice_posts SET status='deleted',image_keys='[]',updated_at=? WHERE id=?").bind(now(),id).run();
  await env.BOARD_DB.prepare("UPDATE board_discussion_comments SET status='deleted',updated_at=? WHERE board_kind='notices' AND post_id=? AND status='published'").bind(now(),id).run();
  return json({ok:true,id});
}

const boardCss='*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-size:15px;line-height:1.5}a{color:#111;text-decoration:none}.site-header{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #d9d9d9;padding:0 14px}.site-header>.brand,.site-header>nav{width:min(1180px,100%);margin:0 auto}.site-header>.brand{display:flex;align-items:baseline;gap:10px;min-height:48px;padding:9px 0 6px}.site-header>.brand strong{font-size:18px;font-weight:800;letter-spacing:-.02em}.site-header>.brand small{font-size:12px;color:#666}.site-header>nav{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;padding:8px 0;border-top:1px solid #eee}.site-header>nav a{font-size:14px;padding:2px 0}.site-header>nav a.active{font-weight:800;border-bottom:2px solid #111}main{width:min(1180px,calc(100% - 28px));margin:0 auto;padding:14px 0 30px}.board-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:8px 0 14px;border-bottom:1px solid #ddd}.board-head .eyebrow{margin:0 0 3px;font-size:11px;font-weight:800;letter-spacing:.08em}.board-head h1{margin:0;font-size:25px;letter-spacing:-.03em}.board-head .note{margin:5px 0 0;color:#555;font-size:13px}.board-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}button{appearance:none;border:1px solid #111;border-radius:6px;background:#111;color:#fff;padding:8px 12px;font-weight:700;cursor:pointer}button.secondary,.share-btn{background:#fff;color:#111}.board-panel{margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff}.board-panel[hidden]{display:none}.board-panel label{display:block;margin:6px 0}.board-panel input,.board-panel select,.board-panel textarea{width:100%;padding:9px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#111}.board-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.board-row,.voice-card{padding:16px 0;border-bottom:1px solid #e5e5e5}.row-head,.voice-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.row-body,.voice-message{white-space:pre-wrap;line-height:1.58;margin:8px 0}.voice-message{font-size:15px}.admin-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.money-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.money-grid article{border:1px solid #ddd;border-radius:7px;padding:10px;background:#fff}.money-grid span{display:block;font-size:12px;color:#666}.money-grid strong{display:block;margin-top:3px;font-size:18px}.status{min-height:22px;padding:7px 0;color:#555;font-size:13px}.form-grid{display:grid;grid-template-columns:180px 1fr;gap:8px}.form-grid textarea{grid-column:1/-1;min-height:110px}.reply-list{margin:10px 0 0;padding:0 0 0 16px;border-left:2px solid #e8e8e8}.reply{padding:8px 0}.reply+.reply{border-top:1px solid #f0f0f0}.reply p{margin:4px 0;white-space:pre-wrap;line-height:1.55}.reply-form{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:7px;margin-top:10px;align-items:stretch}.reply-form input,.reply-form textarea{width:100%;border:1px solid #bbb;border-radius:6px;padding:9px}.reply-form textarea{min-height:44px;resize:vertical}.meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.badge{font-size:11px;border:1px solid #bbb;border-radius:999px;padding:2px 7px}.search-row{display:flex;gap:7px}.search-row input{flex:1}.empty{padding:28px 0;color:#666}.voice-images,.notice-images,.image-preview{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:9px 0}.voice-images img,.notice-images img,.image-preview img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid #ddd;border-radius:7px;background:#f7f7f7}.image-preview:empty{display:none}.shared-target{outline:2px solid #111;outline-offset:5px;border-radius:2px}.footer-shell{border-top:1px solid #ddd;margin-top:20px;background:#fff}.footer-inner{width:min(1180px,calc(100% - 28px));margin:0 auto;padding:14px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;font-size:12px;color:#666}.footer-copy{display:flex;flex-direction:column;align-items:flex-start;line-height:1.4}.footer-copy strong{color:#333}.footer-copy span{margin-top:2px}.footer-inner a{font-weight:800;align-self:flex-start;white-space:nowrap}@media(max-width:640px){body{font-size:16px}.site-header{padding:0 10px}.site-header>.brand{display:block;min-height:auto;padding:8px 0 6px}.site-header>.brand strong{display:block;font-size:16px}.site-header>.brand small{display:block;margin-top:2px;font-size:11px}.site-header>nav{gap:12px;padding:7px 0}.site-header>nav a{font-size:14px}main{width:calc(100% - 20px);padding-top:10px}.board-head{display:block}.board-head h1{font-size:22px}.board-actions{margin-top:9px;justify-content:flex-start}.board-grid,.money-grid,.form-grid{grid-template-columns:1fr}.form-grid textarea{grid-column:auto}.reply-form{grid-template-columns:1fr auto}.reply-form input,.reply-form textarea{grid-column:1/-1}.reply-form button{grid-column:2}.row-head,.voice-head{align-items:flex-start}.voice-images,.notice-images,.image-preview{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-inner{width:calc(100% - 20px);padding:12px 0}.footer-copy{max-width:calc(100% - 54px)}}.site-header.independent-board-header{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:24px;padding:9px max(20px,calc((100vw - 1120px)/2))}.site-header.independent-board-header>.brand{display:flex;flex:0 1 auto;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;width:auto;max-width:100%;min-width:0;min-height:0;margin:0;padding:0}.site-header.independent-board-header>nav{display:flex;flex:0 1 auto;align-items:center;justify-content:flex-end;flex-wrap:nowrap;gap:14px;width:auto;max-width:100%;min-width:0;margin:0;padding:0;border:0;overflow-x:auto;scrollbar-width:none}.site-header.independent-board-header>nav a[aria-current="page"]{color:#111;font-weight:800;border-bottom:2px solid #111}@media(max-width:760px){.site-header.independent-board-header{flex-direction:column;align-items:stretch;gap:8px;padding:10px max(16px,env(safe-area-inset-left))}.site-header.independent-board-header>.brand{display:flex;flex-direction:column;align-items:flex-start;width:100%;flex:auto;gap:2px}.site-header.independent-board-header>nav{flex:none;justify-content:flex-start;gap:12px;width:100%;max-width:100%;padding:6px 0 0;border-top:1px solid #eee}}'
function nav(active,req){
  const link=(href,label,key)=>'<a'+(active===key?' class="active" aria-current="page"':'')+' href="'+href+'">'+label+'</a>';
  return '<header class="site-header independent-board-header"><a class="brand" href="'+sitePath(req)+'"><strong>서남권 국립의대 소통센터</strong><small>서남권 의대 설립 비상대책위원회 관련 공개 기록·소통 채널</small></a><nav aria-label="주요 메뉴"><a href="'+sitePath(req,'/#timeline')+'">활동이력</a><a href="'+sitePath(req,'/#channels')+'">소통채널</a>'+link(boardPath(req,'voices'),'시민의견','voices')+link(boardPath(req,'finance'),'회계','finance')+link(boardPath(req,'notices'),'공지','notices')+'<a href="'+sitePath(req,'/#organization')+'">조직</a></nav></header>';
}
const footer='<footer class="footer-shell"><div class="footer-inner"><div class="footer-copy"><strong>서남권 국립의대 소통센터</strong><span>자료의 성격과 출처를 구분해 보존합니다.</span></div><a id="adminLink" href="/admin/">관리</a></div></footer>';
function shell(req,active,title,eyebrow,note,controls,content,script){
  return new Response('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' · 서남권 국립의대 소통센터</title><link rel="stylesheet" href="'+sitePath(req,'/app.css?v=20261006-domain-routing-2')+'"><style>'+boardCss+'</style></head><body>'+nav(active,req)+'<main><section class="board-head"><div><p class="eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p class="note">'+note+'</p></div><div class="board-actions">'+controls+'</div></section>'+content+'</main>'+footer+'<script>'+script+'<\/script></body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-independent':'true'}});
}
function commonScript(returnPath){
  return 'const byId=id=>document.getElementById(id),esc=v=>String(v==null?"":v).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",\'"\':"&quot;"}[c]));function token(){try{const raw=localStorage.getItem("sb-renzehysxirjilvdxacv-auth-token")||"";if(raw){const parsed=JSON.parse(raw),session=parsed&&((parsed.currentSession)||(parsed.session)||parsed),access=String(session&&session.access_token||"");if(access)return access}}catch{}try{return sessionStorage.getItem("ekodi-auth-token")||""}catch{return""}}function mounted(url){return url.startsWith("/board/")&&(location.pathname.startsWith("/seonammedi/board")?"/seonammedi":"")+url||url}async function call(url,options){const r=await fetch(mounted(url),options||{}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.message||d.error||"요청을 처리하지 못했습니다.");return d}function login(){const u=new URL("https://ekodi.kr/auth/");u.searchParams.set("site","seonammedi");u.searchParams.set("direct","1");u.searchParams.set("return_to",location.origin+(location.pathname.startsWith("/seonammedi/board")?"/seonammedi":"")+"'+returnPath+'");u.searchParams.set("purpose","seonammedi-board-admin");location.assign(u.href)}document.getElementById("adminLink")?.addEventListener("click",e=>{e.preventDefault();login()});async function exchange(){const p=new URLSearchParams(location.hash.replace(/^#/,"")),h=p.get("ekodi_token");if(!h)return;const type=p.get("ekodi_type")||"email";history.replaceState(null,"",location.pathname+location.search);const r=await fetch("https://renzehysxirjilvdxacv.supabase.co/auth/v1/verify",{method:"POST",headers:{"content-type":"application/json",apikey:"sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_"},body:JSON.stringify({token_hash:h,type})}),d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.msg||d.error||"관리자 로그인 연결에 실패했습니다.");localStorage.setItem("sb-renzehysxirjilvdxacv-auth-token",JSON.stringify({access_token:d.access_token,refresh_token:d.refresh_token||"",expires_at:Number(d.expires_at||0)||Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:d.user||null}))}';
}

function boardPage(req){
  const content='<form id="writeForm" class="board-panel" hidden><div class="form-grid"><select name="category"><option value="question">질문</option><option value="proposal">정책제안</option><option value="experience">의료경험</option><option value="factcheck">사실확인 요청</option><option value="tip">자료제보</option><option value="other">기타</option></select><input name="name" maxlength="80" placeholder="이름 또는 표시명 (익명 가능)"><textarea name="message" maxlength="12000" required placeholder="시민의견을 입력해 주세요"></textarea></div><label>사진 최대 5장 · 등록 전에 자동으로 용량을 줄입니다.<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="imagePreview" class="image-preview"></div><div class="admin-actions"><button type="submit">등록</button><button id="writeCancel" class="secondary" type="button">취소</button></div></form><form id="searchForm" class="board-panel" hidden><div class="search-row"><input name="q" maxlength="120" required placeholder="제목 또는 내용 검색"><button type="submit">검색</button><button id="searchReset" class="secondary" type="button">전체</button></div></form><div id="status" class="status"></div><section id="voiceList"><p class="empty">시민의견을 불러오는 중입니다.</p></section>';
  const script='(function(){'+commonScript('/board/voices')+'const list=byId("voiceList"),status=byId("status"),write=byId("writeForm"),search=byId("searchForm"),adminLogin=byId("adminLogin"),labels={question:"질문",proposal:"정책제안",experience:"의료경험",factcheck:"사실확인 요청",tip:"자료제보",other:"기타"};let adminItems=null,writer=false;async function refreshWriter(){const t=token();if(t)try{const d=await call("/board/api/auth/me",{headers:{authorization:"Bearer "+t}});writer=d.authenticated===true}catch{writer=false}byId("writeToggle").textContent=writer?"의견 등록":"로그인 후 의견 등록";adminLogin.hidden=writer}function dt(v){try{return new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Seoul"}).format(new Date(v))}catch{return""}}async function compress(file){if(!file||!file.type.startsWith("image/"))return null;const u=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const x=new Image;x.onload=()=>resolve(x);x.onerror=reject;x.src=u}),scale=Math.min(1,1600/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);let q=.82,blob=null;for(let i=0;i<5;i++){blob=await new Promise(r=>c.toBlob(r,"image/jpeg",q));if(blob&&blob.size<=1600000)break;q-=.12}if(!blob||blob.size>1600000)throw new Error("사진 용량을 1.6MB 이하로 줄이지 못했습니다.");return await new Promise((resolve,reject)=>{const fr=new FileReader;fr.onload=()=>resolve({type:"image/jpeg",data:fr.result});fr.onerror=reject;fr.readAsDataURL(blob)})}finally{URL.revokeObjectURL(u)}}function preview(){const fs=Array.from(write.elements.images.files||[]).slice(0,5);byId("imagePreview").innerHTML=fs.map(f=>\'<img src="\'+URL.createObjectURL(f)+\'" alt="첨부사진 미리보기">\').join("")}function sharedUrl(id){const u=new URL(location.href);u.hash="";u.searchParams.set("id",id);return u.href}async function share(item){const u=sharedUrl(item.id);try{if(navigator.share)await navigator.share({title:"시민의견",text:item.message||"",url:u});else{await navigator.clipboard.writeText(u);alert("공유 링크를 복사했습니다.")}}catch{}}function focusShared(){const id=Number(new URLSearchParams(location.search).get("id")||0),el=id&&byId("voice-"+id);if(el){el.classList.add("shared-target");setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"center"}),30)}}function render(items,admin){if(!items||!items.length){list.innerHTML=\'<p class="empty">등록된 시민의견이 없습니다.</p>\';return}list.innerHTML=items.map(item=>{const replies=(item.replies||[]).filter(r=>!r.status||r.status==="published").map(r=>\'<div class="reply"><div class="meta"><strong>\'+esc(r.displayName||"익명")+\'</strong><small>\'+esc(dt(r.createdAt))+\'</small>\'+(admin?\'<button class="secondary reply-admin" type="button" data-reply-delete="\'+Number(r.id)+\'" data-post="\'+Number(item.id)+\'">답글 삭제</button>\':"")+\'</div><p>\'+esc(r.message||"")+\'</p></div>\').join("");const images=(item.imageUrls||[]).length?\'<div class="voice-images">\'+item.imageUrls.map(u=>\'<img src="\'+esc(mounted(u))+\'" alt="시민의견 첨부사진" loading="lazy">\').join("")+\'</div>\':"";const buttons=(admin?\'<button data-edit="\'+item.id+\'">수정</button><button class="secondary" data-delete="\'+item.id+\'">삭제</button>\':"");return \'<article class="voice-card" id="voice-\'+item.id+\'"><div class="voice-head"><div class="meta"><strong>\'+esc(item.displayName||"익명")+\'</strong><span class="badge">\'+esc(labels[item.category]||"기타")+\'</span></div><small>\'+esc(dt(item.createdAt))+\'</small></div><p class="voice-message">\'+esc(item.message||"")+\'</p>\'+images+\'<div class="admin-actions"><button class="secondary share-btn" type="button" data-share="\'+item.id+\'">공유</button>\'+buttons+\'</div><div class="reply-list">\'+replies+\'</div><form class="reply-form" data-reply="\'+item.id+\'"><input name="name" placeholder="이름 (익명 가능)"><textarea name="message" required placeholder="답글을 입력해 주세요"></textarea><button>답글 등록</button></form></article>\'}).join("");if(!writer)for(const form of list.querySelectorAll(".reply-form")){const message=document.createElement("p");message.className="reply-login";message.textContent="답글은 로그인 후 작성할 수 있습니다.";form.replaceWith(message)}focusShared()}async function load(q){let d=await call("/board/api/posts"+(q?"?q="+encodeURIComponent(q):""));render(d.items||[],false);if(q)return;const t=token();if(t)try{d=await call("/board/api/admin/posts",{headers:{authorization:"Bearer "+t}});adminItems=d.items||[];render(adminItems,true);adminLogin.hidden=true;status.textContent="관리자 관리 기능이 활성화되었습니다."}catch{}}byId("writeToggle").onclick=()=>{if(!writer){login();return}write.hidden=!write.hidden;search.hidden=true};byId("writeCancel").onclick=()=>{write.reset();byId("imagePreview").innerHTML="";write.hidden=true};byId("searchToggle").onclick=()=>{search.hidden=!search.hidden;write.hidden=true};byId("searchReset").onclick=()=>{search.reset();search.hidden=true;load()};write.elements.images.onchange=preview;adminLogin.onclick=login;write.onsubmit=async e=>{e.preventDefault();if(!writer){login();return}const fd=new FormData(write),chosen=Array.from(fd.getAll("images")).filter(x=>x&&x.size).slice(0,5),images=[];status.textContent=chosen.length?"사진 용량을 줄이는 중입니다…":"";for(const file of chosen){const image=await compress(file);if(image)images.push(image)}const d={category:fd.get("category"),name:fd.get("name"),message:fd.get("message"),images};await call("/board/api/posts",{method:"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)});write.reset();byId("imagePreview").innerHTML="";write.hidden=true;status.textContent="";await load()};search.onsubmit=e=>{e.preventDefault();load(new FormData(search).get("q"))};list.addEventListener("submit",async e=>{const f=e.target.closest("[data-reply]");if(!f)return;e.preventDefault();if(!writer){login();return}const d=Object.fromEntries(new FormData(f));await call("/board/api/posts/"+f.dataset.reply+"/replies",{method:"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)});await load()});list.addEventListener("click",async e=>{const t=token(),shareBtn=e.target.closest("[data-share]"),edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]"),rd=e.target.closest("[data-reply-delete]");if(shareBtn){const pool=adminItems||[];let x=pool.find(v=>v.id===Number(shareBtn.dataset.share));if(!x){const d=await call("/board/api/posts");x=(d.items||[]).find(v=>v.id===Number(shareBtn.dataset.share))}if(x)await share(x);return}if(edit){const x=adminItems.find(v=>v.id===Number(edit.dataset.edit)),next=prompt("수정할 내용을 입력하세요.",x.message||"");if(next===null)return;await call("/board/api/admin/posts/"+x.id,{method:"PUT",headers:{authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify({...x,message:next})});await load()}if(del&&confirm("이 시민의견을 삭제할까요?")){await call("/board/api/admin/posts/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load()}if(rd&&confirm("이 답글을 삭제할까요?")){await call("/board/api/admin/posts/"+rd.dataset.post+"/replies/"+rd.dataset.replyDelete,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load()}});(async()=>{try{await exchange()}catch(e){status.textContent=e.message}adminLogin.hidden=false;await refreshWriter();await load()})()})();';
  return shell(req,'voices','시민의견','CITIZEN VOICES','누구나 로그인 없이 열람·공유할 수 있으며, 글쓰기와 답글은 로그인 후 가능합니다. 등록 관리자는 수정·삭제할 수 있습니다.','<button id="writeToggle">로그인 후 의견 등록</button><button id="searchToggle" class="secondary">검색</button><button id="adminLogin" class="secondary">Google 로그인</button>',content,script);
}
function financePage(req){
  const content=String.raw`
<section id="summaryPanel" class="board-panel">
  <div class="row-head"><div><strong>총괄내역</strong><small id="summaryAccess">누구나 공개 회계내역을 확인할 수 있습니다.</small></div></div>
  <section class="money-grid"><article><span>누적 수입</span><strong id="raised">-</strong></article><article><span>누적 지출</span><strong id="spent">-</strong></article><article><span>현재 잔액</span><strong id="balance">-</strong></article></section>
</section>
<section class="board-panel"><strong>공개 회계내역</strong><p class="note">공개로 등록된 내역만 열람·공유할 수 있습니다. 내부 증빙과 관리정보는 공개되지 않습니다.</p><section id="list"></section></section>
<section id="adminDetail" class="board-panel" hidden>
  <strong>회계 관리</strong><small>관리자만 볼 수 있습니다 · 증빙 상태 및 내부 관리</small>
  <form id="writeForm" class="board-panel" hidden>
    <input type="hidden" name="id">
    <div class="board-grid">
      <label>일자<input name="date" type="date" required></label>
      <label>구분<select name="type"><option value="income">수입</option><option value="expense">지출</option></select></label>
      <label>금액<input name="amount" type="number" min="0" step="1" required></label>
    </div>
    <label>목적·내용<input name="purpose" maxlength="500" required></label>
    <label>관련 행사<input name="event" maxlength="300"></label>
    <label>증빙<select name="evidenceStatus"><option value="none">미등록</option><option value="held">증빙보유</option><option value="verified">확인완료</option></select></label>
    <label>공개 메모<textarea name="note" rows="4" maxlength="1000"></textarea></label>
    <div class="admin-actions"><button type="submit">저장</button><button id="cancel" class="secondary" type="button">취소</button></div>
  </form>
</section>
<div id="status" class="status" role="status"></div>
`;
  const script='(function(){'+commonScript('/board/finance')+String.raw`
const form=byId("writeForm"),list=byId("list"),status=byId("status"),detail=byId("adminDetail"),
  summaryAccess=byId("summaryAccess"),writeToggle=byId("writeToggle"),adminLogin=byId("adminLogin"),
  fmt=n=>new Intl.NumberFormat("ko-KR").format(Number(n||0))+"원";
let admin=false,member=false,items=[];
function renderSummary(d){
  byId("raised").textContent=fmt(d.summary?.raised);
  byId("spent").textContent=fmt(d.summary?.spent);
  byId("balance").textContent=fmt(d.summary?.balance);
}
function sharedUrl(id){
  const u=new URL(location.href);u.hash="";u.searchParams.set("id",id);return u.href;
}
async function share(item){
  const u=sharedUrl(item.id);
  try{
    if(navigator.share)await navigator.share({title:"서남권 국립의대 회계",text:item.purpose||"",url:u});
    else{await navigator.clipboard.writeText(u);alert("공유 링크를 복사했습니다.")}
  }catch{}
}
function focusShared(){
  const id=Number(new URLSearchParams(location.search).get("id")||0),el=id&&byId("finance-"+id);
  if(el){el.classList.add("shared-target");setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"center"}),30)}
}
function render(d){
  renderSummary(d);items=d.items||[];
  summaryAccess.textContent=admin?"관리자 권한 · 총괄내역과 세부내역 확인 가능":"누구나 확인할 수 있는 공개 회계내역입니다.";
  detail.hidden=!admin;
  list.innerHTML=items.length?items.map(x=>{
    const comments=(x.comments||[]).map(c=>'<div class="reply"><div class="meta"><strong>'+esc(c.displayName||"회원")+'</strong><small>'+esc((c.createdAt||"").slice(0,16))+'</small>'
      +(admin?'<button class="secondary" data-comment-edit="'+c.id+'" data-post="'+x.id+'">댓글 수정</button><button class="secondary" data-comment-delete="'+c.id+'" data-post="'+x.id+'">댓글 삭제</button>':"")+'</div><p>'+esc(c.message||"")+'</p></div>').join("");
    const actions='<div class="admin-actions"><button class="secondary share-btn" type="button" data-share="'+x.id+'">공유</button>'
      +(admin?'<button type="button" data-edit="'+x.id+'">수정</button><button class="secondary" type="button" data-delete="'+x.id+'">삭제</button>':"")+'</div>';
    const reply=member?'<form class="reply-form" data-comment="'+x.id+'"><textarea name="message" maxlength="2000" required aria-label="회계 댓글" placeholder="댓글을 입력해 주세요"></textarea><button type="submit">댓글 등록</button></form>'
      :'<p class="reply-login">댓글은 로그인 후 작성할 수 있습니다.</p>';
    return '<article class="board-row" id="finance-'+x.id+'"><div class="row-head"><strong>'+(x.type==="income"?"수입 ":"지출 ")+fmt(x.amount)+'</strong><span>'+esc(x.date||"")+'</span></div>'
      +'<p class="row-body">'+esc(x.purpose||"")+'</p>'+(x.event?'<p>'+esc(x.event)+'</p>':"")+(x.note?'<p class="row-body">'+esc(x.note)+'</p>':"")
      +(admin?'<small>증빙 상태: '+esc(x.evidenceStatus||"none")+'</small>':"")
      +actions+'<div class="reply-list">'+comments+'</div>'+reply+'</article>';
  }).join(""):'<p class="empty">등록된 공개 회계내역이 없습니다.</p>';
  focusShared();
}
async function load(){
  const t=token();admin=false;member=false;writeToggle.hidden=true;
  if(t){
    try{const me=await call("/board/api/auth/me",{headers:{authorization:"Bearer "+t}});member=me.authenticated===true}catch{}
    if(member)try{const d=await call("/board/api/admin/finance",{headers:{authorization:"Bearer "+t}});admin=true;render(d)}catch{}
  }
  if(!admin)render(await call("/board/api/finance"));
  detail.hidden=!admin;writeToggle.hidden=!admin;adminLogin.hidden=member;
  adminLogin.textContent="Google 로그인";
}
writeToggle.onclick=()=>{if(!admin)return;form.hidden=!form.hidden};
adminLogin.onclick=login;
byId("cancel").onclick=()=>{form.reset();form.elements.id.value="";form.hidden=true};
form.onsubmit=async e=>{
  e.preventDefault();if(!admin)return;
  try{
    const d=Object.fromEntries(new FormData(form)),id=Number(d.id||0);
    await call(id?"/board/api/admin/finance/"+id:"/board/api/admin/finance",{
      method:id?"PUT":"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)
    });
    form.reset();form.elements.id.value="";form.hidden=true;await load();
  }catch(error){status.textContent=error.message}
};
list.addEventListener("submit",async e=>{
  const f=e.target.closest("[data-comment]");if(!f)return;e.preventDefault();
  if(!member){login();return}
  try{
    const d=await call("/board/api/finance/"+f.dataset.comment+"/comments",{
      method:"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},
      body:JSON.stringify({message:new FormData(f).get("message")})
    });
    status.textContent=d.queued?"댓글이 접수되었습니다. 저장 후 공개됩니다.":"댓글이 등록되었습니다.";
    await load();
  }catch(error){status.textContent=error.message}
});
list.addEventListener("click",async e=>{
  const shareBtn=e.target.closest("[data-share]"),edit=e.target.closest("[data-edit]"),
    del=e.target.closest("[data-delete]"),commentEdit=e.target.closest("[data-comment-edit]"),
    commentDel=e.target.closest("[data-comment-delete]");
  if(shareBtn){const x=items.find(v=>v.id===Number(shareBtn.dataset.share));if(x)await share(x);return}
  if(!admin)return;
  try{
    if(edit){
      const x=items.find(v=>v.id===Number(edit.dataset.edit));if(!x)return;
      for(const k of ["date","type","amount","purpose","event","evidenceStatus","note"])form.elements[k].value=x[k]??"";
      form.elements.id.value=x.id;form.hidden=false;detail.hidden=false;return;
    }
    if(del&&confirm("이 회계내역을 삭제할까요?")){
      await call("/board/api/admin/finance/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load();return;
    }
    if(commentEdit){
      const p=items.find(v=>v.id===Number(commentEdit.dataset.post)),c=p?.comments?.find(v=>v.id===Number(commentEdit.dataset.commentEdit));
      if(!c)return;const next=prompt("수정할 댓글을 입력하세요.",c.message||"");if(next===null)return;
      await call("/board/api/admin/finance/"+p.id+"/comments/"+c.id,{method:"PUT",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify({message:next})});await load();return;
    }
    if(commentDel&&confirm("이 댓글을 삭제할까요?")){
      await call("/board/api/admin/finance/"+commentDel.dataset.post+"/comments/"+commentDel.dataset.commentDelete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load();
    }
  }catch(error){status.textContent=error.message}
});
(async()=>{try{await exchange()}catch(e){status.textContent=e.message}try{await load()}catch(e){status.textContent=e.message}})();
})();`;
  return shell(req,'finance','회계','TRANSPARENCY',
    '누구나 공개 총괄내역과 공개 회계내역을 열람·공유할 수 있으며, 로그인 후 댓글을 작성할 수 있습니다. 등록 관리자는 전체 수정·삭제가 가능합니다.',
    '<button id="writeToggle" hidden>회계내역 추가</button><button id="adminLogin" class="secondary">Google 로그인</button>',
    content,script);
}

function noticesPage(req){
  const content=String.raw`
<form id="writeForm" class="board-panel" hidden>
  <input type="hidden" name="id">
  <label>제목<input name="title" maxlength="180" required></label>
  <label><input name="pinned" type="checkbox"> 중요공지로 고정</label>
  <label>사진 최대 5장 · 등록 전에 자동으로 용량을 줄입니다.<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
  <div id="imagePreview" class="image-preview"></div>
  <label>내용<textarea name="body" rows="7" maxlength="12000"></textarea></label>
  <div class="admin-actions"><button type="submit">저장</button><button id="cancel" class="secondary" type="button">취소</button></div>
</form>
<div id="status" class="status" role="status"></div>
<section id="list"></section>
`;
  const script='(function(){'+commonScript('/board/notices')+String.raw`
const form=byId("writeForm"),list=byId("list"),status=byId("status"),
  writeToggle=byId("writeToggle"),adminLogin=byId("adminLogin");
let admin=false,member=false,items=[];
async function compress(file){
  if(!file||!file.type.startsWith("image/"))return null;
  const u=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image;x.onload=()=>resolve(x);x.onerror=reject;x.src=u}),
      scale=Math.min(1,1600/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),
      c=document.createElement("canvas");
    c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    let q=.82,blob=null;
    for(let i=0;i<5;i++){blob=await new Promise(r=>c.toBlob(r,"image/jpeg",q));if(blob&&blob.size<=1600000)break;q-=.12}
    if(!blob||blob.size>1600000)throw new Error("사진 용량을 1.6MB 이하로 줄이지 못했습니다.");
    return await new Promise((resolve,reject)=>{const fr=new FileReader;fr.onload=()=>resolve({type:"image/jpeg",data:fr.result});fr.onerror=reject;fr.readAsDataURL(blob)});
  }finally{URL.revokeObjectURL(u)}
}
function preview(){
  const fs=Array.from(form.elements.images.files||[]).slice(0,5);
  byId("imagePreview").innerHTML=fs.map(f=>'<img src="'+URL.createObjectURL(f)+'" alt="첨부사진 미리보기">').join("");
}
function sharedUrl(id){
  const u=new URL(location.href);u.hash="";u.searchParams.set("id",id);return u.href;
}
async function share(x){
  const u=sharedUrl(x.id);
  try{
    if(navigator.share)await navigator.share({title:x.title||"공지",text:x.body||"",url:u});
    else{await navigator.clipboard.writeText(u);alert("공유 링크를 복사했습니다.")}
  }catch{}
}
function focusShared(){
  const id=Number(new URLSearchParams(location.search).get("id")||0),el=id&&byId("notice-"+id);
  if(el){el.classList.add("shared-target");setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"center"}),30)}
}
function render(d){
  items=d.items||[];
  list.innerHTML=items.length?items.map(x=>{
    const comments=(x.comments||[]).map(c=>'<div class="reply"><div class="meta"><strong>'+esc(c.displayName||"회원")+'</strong><small>'+esc((c.createdAt||"").slice(0,16))+'</small>'
      +(admin?'<button class="secondary" type="button" data-comment-edit="'+c.id+'" data-post="'+x.id+'">댓글 수정</button><button class="secondary" type="button" data-comment-delete="'+c.id+'" data-post="'+x.id+'">댓글 삭제</button>':"")+'</div><p>'+esc(c.message||"")+'</p></div>').join("");
    const reply=member?'<form class="reply-form" data-comment="'+x.id+'"><textarea name="message" maxlength="2000" required aria-label="공지 댓글" placeholder="댓글을 입력해 주세요"></textarea><button type="submit">댓글 등록</button></form>'
      :'<p class="reply-login">댓글은 로그인 후 작성할 수 있습니다.</p>';
    return '<article class="board-row" id="notice-'+x.id+'"><div class="row-head"><strong>'+(x.pinned?"[중요] ":"")+esc(x.title||"")+'</strong><small>'+esc((x.updatedAt||"").slice(0,10))+'</small></div>'
      +'<p class="row-body">'+esc(x.body||"")+'</p>'
      +((x.imageUrls||[]).length?'<div class="notice-images">'+x.imageUrls.map(u=>'<img src="'+esc(mounted(u))+'" alt="공지 첨부사진" loading="lazy">').join("")+'</div>':"")
      +'<div class="admin-actions"><button class="secondary share-btn" type="button" data-share="'+x.id+'">공유</button>'
      +(admin?'<button type="button" data-edit="'+x.id+'">수정</button><button class="secondary" type="button" data-delete="'+x.id+'">삭제</button>':"")+'</div>'
      +'<div class="reply-list">'+comments+'</div>'+reply+'</article>';
  }).join(""):'<p class="empty">등록된 공지가 없습니다.</p>';
  focusShared();
}
async function load(){
  const t=token();member=false;admin=false;let d;
  if(t){
    try{const me=await call("/board/api/auth/me",{headers:{authorization:"Bearer "+t}});member=me.authenticated===true}catch{}
    if(member)try{d=await call("/board/api/admin/notices",{headers:{authorization:"Bearer "+t}});admin=true}catch{}
  }
  if(!d)d=await call("/board/api/notices");
  writeToggle.hidden=!admin;adminLogin.hidden=member;render(d);
}
writeToggle.onclick=()=>{if(!admin)return;form.hidden=!form.hidden};
adminLogin.onclick=login;
byId("cancel").onclick=()=>{form.reset();form.elements.id.value="";byId("imagePreview").innerHTML="";form.hidden=true};
form.elements.images.onchange=preview;
form.onsubmit=async e=>{
  e.preventDefault();if(!admin)return;
  try{
    const fd=new FormData(form),chosen=Array.from(fd.getAll("images")).filter(x=>x&&x.size).slice(0,5),images=[];
    status.textContent=chosen.length?"사진 용량을 줄이는 중입니다…":"";
    for(const file of chosen){const image=await compress(file);if(image)images.push(image)}
    const d={title:fd.get("title"),body:fd.get("body"),pinned:fd.get("pinned")==="on",images},id=Number(fd.get("id")||0);
    await call(id?"/board/api/admin/notices/"+id:"/board/api/admin/notices",{
      method:id?"PUT":"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)
    });
    form.reset();form.elements.id.value="";byId("imagePreview").innerHTML="";form.hidden=true;status.textContent="";await load();
  }catch(error){status.textContent=error.message}
};
list.addEventListener("submit",async e=>{
  const f=e.target.closest("[data-comment]");if(!f)return;e.preventDefault();
  if(!member){login();return}
  try{
    const d=await call("/board/api/notices/"+f.dataset.comment+"/comments",{
      method:"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},
      body:JSON.stringify({message:new FormData(f).get("message")})
    });
    status.textContent=d.queued?"댓글이 접수되었습니다. 저장 후 공개됩니다.":"댓글이 등록되었습니다.";
    await load();
  }catch(error){status.textContent=error.message}
});
list.addEventListener("click",async e=>{
  const shareBtn=e.target.closest("[data-share]"),edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]"),
    commentEdit=e.target.closest("[data-comment-edit]"),commentDel=e.target.closest("[data-comment-delete]");
  if(shareBtn){const x=items.find(v=>v.id===Number(shareBtn.dataset.share));if(x)await share(x);return}
  if(!admin)return;
  try{
    if(edit){
      const x=items.find(v=>v.id===Number(edit.dataset.edit));if(!x)return;
      form.elements.id.value=x.id;form.elements.title.value=x.title||"";
      form.elements.body.value=x.body||"";form.elements.pinned.checked=!!x.pinned;form.hidden=false;return;
    }
    if(del&&confirm("이 공지를 삭제할까요?")){
      await call("/board/api/admin/notices/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load();return;
    }
    if(commentEdit){
      const p=items.find(v=>v.id===Number(commentEdit.dataset.post)),c=p?.comments?.find(v=>v.id===Number(commentEdit.dataset.commentEdit));
      if(!c)return;const next=prompt("수정할 댓글을 입력하세요.",c.message||"");if(next===null)return;
      await call("/board/api/admin/notices/"+p.id+"/comments/"+c.id,{method:"PUT",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify({message:next})});await load();return;
    }
    if(commentDel&&confirm("이 댓글을 삭제할까요?")){
      await call("/board/api/admin/notices/"+commentDel.dataset.post+"/comments/"+commentDel.dataset.commentDelete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load();
    }
  }catch(error){status.textContent=error.message}
});
(async()=>{try{await exchange()}catch(e){status.textContent=e.message}try{await load()}catch(e){status.textContent=e.message}})();
})();`;
  return shell(req,'notices','공지','NOTICE BOARD',
    '누구나 공지를 열람·공유할 수 있으며, 로그인 후 댓글을 작성할 수 있습니다. 등록 관리자는 전체 수정·삭제가 가능합니다.',
    '<button id="writeToggle" hidden>공지 작성</button><button id="adminLogin" class="secondary">Google 로그인</button>',
    content,script);
}

export default {async fetch(req,env){
  const authReturn=await boardAuthReturn(req);if(authReturn)return authReturn;
  const url=new URL(req.url),path=pathOf(req);
  if((path==='/'||path==='/voices'||path==='/voices/')&&req.method==='GET')return boardPage(req);
  if((path==='/finance'||path==='/finance/')&&req.method==='GET')return financePage(req);
  if((path==='/notices'||path==='/notices/')&&req.method==='GET')return noticesPage(req);
  if(path==='/health'&&req.method==='GET'){
    const commentsReady=env.BOARD_DB?.prepare
      ?await env.BOARD_DB.prepare("SELECT id FROM board_discussion_comments LIMIT 0").all().then(()=>true).catch(()=>false)
      :false;
    return json({ok:commentsReady,service:'independent-board',boardId:env.BOARD_ID,storage:'independent-board-d1',db:Boolean(env.BOARD_DB),files:Boolean(env.BOARD_FILES),queue:queueAvailable(env)?'ready':'unavailable',rateLimiter:Boolean(env.BOARD_PUBLIC_WRITE_RATE_LIMITER?.limit),auth:'ekodi',discussionComments:commentsReady,boards:['voices','finance','notices']},commentsReady?200:503);
  }
  if(path==='/api/posts'&&req.method==='GET')return list(env,url);
  if(path==='/api/auth/me'&&req.method==='GET')return json({ok:true,authenticated:Boolean(await signedInBoardMember(req))});
  const submission=path.match(/^\/api\/submissions\/([0-9a-f-]{36})$/i);
  if(submission&&req.method==='GET')return submissionStatus(env,submission[1]);
  if(path==='/api/posts'&&req.method==='POST'){
    const gate=await requireVoiceWriter(req);if(!gate.ok)return gate.response;
    const limited=await publicWriteAllowed(req,env,'post');
    if(!limited.available)return json({ok:false,error:'write_protection_unavailable',message:'등록 보호장치를 준비 중입니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'30'});
    if(!limited.allowed)return json({ok:false,error:'rate_limited',message:'등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'60'});
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,12000),title=text(b.title||name||'시민의견').slice(0,160),kind=category(b.category),contact=text(b.contact).slice(0,160);
    if(!content)return json({ok:false,error:'message_required',message:'의견 내용을 입력해 주세요.'},400);
    const submissionId=crypto.randomUUID(),createdAt=now();
    const keys=await saveImages(env,'voices',submissionId,Array.isArray(b.images)?b.images:[]);
    const payload={submissionId,name:name||'익명',category:kind,contact,title,content,imageKeys:keys,createdAt};
    try{
      if(await enqueueBoardWrite(env,{kind:POST_QUEUE_KIND,payload}))return json({ok:true,queued:true,submissionId,statusUrl:'/board/api/submissions/'+submissionId,storage:'independent-board-queue',message:'시민의견이 접수되었습니다. 저장되는 즉시 공개됩니다.'},202);
      if(env?.ENVIRONMENT!=='production'&&env?.BOARD_DB?.prepare){const id=await persistQueuedPost(env,payload);return json({ok:true,queued:false,id,submissionId,storage:'independent-board-d1'},201)}
      await deleteImages(env,keys);return json({ok:false,error:'durable_queue_unavailable',message:'등록 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'5'});
    }catch(error){await deleteImages(env,keys);console.error('board durable post ingress failed',error);return json({ok:false,error:'write_ingress_failed',message:'등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.'},503,{'retry-after':'5'})}
  }
  const reply=path.match(/^\/api\/posts\/(\d+)\/replies$/);
  if(reply&&req.method==='POST'){
    const gate=await requireVoiceWriter(req);if(!gate.ok)return gate.response;
    const limited=await publicWriteAllowed(req,env,'reply');
    if(!limited.available)return json({ok:false,error:'write_protection_unavailable'},503,{'retry-after':'30'});
    if(!limited.allowed)return json({ok:false,error:'rate_limited',message:'답글 등록이 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'60'});
    const b=await body(req),name=text(b.name||b.authorName).slice(0,80),content=text(b.message||b.body).slice(0,6000);
    if(!content)return json({ok:false,error:'message_required',message:'답글 내용을 입력해 주세요.'},400);
    const post=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status='published'").bind(+reply[1]).first();if(!post)return json({ok:false,error:'not_found'},404);
    const submissionId=crypto.randomUUID(),payload={submissionId,postId:Number(post.id),name:name||'익명',content,createdAt:now()};
    try{
      if(await enqueueBoardWrite(env,{kind:REPLY_QUEUE_KIND,payload}))return json({ok:true,queued:true,submissionId,statusUrl:'/board/api/submissions/'+submissionId,message:'답글이 접수되었습니다. 저장되는 즉시 표시됩니다.'},202);
      if(env?.ENVIRONMENT!=='production'&&env?.BOARD_DB?.prepare){const id=await persistQueuedReply(env,payload);return json({ok:true,queued:false,id,submissionId},201)}
      return json({ok:false,error:'durable_queue_unavailable'},503,{'retry-after':'5'});
    }catch(error){console.error('board durable reply ingress failed',error);return json({ok:false,error:'write_ingress_failed'},503,{'retry-after':'5'})}
  }
  if(path==='/api/finance/summary'&&req.method==='GET')return memberFinanceSummary(req,env);
  if(path==='/api/finance'&&req.method==='GET')return listFinance(env,url,false);
  if(path==='/api/notices'&&req.method==='GET')return listNotices(env,url,false);
  const comment=path.match(/^\/api\/(finance|notices)\/(\d+)\/comments$/);
  if(comment&&req.method==='POST'){
    const gate=await requireVoiceWriter(req);if(!gate.ok)return gate.response;
    return publishBoardComment(req,env,{kind:comment[1],postId:Number(comment[2]),member:gate.user,rateLimit:publicWriteAllowed,enqueue:enqueueBoardWrite,queueAvailable});
  }
  const manageComment=path.match(/^\/api\/admin\/(finance|notices)\/(\d+)\/comments\/(\d+)$/);
  if(manageComment&&(req.method==='PUT'||req.method==='DELETE')){
    const gate=await requirePermission(req,manageComment[1]);if(!gate.ok)return gate.response;
    const options={kind:manageComment[1],postId:Number(manageComment[2]),commentId:Number(manageComment[3])};
    return req.method==='PUT'?updateBoardDiscussionComment(req,env,options):deleteBoardDiscussionComment(env,options);
  }
  const mediaFile=path.match(/^\/api\/files\/(.+)$/);if(mediaFile&&req.method==='GET'){if(!env.BOARD_FILES)return new Response('not found',{status:404});const key=decodeURIComponent(mediaFile[1]);if(!/^seonammedi\/(voices|notices)\//.test(key))return new Response('not found',{status:404});const obj=await env.BOARD_FILES.get(key);if(!obj)return new Response('not found',{status:404});const h=new Headers();obj.writeHttpMetadata(h);h.set('cache-control','public, max-age=31536000, immutable');h.set('x-content-type-options','nosniff');return new Response(obj.body,{headers:h})}
  if(path==='/api/admin/finance'&&req.method==='GET'){const gate=await requirePermission(req,'finance');if(!gate.ok)return gate.response;return listFinance(env,url,true)}
  if(path==='/api/admin/finance'&&req.method==='POST')return createFinance(req,env);
  const financeItem=path.match(/^\/api\/admin\/finance\/(\d+)$/);if(financeItem&&req.method==='PUT')return updateFinance(req,env,+financeItem[1]);if(financeItem&&req.method==='DELETE')return deleteFinance(req,env,+financeItem[1]);
  if(path==='/api/admin/notices'&&req.method==='GET'){const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;return listNotices(env,url,true)}
  if(path==='/api/admin/notices'&&req.method==='POST')return createNotice(req,env);
  const noticeItem=path.match(/^\/api\/admin\/notices\/(\d+)$/);if(noticeItem&&req.method==='PUT')return updateNotice(req,env,+noticeItem[1]);if(noticeItem&&req.method==='DELETE')return deleteNotice(req,env,+noticeItem[1]);
  if(path==='/api/admin/posts'&&req.method==='GET')return adminList(req,env);
  const item=path.match(/^\/api\/admin\/posts\/(\d+)$/);if(item&&req.method==='PUT')return adminUpdate(req,env,+item[1]);if(item&&req.method==='DELETE')return adminDelete(req,env,+item[1]);
  const adminReply=path.match(/^\/api\/admin\/posts\/(\d+)\/replies\/(\d+)$/);if(adminReply&&req.method==='DELETE')return adminDeleteReply(req,env,+adminReply[1],+adminReply[2]);
  return json({ok:false,error:'not_found'},404);
},
async queue(batch,env){
  for(const message of batch.messages){
    try{
      const handled=await consumeBoardWrite(message.body,env);
      if(!handled)throw new Error('unknown_board_write_kind');
      message.ack();
    }catch(error){
      console.error('independent board queue consumer failed',error);
      message.retry();
    }
  }
}};