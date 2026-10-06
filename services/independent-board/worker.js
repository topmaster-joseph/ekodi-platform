const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const STATES=new Set(['received','reviewing','answered','published','archived']);
const FINANCE_TYPES=new Set(['income','expense']);
const EVIDENCE_STATES=new Set(['none','held','verified']);
function bearer(req){return req.headers.get('authorization')||''}
function pathOf(req){const path=new URL(req.url).pathname;return path==='/board'?'/':path.startsWith('/board/')?path.slice('/board'.length):path}
async function body(req){try{return await req.json()}catch{return{}}}
function category(v){const value=text(v).toLowerCase();return CATEGORIES.has(value)?value:'other'}
function state(v,fallback='published'){const value=text(v).toLowerCase();return STATES.has(value)?value:fallback}
function financeType(v){const value=text(v).toLowerCase();return FINANCE_TYPES.has(value)?value:'expense'}
function evidenceState(v){const value=text(v).toLowerCase();return EVIDENCE_STATES.has(value)?value:'none'}
function safeAmount(v){const n=Math.round(Number(v)||0);return Math.max(0,Math.min(n,999999999999))}
function dateOnly(v){const value=text(v);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Date().toISOString().slice(0,10)}

async function adminMe(req){
  const authorization=bearer(req);if(!/^Bearer\s+\S+/i.test(authorization))return null;
  const verify=new URL('/api/seonammedi/admin/me',new URL(req.url).origin);
  try{
    const response=await fetch(verify,{headers:{authorization,'cache-control':'no-store'}});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data?.ok===true?data:null;
  }catch{return null}
}
async function requirePermission(req,permission){
  const auth=await adminMe(req);
  return auth&&(auth.platform===true||auth.permissions?.[permission]===true)?{ok:true,auth}:{ok:false,response:json({ok:false,error:permission+'_forbidden'},403)};
}
async function requireVoiceAdmin(req){return requirePermission(req,'voices')}

async function list(env,url){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,author_name,category,title,body,created_at,updated_at FROM board_posts WHERE status='published'",args=[];
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=['%'+q+'%','%'+q+'%']}
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
  await env.BOARD_DB.prepare('UPDATE board_posts SET author_name=?,category=?,private_contact=?,body=?,status=?,updated_at=? WHERE id=?')
    .bind(name,category(b.category),contact,content,state(b.status,existing.status||'published'),now(),id).run();
  return json({ok:true,id});
}
async function adminDelete(req,env,id){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const t=now();await env.BOARD_DB.prepare("UPDATE board_posts SET status='deleted',updated_at=? WHERE id=?").bind(t,id).run();await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE post_id=?").bind(id).run();
  return json({ok:true,id});
}
async function adminDeleteReply(req,env,postId,replyId){
  const gate=await requireVoiceAdmin(req);if(!gate.ok)return gate.response;
  const existing=await env.BOARD_DB.prepare("SELECT id FROM board_replies WHERE id=? AND post_id=? AND status<>'deleted'").bind(replyId,postId).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare("UPDATE board_replies SET status='deleted' WHERE id=? AND post_id=?").bind(replyId,postId).run();
  return json({ok:true,id:replyId});
}

