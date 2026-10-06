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

function boardPage(){
  return new Response(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시민의견 · 서남권 국립의대 소통센터</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}button,input,select,textarea{font:inherit;color:inherit}button{background:#111;color:#fff;border:1px solid #111;border-radius:7px;padding:9px 12px;cursor:pointer}.secondary{background:#fff;color:#111}.site-header{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #ddd}.header-inner,main{width:min(920px,calc(100% - 24px));margin:0 auto}.header-top{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-weight:800;text-decoration:none;color:#111}.site-nav{display:flex;gap:14px;overflow-x:auto;white-space:nowrap;padding:8px 0;border-top:1px solid #eee}.site-nav a{color:#111;text-decoration:none;font-size:14px}.site-nav a.active{font-weight:800}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 0 10px;border-bottom:1px solid #ddd}.eyebrow{margin:0 0 2px;font-size:11px;font-weight:800;letter-spacing:.08em}.page-head h1{margin:0;font-size:24px}.note{margin:5px 0 0;color:#555;font-size:13px}.actions{display:flex;gap:7px;flex-wrap:wrap}.panel{margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:9px}.panel[hidden]{display:none}.form-grid{display:grid;grid-template-columns:160px 1fr;gap:8px}.form-grid textarea{grid-column:1/-1;min-height:100px}.panel input,.panel select,.panel textarea{width:100%;border:1px solid #bbb;border-radius:7px;padding:9px;background:#fff}.form-actions{display:flex;align-items:center;gap:8px;margin-top:8px}.status{min-height:22px;padding:7px 0;font-size:13px;color:#555}.voice-card{padding:13px 0;border-bottom:1px solid #e5e5e5}.voice-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.voice-head strong{font-size:15px}.meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.badge{font-size:11px;border:1px solid #bbb;border-radius:999px;padding:2px 7px}.voice-message{white-space:pre-wrap;line-height:1.5;margin:8px 0}.reply-list{margin:8px 0 0;padding-left:12px;border-left:2px solid #eee}.reply{padding:6px 0}.reply p{margin:3px 0;white-space:pre-wrap}.reply-form{display:flex;gap:6px;margin-top:8px}.reply-form input{width:150px}.reply-form textarea{flex:1;min-height:42px}.reply-form input,.reply-form textarea{border:1px solid #bbb;border-radius:7px;padding:8px}.admin-actions{display:flex;gap:6px;margin-top:8px}.admin-actions button,.reply-admin{padding:5px 8px;font-size:12px}.empty{padding:28px 0;color:#666}.search-row{display:flex;gap:7px}.search-row input{flex:1}@media(max-width:640px){.header-top{min-height:46px}.brand{font-size:15px}.site-nav{gap:12px}.page-head{display:block}.actions{margin-top:9px}.page-head h1{font-size:21px}.form-grid{grid-template-columns:1fr}.reply-form{display:grid;grid-template-columns:1fr auto}.reply-form input,.reply-form textarea{width:100%;grid-column:1/-1}.reply-form button{grid-column:2}.voice-head{align-items:flex-start}}
</style>
</head>
<body>
<header class="site-header"><div class="header-inner">
  <div class="header-top"><a class="brand" href="/">서남권 국립의대 소통센터</a><a href="/" style="color:#111;text-decoration:none;font-size:13px">본 사이트로</a></div>
  <nav class="site-nav" aria-label="주요 메뉴"><a href="/#timeline">활동이력</a><a href="/#channels">소통채널</a><a class="active" href="/board" aria-current="page">시민의견</a><a href="/#finance">회계</a><a href="/#notices">공지</a><a href="/#organization">조직</a></nav>
</div></header>
<main>
  <section class="page-head"><div><p class="eyebrow">CITIZEN VOICES</p><h1>시민의견</h1><p class="note">누구나 로그인 없이 등록하고 답글을 남길 수 있습니다. 등록 즉시 공개됩니다.</p></div><div class="actions"><button id="writeToggle" type="button">의견 등록</button><button id="searchToggle" class="secondary" type="button">검색</button></div></section>
  <form id="writeForm" class="panel" hidden><div class="form-grid"><select name="category" aria-label="유형"><option value="question">질문</option><option value="proposal">정책제안</option><option value="experience">의료경험</option><option value="factcheck">사실확인 요청</option><option value="tip">자료제보</option><option value="other">기타</option></select><input name="name" maxlength="80" placeholder="이름 또는 표시명 (익명 가능)"><textarea name="message" maxlength="12000" required placeholder="시민의견을 입력해 주세요"></textarea></div><div class="form-actions"><button type="submit">등록</button><button id="writeCancel" class="secondary" type="button">취소</button></div></form>
  <form id="searchForm" class="panel" hidden><div class="search-row"><input name="q" maxlength="120" required placeholder="제목 또는 내용 검색"><button type="submit">검색</button><button id="searchReset" class="secondary" type="button">전체</button></div></form>
  <div id="status" class="status" role="status"></div>
  <section id="voiceList" aria-live="polite"><p class="empty">시민의견을 불러오는 중입니다.</p></section>
</main>
<script>
(function(){
  const byId=id=>document.getElementById(id),list=byId("voiceList"),status=byId("status"),write=byId("writeForm"),search=byId("searchForm");
  const labels={question:"질문",proposal:"정책제안",experience:"의료경험",factcheck:"사실확인 요청",tip:"자료제보",other:"기타"};
  const esc=v=>String(v==null?"":v).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  const dt=v=>{try{return new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Seoul"}).format(new Date(v))}catch{return""}};
  function token(){try{const p=sessionStorage.getItem("ekodi-auth-token")||"";if(p)return p}catch{}try{const raw=localStorage.getItem("sb-renzehysxirjilvdxacv-auth-token")||"";if(!raw)return"";const parsed=JSON.parse(raw),session=parsed&&((parsed.currentSession)||(parsed.session)||parsed),access=String(session&&session.access_token||""),expires=Number(session&&session.expires_at||0);return access&&(!expires||expires>Math.floor(Date.now()/1000)+30)?access:""}catch{return""}}
  async function call(url,options){const r=await fetch(url,options||{}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.message||d.error||"요청을 처리하지 못했습니다.");return d}
  let adminItems=null;
  function render(items,admin){
    if(!items||!items.length){list.innerHTML='<p class="empty">등록된 시민의견이 없습니다.</p>';return}
    list.innerHTML=items.map(item=>{
      const replies=(item.replies||[]).filter(r=>!r.status||r.status==="published").map(r=>'<div class="reply"><div class="meta"><strong>'+esc(r.displayName||"익명")+'</strong><small>'+esc(dt(r.createdAt))+'</small>'+(admin?'<button class="secondary reply-admin" type="button" data-reply-delete="'+Number(r.id)+'" data-post="'+Number(item.id)+'">답글 삭제</button>':'')+'</div><p>'+esc(r.message||"")+'</p></div>').join("");
      const adminButtons=admin?'<div class="admin-actions"><button type="button" data-edit="'+Number(item.id)+'">수정</button><button class="secondary" type="button" data-delete="'+Number(item.id)+'">삭제</button><span class="badge">'+esc(item.status||"published")+'</span></div>':"";
      return '<article class="voice-card" data-id="'+Number(item.id)+'"><div class="voice-head"><div class="meta"><strong>'+esc(item.displayName||"익명")+'</strong><span class="badge">'+esc(labels[item.category]||"기타")+'</span></div><small>'+esc(dt(item.createdAt))+'</small></div><p class="voice-message">'+esc(item.message||"")+'</p><div class="reply-list">'+replies+'</div><form class="reply-form" data-reply="'+Number(item.id)+'"><input name="name" maxlength="80" placeholder="이름 (익명 가능)"><textarea name="message" maxlength="6000" required placeholder="답글을 입력해 주세요"></textarea><button type="submit">답글 등록</button></form>'+adminButtons+'</article>';
    }).join("");
  }
  async function load(q){
    status.textContent="불러오는 중…";
    const data=await call("/board/api/posts"+(q?"?q="+encodeURIComponent(q):""));
    render(data.items||[],false);status.textContent=q?"검색 결과":"";
    if(q)return;
    const t=token();if(!t)return;
    try{const admin=await call("/board/api/admin/posts",{headers:{authorization:"Bearer "+t}});adminItems=admin.items||[];render(adminItems,true);status.textContent="관리자 관리 기능이 활성화되었습니다."}catch{}
  }
  byId("writeToggle").onclick=()=>{write.hidden=!write.hidden;search.hidden=true;if(!write.hidden)write.querySelector("select,input,textarea").focus()};
  byId("writeCancel").onclick=()=>{write.reset();write.hidden=true};
  byId("searchToggle").onclick=()=>{search.hidden=!search.hidden;write.hidden=true;if(!search.hidden)search.elements.q.focus()};
  byId("searchReset").onclick=()=>{search.reset();search.hidden=true;load()};
  write.onsubmit=async e=>{e.preventDefault();const d=new FormData(write);try{status.textContent="등록 중…";await call("/board/api/posts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:d.get("name"),category:d.get("category"),message:d.get("message")})});write.reset();write.hidden=true;await load();status.textContent="등록되었습니다."}catch(err){status.textContent=err.message}};
  search.onsubmit=async e=>{e.preventDefault();try{await load(new FormData(search).get("q"))}catch(err){status.textContent=err.message}};
  list.addEventListener("submit",async e=>{const form=e.target.closest("[data-reply]");if(!form)return;e.preventDefault();const d=new FormData(form),id=Number(form.dataset.reply);try{await call("/board/api/posts/"+id+"/replies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:d.get("name"),message:d.get("message")})});await load();status.textContent="답글이 등록되었습니다."}catch(err){status.textContent=err.message}});
  list.addEventListener("click",async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]"),rd=e.target.closest("[data-reply-delete]"),t=token();if(!t)return;try{
    if(edit){const id=Number(edit.dataset.edit),item=(adminItems||[]).find(x=>Number(x.id)===id);if(!item)return;const next=prompt("수정할 내용을 입력하세요.",item.message||"");if(next===null||!next.trim())return;await call("/board/api/admin/posts/"+id,{method:"PUT",headers:{authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify({displayName:item.displayName,category:item.category,contact:item.contact,message:next,status:item.status})});await load();status.textContent="수정되었습니다.";return}
    if(del){const id=Number(del.dataset.delete);if(!confirm("이 시민의견을 삭제할까요?"))return;await call("/board/api/admin/posts/"+id,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load();status.textContent="삭제되었습니다.";return}
    if(rd){const post=Number(rd.dataset.post),reply=Number(rd.dataset.replyDelete);if(!confirm("이 답글을 삭제할까요?"))return;await call("/board/api/admin/posts/"+post+"/replies/"+reply,{method:"DELETE",headers:{authorization:"Bearer "+t}});await load();status.textContent="답글이 삭제되었습니다."}
  }catch(err){status.textContent=err.message}});
  load().catch(err=>{status.textContent=err.message;list.innerHTML='<p class="empty">시민의견을 불러오지 못했습니다.</p>'});
})();
</script>
</body></html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-ekodi-board-independent":"true"}});
}

export default {async fetch(req,env){
  const url=new URL(req.url),path=pathOf(req);
  if(path==='/'&&req.method==='GET')return boardPage();
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