async function listFinance(env,url,admin=false){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,status,created_by,created_at,updated_at FROM finance_posts WHERE status<>'deleted'",args=[];
  if(!admin)sql+=" AND status='published'";
  if(q){sql+=' AND (purpose LIKE ? OR related_event LIKE ? OR public_note LIKE ?)';args=['%'+q+'%','%'+q+'%','%'+q+'%']}
  sql+=' ORDER BY entry_date DESC,id DESC LIMIT '+(admin?'300':'150');
  const rows=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  const items=rows.map(r=>({id:Number(r.id),date:r.entry_date,type:r.entry_type,amount:Number(r.amount||0),purpose:r.purpose||'',event:r.related_event||'',evidenceStatus:r.evidence_status||'none',note:r.public_note||'',status:r.status||'published',createdAt:r.created_at,updatedAt:r.updated_at,...(admin?{createdBy:r.created_by||''}:{})}));
  const visible=items.filter(x=>admin||x.status==='published'),raised=visible.filter(x=>x.type==='income').reduce((a,x)=>a+x.amount,0),spent=visible.filter(x=>x.type==='expense').reduce((a,x)=>a+x.amount,0);
  return json({ok:true,boardId:'seonammedi.finance',storage:'independent-board-d1',summary:{raised,spent,balance:raised-spent},items:visible});
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
  await env.BOARD_DB.prepare("UPDATE finance_posts SET status='deleted',updated_at=? WHERE id=?").bind(now(),id).run();return json({ok:true,id});
}
async function listNotices(env,url,admin=false){
  const q=text(url.searchParams.get('q'));
  let sql="SELECT id,title,body,pinned,status,created_by,created_at,updated_at FROM notice_posts WHERE status<>'deleted'",args=[];
  if(!admin)sql+=" AND status='published'";
  if(q){sql+=' AND (title LIKE ? OR body LIKE ?)';args=['%'+q+'%','%'+q+'%']}
  sql+=' ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT '+(admin?'300':'100');
  const rows=(await env.BOARD_DB.prepare(sql).bind(...args).all()).results||[];
  return json({ok:true,boardId:'seonammedi.notice',storage:'independent-board-d1',items:rows.map(r=>({id:Number(r.id),title:r.title||'',body:r.body||'',pinned:Boolean(r.pinned),status:r.status||'published',createdAt:r.created_at,updatedAt:r.updated_at,...(admin?{createdBy:r.created_by||''}:{})}))});
}
async function createNotice(req,env){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const b=await body(req),title=text(b.title).slice(0,180),copy=text(b.body).slice(0,12000);if(!title)return json({ok:false,error:'title_required'},400);
  const t=now(),r=await env.BOARD_DB.prepare('INSERT INTO notice_posts(title,body,pinned,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(title,copy,b.pinned?1:0,'published',text(gate.auth?.email).slice(0,200),t,t).run();
  return json({ok:true,id:Number(r.meta.last_row_id||0)},201);
}
async function updateNotice(req,env,id){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const b=await body(req),title=text(b.title).slice(0,180),copy=text(b.body).slice(0,12000);if(!title)return json({ok:false,error:'title_required'},400);
  const found=await env.BOARD_DB.prepare("SELECT id FROM notice_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare('UPDATE notice_posts SET title=?,body=?,pinned=?,updated_at=? WHERE id=?').bind(title,copy,b.pinned?1:0,now(),id).run();
  return json({ok:true,id});
}
async function deleteNotice(req,env,id){
  const gate=await requirePermission(req,'notices');if(!gate.ok)return gate.response;
  const found=await env.BOARD_DB.prepare("SELECT id FROM notice_posts WHERE id=? AND status<>'deleted'").bind(id).first();if(!found)return json({ok:false,error:'not_found'},404);
  await env.BOARD_DB.prepare("UPDATE notice_posts SET status='deleted',updated_at=? WHERE id=?").bind(now(),id).run();return json({ok:true,id});
}

const boardCss='*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-size:15px;line-height:1.45}a{color:#111;text-decoration:none}.site-header{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #d9d9d9;padding:0 14px}.site-header>.brand,.site-header>nav{width:min(1040px,100%);margin:0 auto}.site-header>.brand{display:flex;align-items:baseline;gap:10px;min-height:48px;padding:9px 0 6px}.site-header>.brand strong{font-size:18px;font-weight:800;letter-spacing:-.02em}.site-header>.brand small{font-size:12px;color:#666}.site-header>nav{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;padding:8px 0;border-top:1px solid #eee}.site-header>nav a{font-size:14px;padding:2px 0}.site-header>nav a.active{font-weight:800;border-bottom:2px solid #111}main{width:min(920px,calc(100% - 28px));margin:0 auto;padding:14px 0 26px}.board-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:6px 0 12px;border-bottom:1px solid #ddd}.board-head .eyebrow{margin:0 0 3px;font-size:11px;font-weight:800;letter-spacing:.08em}.board-head h1{margin:0;font-size:24px;letter-spacing:-.03em}.board-head .note{margin:5px 0 0;color:#555;font-size:13px}.board-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}button{appearance:none;border:1px solid #111;border-radius:6px;background:#111;color:#fff;padding:8px 12px;font-weight:700;cursor:pointer}button.secondary{background:#fff;color:#111}.board-panel{margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff}.board-panel[hidden]{display:none}.board-panel label{display:block;margin:6px 0}.board-panel input,.board-panel select,.board-panel textarea{width:100%;padding:9px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#111}.board-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.board-row,.voice-card{padding:13px 0;border-bottom:1px solid #e5e5e5}.row-head,.voice-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.row-body,.voice-message{white-space:pre-wrap;line-height:1.5;margin:8px 0}.admin-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.money-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.money-grid article{border:1px solid #ddd;border-radius:7px;padding:10px;background:#fff}.money-grid span{display:block;font-size:12px;color:#666}.money-grid strong{display:block;margin-top:3px;font-size:18px}.status{min-height:22px;padding:7px 0;color:#555;font-size:13px}.form-grid{display:grid;grid-template-columns:160px 1fr;gap:8px}.form-grid textarea{grid-column:1/-1;min-height:100px}.reply-list{margin:8px 0 0;padding-left:12px;border-left:2px solid #eee}.reply{padding:6px 0}.reply p{margin:3px 0;white-space:pre-wrap}.reply-form{display:flex;gap:6px;margin-top:8px}.reply-form input{width:150px}.reply-form textarea{flex:1;min-height:42px}.reply-form input,.reply-form textarea{border:1px solid #bbb;border-radius:6px;padding:8px}.meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.badge{font-size:11px;border:1px solid #bbb;border-radius:999px;padding:2px 7px}.search-row{display:flex;gap:7px}.search-row input{flex:1}.empty{padding:28px 0;color:#666}footer{border-top:1px solid #ddd;margin-top:20px;padding:14px max(14px,calc((100% - 920px)/2));display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fff;font-size:12px;color:#666}footer p{margin:0}footer a{font-weight:700}@media(max-width:640px){body{font-size:16px}.site-header{padding:0 10px}.site-header>.brand{display:block;min-height:auto;padding:8px 0 6px}.site-header>.brand strong{display:block;font-size:16px}.site-header>.brand small{display:block;margin-top:2px;font-size:11px}.site-header>nav{gap:12px;padding:7px 0}.site-header>nav a{font-size:14px}main{width:calc(100% - 20px);padding-top:10px}.board-head{display:block}.board-head h1{font-size:21px}.board-actions{margin-top:8px;justify-content:flex-start}.board-grid,.money-grid,.form-grid{grid-template-columns:1fr}.reply-form{display:grid;grid-template-columns:1fr auto}.reply-form input,.reply-form textarea{width:100%;grid-column:1/-1}.reply-form button{grid-column:2}.row-head,.voice-head{align-items:flex-start}footer{padding:12px 10px;display:block}footer a{display:inline-block;margin-top:6px}}'
function nav(active){
  const link=(href,label,key)=>'<a'+(active===key?' class="active" aria-current="page"':'')+' href="'+href+'">'+label+'</a>';
  return '<header class="site-header"><a class="brand" href="/"><strong>서남권 국립의대 소통센터</strong><small>서남권 의대 설립 비상대책위원회 관련 공개 기록·소통 채널</small></a><nav aria-label="주요 메뉴"><a href="/#timeline">활동이력</a><a href="/#channels">소통채널</a>'+link('/board/voices','시민의견','voices')+link('/board/finance','회계','finance')+link('/board/notices','공지','notices')+'<a href="/#organization">조직</a></nav></header>';
}
const footer='<footer><p><strong>서남권 국립의대 소통센터</strong> · 자료의 성격과 출처를 구분해 보존합니다.</p><a id="adminLink" href="#admin">관리자</a></footer>';
function shell(active,title,eyebrow,note,controls,content,script){
  return new Response('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' · 서남권 국립의대 소통센터</title><link rel="stylesheet" href="/seonammedi/app.css?v=20261006-domain-routing-2"><style>'+boardCss+'</style></head><body>'+nav(active)+'<main><section class="board-head"><div><p class="eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p class="note">'+note+'</p></div><div class="board-actions">'+controls+'</div></section>'+content+'</main>'+footer+'<script>'+script+'<\/script></body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-independent':'true'}});
}
function commonScript(returnPath){
  return 'const byId=id=>document.getElementById(id),esc=v=>String(v==null?"":v).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",\'"\':"&quot;"}[c]));function token(){try{const p=sessionStorage.getItem("ekodi-auth-token")||"";if(p)return p}catch{}try{const raw=localStorage.getItem("sb-renzehysxirjilvdxacv-auth-token")||"";if(!raw)return"";const parsed=JSON.parse(raw),session=parsed&&((parsed.currentSession)||(parsed.session)||parsed);return String(session&&session.access_token||"")}catch{return""}}async function call(url,options){const r=await fetch(url,options||{}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.message||d.error||"요청을 처리하지 못했습니다.");return d}function login(){const u=new URL("https://ekodi.kr/auth/");u.searchParams.set("site","portal");u.searchParams.set("direct","1");u.searchParams.set("return_to",location.origin+"'+returnPath+'");u.searchParams.set("purpose","seonammedi-board-admin");location.assign(u.href)}document.getElementById("adminLink")?.addEventListener("click",e=>{e.preventDefault();login()});async function exchange(){const p=new URLSearchParams(location.hash.replace(/^#/,"")),h=p.get("ekodi_token");if(!h)return;const d=await call("/api/seonammedi/admin/auth/exchange",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token_hash:h,type:p.get("ekodi_type")||"email"})});if(d.access_token)localStorage.setItem("sb-renzehysxirjilvdxacv-auth-token",JSON.stringify({access_token:d.access_token,expires_at:Number(d.expires_at||0)}));history.replaceState(null,"",location.pathname+location.search)}';
}

function boardPage(){
  const content='<form id="writeForm" class="board-panel" hidden><div class="form-grid"><select name="category"><option value="question">질문</option><option value="proposal">정책제안</option><option value="experience">의료경험</option><option value="factcheck">사실확인 요청</option><option value="tip">자료제보</option><option value="other">기타</option></select><input name="name" maxlength="80" placeholder="이름 또는 표시명 (익명 가능)"><textarea name="message" maxlength="12000" required placeholder="시민의견을 입력해 주세요"></textarea></div><div class="admin-actions"><button type="submit">등록</button><button id="writeCancel" class="secondary" type="button">취소</button></div></form><form id="searchForm" class="board-panel" hidden><div class="search-row"><input name="q" maxlength="120" required placeholder="제목 또는 내용 검색"><button type="submit">검색</button><button id="searchReset" class="secondary" type="button">전체</button></div></form><div id="status" class="status"></div><section id="voiceList"><p class="empty">시민의견을 불러오는 중입니다.</p></section>';
  const script='(function(){'+commonScript('/board/voices')+'const list=byId("voiceList"),status=byId("status"),write=byId("writeForm"),search=byId("searchForm"),adminLogin=byId("adminLogin"),labels={question:"질문",proposal:"정책제안",experience:"의료경험",factcheck:"사실확인 요청",tip:"자료제보",other:"기타"};let adminItems=null;function dt(v){try{return new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Seoul"}).format(new Date(v))}catch{return""}}function render(items,admin){if(!items||!items.length){list.innerHTML=\'<p class="empty">등록된 시민의견이 없습니다.</p>\';return}list.innerHTML=items.map(item=>{const replies=(item.replies||[]).filter(r=>!r.status||r.status==="published").map(r=>\'<div class="reply"><div class="meta"><strong>\'+esc(r.displayName||"익명")+\'</strong><small>\'+esc(dt(r.createdAt))+\'</small>\'+(admin?\'<button class="secondary reply-admin" type="button" data-reply-delete="\'+Number(r.id)+\'" data-post="\'+Number(item.id)+\'">답글 삭제</button>\':"")+\'</div><p>\'+esc(r.message||"")+\'</p></div>\').join("");const buttons=admin?\'<div class="admin-actions"><button data-edit="\'+item.id+\'">수정</button><button class="secondary" data-delete="\'+item.id+\'">삭제</button></div>\':"";return \'<article class="voice-card"><div class="voice-head"><div class="meta"><strong>\'+esc(item.displayName||"익명")+\'</strong><span class="badge">\'+esc(labels[item.category]||"기타")+\'</span></div><small>\'+esc(dt(item.createdAt))+\'</small></div><p class="voice-message">\'+esc(item.message||"")+\'</p><div class="reply-list">\'+replies+\'</div><form class="reply-form" data-reply="\'+item.id+\'"><input name="name" placeholder="이름 (익명 가능)"><textarea name="message" required placeholder="답글을 입력해 주세요"></textarea><button>답글 등록</button></form>\'+buttons+\'</article>\'}).join("")}async function load(q){let d=await call("/board/api/posts"+(q?"?q="+encodeURIComponent(q):""));render(d.items||[],false);if(q)return;const t=token();if(t)try{d=await call("/board/api/admin/posts",{headers:{authorization:"Bearer "+t}});adminItems=d.items||[];render(adminItems,true);adminLogin.hidden=true;status.textContent="관리자 관리 기능이 활성화되었습니다."}catch{}}byId("writeToggle").onclick=()=>{write.hidden=!write.hidden;search.hidden=true};byId("writeCancel").onclick=()=>{write.reset();write.hidden=true};byId("searchToggle").onclick=()=>{search.hidden=!search.hidden;write.hidden=true};byId("searchReset").onclick=()=>{search.reset();search.hidden=true;load()};adminLogin.onclick=login;write.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(write));await call("/board/api/posts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});write.reset();write.hidden=true;await load()};search.onsubmit=e=>{e.preventDefault();load(new FormData(search).get("q"))};list.addEventListener("submit",async e=>{const f=e.target.closest("[data-reply]");if(!f)return;e.preventDefault();const d=Object.fromEntries(new FormData(f));await call("/board/api/posts/"+f.dataset.reply+"/replies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});await load()});list.addEventListener("click",async e=>{const t=token(),edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]"),rd=e.target.closest("[data-reply-delete]");if(edit){const x=adminItems.find(v=>v.id===Number(edit.dataset.edit)),next=prompt("수정할 내용을 입력하세요.",x.message||"");if(next===null)return;await call("/board/api/admin/posts/"+x.id,{method:"PUT",headers:{authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify({...x,message:next})});await load()}if(del&&confirm("이 시민의견을 삭제할까요?")){await call("/board/api/admin/posts/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load()}if(rd&&confirm("이 답글을 삭제할까요?")){await call("/board/api/admin/posts/"+rd.dataset.post+"/replies/"+rd.dataset.replyDelete,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load()}});(async()=>{try{await exchange()}catch(e){status.textContent=e.message}adminLogin.hidden=false;await load()})()})();';
  return shell('voices','시민의견','CITIZEN VOICES','누구나 로그인 없이 등록하고 답글을 남길 수 있습니다. 등록 즉시 공개됩니다.','<button id="writeToggle">의견 등록</button><button id="searchToggle" class="secondary">검색</button><button id="adminLogin" class="secondary">관리자 로그인</button>',content,script);
}
function financePage(){
  const content='<section class="money-grid"><article><span>누적 수입</span><strong id="raised">0원</strong></article><article><span>누적 지출</span><strong id="spent">0원</strong></article><article><span>현재 잔액</span><strong id="balance">0원</strong></article></section><form id="writeForm" class="board-panel" hidden><input type="hidden" name="id"><div class="board-grid"><label>일자<input name="date" type="date" required></label><label>구분<select name="type"><option value="income">수입</option><option value="expense">지출</option></select></label><label>금액<input name="amount" type="number" min="0" step="1" required></label></div><label>목적·내용<input name="purpose" maxlength="500" required></label><label>관련 행사<input name="event" maxlength="300"></label><label>증빙<select name="evidenceStatus"><option value="none">미등록</option><option value="held">증빙보유</option><option value="verified">확인완료</option></select></label><label>공개 메모<textarea name="note" rows="4" maxlength="1000"></textarea></label><div class="admin-actions"><button type="submit">저장</button><button id="cancel" class="secondary" type="button">취소</button></div></form><div id="status" class="status"></div><section id="list"></section>';
  const script='(function(){'+commonScript('/board/finance')+'const form=byId("writeForm"),list=byId("list"),status=byId("status"),fmt=n=>new Intl.NumberFormat("ko-KR").format(Number(n||0))+"원";let admin=false,items=[];function render(d){byId("raised").textContent=fmt(d.summary?.raised);byId("spent").textContent=fmt(d.summary?.spent);byId("balance").textContent=fmt(d.summary?.balance);items=d.items||[];list.innerHTML=items.length?items.map(x=>\'<article class="board-row"><div class="row-head"><strong>\'+(x.type==="income"?"수입 ":"지출 ")+fmt(x.amount)+\'</strong><span>\'+esc(x.date||"")+\'</span></div><p class="row-body">\'+esc(x.purpose||"")+\'</p><div>\'+(x.event?\'<span>\'+esc(x.event)+\'</span> \':"")+\'<span>\'+esc(x.evidenceStatus||"none")+\'</span></div>\'+(x.note?\'<p class="row-body">\'+esc(x.note)+\'</p>\':"")+(admin?\'<div class="admin-actions"><button data-edit="\'+x.id+\'">수정</button><button class="secondary" data-delete="\'+x.id+\'">삭제</button></div>\':"")+\'</article>\').join(""):\'<p class="empty">등록된 회계내역이 없습니다.</p>\'}async function load(){const t=token();let d;if(t)try{d=await call("/board/api/admin/finance",{headers:{authorization:"Bearer "+t}});admin=true;byId("adminLogin").hidden=true}catch{}if(!d){d=await call("/board/api/finance");admin=false}render(d)}byId("writeToggle").onclick=()=>{if(!admin){login();return}form.hidden=!form.hidden};byId("adminLogin").onclick=login;byId("cancel").onclick=()=>{form.reset();form.elements.id.value="";form.hidden=true};form.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form)),id=Number(d.id||0);await call(id?"/board/api/admin/finance/"+id:"/board/api/admin/finance",{method:id?"PUT":"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)});form.reset();form.elements.id.value="";form.hidden=true;await load()};list.onclick=async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit){const x=items.find(v=>v.id===Number(edit.dataset.edit));for(const k of ["date","type","amount","purpose","event","evidenceStatus","note"])form.elements[k].value=x[k]??"";form.elements.id.value=x.id;form.hidden=false}if(del&&confirm("이 회계내역을 삭제할까요?")){await call("/board/api/admin/finance/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load()}};(async()=>{try{await exchange()}catch(e){status.textContent=e.message}await load()})()})();';
  return shell('finance','회계','TRANSPARENCY','수입·지출 일자, 금액, 목적, 관련 행사와 증빙 상태를 공개합니다.','<button id="writeToggle">회계내역 추가</button><button id="adminLogin" class="secondary">관리자 로그인</button>',content,script);
}
function noticesPage(){
  const content='<form id="writeForm" class="board-panel" hidden><input type="hidden" name="id"><label>제목<input name="title" maxlength="180" required></label><label><input name="pinned" type="checkbox"> 중요공지로 고정</label><label>내용<textarea name="body" rows="7" maxlength="12000"></textarea></label><div class="admin-actions"><button type="submit">저장</button><button id="cancel" class="secondary">취소</button></div></form><div id="status" class="status"></div><section id="list"></section>';
  const script='(function(){'+commonScript('/board/notices')+'const form=byId("writeForm"),list=byId("list"),status=byId("status");let admin=false,items=[];function render(d){items=d.items||[];list.innerHTML=items.length?items.map(x=>\'<article class="board-row"><div class="row-head"><strong>\'+(x.pinned?"[중요] ":"")+esc(x.title||"")+\'</strong><small>\'+esc((x.updatedAt||"").slice(0,10))+\'</small></div><p class="row-body">\'+esc(x.body||"")+\'</p>\'+(admin?\'<div class="admin-actions"><button data-edit="\'+x.id+\'">수정</button><button class="secondary" data-delete="\'+x.id+\'">삭제</button></div>\':"")+\'</article>\').join(""):\'<p class="empty">등록된 공지가 없습니다.</p>\'}async function load(){const t=token();let d;if(t)try{d=await call("/board/api/admin/notices",{headers:{authorization:"Bearer "+t}});admin=true;byId("adminLogin").hidden=true}catch{}if(!d){d=await call("/board/api/notices");admin=false}render(d)}byId("writeToggle").onclick=()=>{if(!admin){login();return}form.hidden=!form.hidden};byId("adminLogin").onclick=login;byId("cancel").onclick=()=>{form.reset();form.elements.id.value="";form.hidden=true};form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),d={title:fd.get("title"),body:fd.get("body"),pinned:fd.get("pinned")==="on"},id=Number(fd.get("id")||0);await call(id?"/board/api/admin/notices/"+id:"/board/api/admin/notices",{method:id?"PUT":"POST",headers:{authorization:"Bearer "+token(),"content-type":"application/json"},body:JSON.stringify(d)});form.reset();form.elements.id.value="";form.hidden=true;await load()};list.onclick=async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit){const x=items.find(v=>v.id===Number(edit.dataset.edit));form.elements.id.value=x.id;form.elements.title.value=x.title||"";form.elements.body.value=x.body||"";form.elements.pinned.checked=!!x.pinned;form.hidden=false}if(del&&confirm("이 공지를 삭제할까요?")){await call("/board/api/admin/notices/"+del.dataset.delete,{method:"DELETE",headers:{authorization:"Bearer "+token()}});await load()}};(async()=>{try{await exchange()}catch(e){status.textContent=e.message}await load()})()})();';
  return shell('notices','공지','NOTICE BOARD','소통센터의 공식 안내와 중요 소식을 게시하고 관리합니다.','<button id="writeToggle">공지 작성</button><button id="adminLogin" class="secondary">관리자 로그인</button>',content,script);
}

export default {async fetch(req,env){
  const url=new URL(req.url),path=pathOf(req);
  if((path==='/'||path==='/voices'||path==='/voices/')&&req.method==='GET')return boardPage();
  if((path==='/finance'||path==='/finance/')&&req.method==='GET')return financePage();
  if((path==='/notices'||path==='/notices/')&&req.method==='GET')return noticesPage();
  if(path==='/health'&&req.method==='GET')return json({ok:true,service:'independent-board',boardId:env.BOARD_ID,storage:'independent-board-d1',db:Boolean(env.BOARD_DB),files:Boolean(env.BOARD_FILES),auth:'ekodi',boards:['voices','finance','notices']});
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
  if(path==='/api/finance'&&req.method==='GET')return listFinance(env,url,false);
  if(path==='/api/notices'&&req.method==='GET')return listNotices(env,url,false);
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
}};