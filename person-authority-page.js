// Platform-admin Person authority lookup (/admin/people).
// The page grants nothing: every read goes through access-api /admin/person, which
// requires a verified-Google platform administrator and audits each lookup.
// All member data is rendered with textContent only.
const CSP="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src https://renzehysxirjilvdxacv.supabase.co; img-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

export function personAuthorityPage(){
  return new Response(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>회원 권한 조회 · EKODI</title>
<style>
:root{--ink:#16181d;--muted:#5d6370;--line:#e3e5ea;--paper:#fff;--bg:#f4f5f7;--ok:#1d7a4d;--warn:#a5590b;--no:#9b1c1c;
  font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
*{box-sizing:border-box}body{margin:0}a{color:inherit}
header,main{width:min(920px,calc(100% - 28px));margin:auto}
header{display:flex;align-items:center;justify-content:space-between;min-height:64px;border-bottom:1px solid var(--line)}
header strong{letter-spacing:.02em}header nav{display:flex;gap:14px;font-size:14px}
main{padding:26px 0 56px}h1{font-size:25px;margin:0 0 8px}h2{font-size:16px;margin:0 0 12px}
p{line-height:1.65;color:var(--muted);margin:0}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;margin-top:18px}
form{display:flex;gap:10px;flex-wrap:wrap}input{flex:1 1 280px;border:1px solid #c5c8cf;border-radius:10px;padding:12px 14px;font-size:16px}
button,.button{background:var(--ink);color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;cursor:pointer;text-decoration:none;display:inline-block}
button:disabled{opacity:.45;cursor:not-allowed}
#status{font-size:14px;margin-top:12px;min-height:1.4em;overflow-wrap:anywhere}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
.name{font-size:20px;font-weight:700;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.id{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}
.chip{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:#fafbfc}
.chip.ok{color:var(--ok);border-color:#bfe3cf;background:#f1faf5}.chip.warn{color:var(--warn);border-color:#f0d6b5;background:#fdf7ef}
.chip.no{color:var(--no);border-color:#f0c4c4;background:#fdf3f3}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:6px}
th,td{text-align:left;padding:9px 8px;border-top:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;border-top:0}
td{overflow-wrap:anywhere}.empty{color:var(--muted);font-size:14px;padding:8px 0}
section.block{margin-top:20px}
.note{font-size:13px;color:var(--muted);margin-top:14px}
@media(max-width:620px){.card{padding:16px}h1{font-size:21px}th:nth-child(4),td:nth-child(4){display:none}}
</style></head>
<body><header><strong>EKODI · 최고관리자</strong><nav><a href="/admin/site-admins">사이트 관리자 등록</a><a href="/admin/">관리자 홈</a></nav></header>
<main><h1>회원 권한 조회</h1>
<p>한 사람(EKODI Person)에 연결된 로그인 수단, 검증 상태, 사이트별 역할을 한 화면에서 확인합니다. 이메일·EKODI ID·내부 ID가 정확히 일치할 때만 조회되며, 모든 조회는 감사 기록에 남습니다.</p>
<div class="card">
<div id="signIn"><a class="button" id="loginLink" href="#">Google 계정으로 최고관리자 인증</a></div>
<form id="lookupForm" autocomplete="off" hidden>
<input id="query" name="q" required minlength="3" maxlength="254" placeholder="이메일, EKODI ID 또는 내부 ID" aria-label="조회할 이메일, EKODI ID 또는 내부 ID">
<button id="lookupButton" type="submit" disabled>조회</button>
</form>
<p id="status" role="status" aria-live="polite">권한 확인 중</p>
</div>
<div id="results"></div>
<p class="note">권한 부여·변경·회수는 각 사이트의 관리자 명단 화면에서 서버 재검증과 함께 처리합니다. 이 화면은 조회 전용입니다.</p>
</main><script src="/admin/people/script" defer></script></body></html>`,{
    headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
      'x-robots-tag':'noindex, nofollow, noarchive','x-frame-options':'DENY','content-security-policy':CSP}
  });
}

export function personAuthorityScript(){
  return new Response(String.raw`(() => {
  'use strict';
  const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
  const API=SUPABASE+'/functions/v1/access-api';
  const ANON='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const KEY='ekodi-person-authority-token';
  const $=id=>document.getElementById(id);
  const status=$('status'),form=$('lookupForm'),button=$('lookupButton'),results=$('results');
  const show=m=>{status.textContent=m;};
  const auth=new URL('/auth/',location.origin);
  auth.searchParams.set('site','portal');
  auth.searchParams.set('select_account','1');
  auth.searchParams.set('return_to',location.origin+location.pathname+location.search);
  $('loginLink').href=auth.href;
  let token='';
  // Which login the current session came from, for a clear "wrong account" message.
  const signedInAs=()=>{try{const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const email=String(p.email||'');const m=email.match(/^identity\+(kakao|naver)\./);
    return m?{provider:m[1]==='kakao'?'카카오':'네이버',email:''}:{provider:'',email};}catch{return {provider:'',email:''}}};
  const notAdminMessage=()=>{const w=signedInAs();
    return (w.provider?'현재 '+w.provider+' 로그인으로 접속되어 있으며, 이 계정은 최고관리자 Google 계정과 연결되어 있지 않습니다.'
      :(w.email?w.email+' 계정에는 최고관리자 권한이 없습니다.':'현재 로그인한 계정에는 최고관리자 권한이 없습니다.'))
      +' 위 버튼을 눌러 최고관리자 Google 계정을 선택해 다시 인증하세요.';};
  const PROVIDER={google:'Google',kakao:'카카오',naver:'네이버',email:'이메일'};
  const STATUS={active:'사용 중',revoked:'해제됨',merged:'병합됨',disabled:'비활성',pending:'대기',pre_registered:'사전등록'};
  const fmt=v=>{if(!v)return '-';const d=new Date(v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});};
  const short=v=>{const s=Array.from(String(v||''));return s.length>12?s.slice(0,12).join('')+'…':s.join('');};
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
  function chip(text,kind){return el('span','chip'+(kind?' '+kind:''),text);}
  function table(headers,rows){
    if(!rows.length)return el('p','empty','기록 없음');
    const t=el('table'),head=el('tr');headers.forEach(h=>head.append(el('th','',h)));t.append(head);
    rows.forEach(r=>{const tr=el('tr');r.forEach(c=>tr.append(el('td','',c)));t.append(tr);});return t;
  }
  function block(title,node){const s=el('section','block');s.append(el('h2','',title),node);return s;}
  function render(person){
    const card=el('article','card'),head=el('div','head');
    const p=person.person,a=person.authority;
    head.append(el('div','name',short(p.displayName||p.ekodiId||'에코디 회원')),el('div','id','EKODI ID '+(p.ekodiId||'-')+' · 내부 ID '+p.id));
    const chips=el('div','chips');
    chips.append(chip(STATUS[p.status]||p.status,p.status==='active'?'ok':'warn'));
    chips.append(chip(a.verifiedGoogle?'검증된 Google 연결':'검증된 Google 없음',a.verifiedGoogle?'ok':'warn'));
    if(a.platformAdminEffective)chips.append(chip('플랫폼 최고관리자','ok'));
    else if(a.platformAdminRole)chips.append(chip('최고관리자 역할 있음 · Google 증명 없어 미적용','no'));
    chips.append(chip('가입 '+fmt(p.createdAt)));
    card.append(head,chips);
    card.append(block('로그인 수단',table(['공급자','이메일','검증','상태','최근 사용'],
      person.identities.map(i=>[(PROVIDER[i.provider]||i.provider)+(i.isPrimary?' · 기본':'')+' '+i.subject,i.email,i.emailVerified?'검증됨':'미검증',STATUS[i.status]||i.status,fmt(i.lastSeenAt)]))));
    card.append(block('조직·사이트 역할',table(['조직','역할','상태'],
      person.tenantRoles.map(r=>[r.tenant?r.tenant.name+' ('+r.tenant.slug+')':'-',r.role,STATUS[r.status]||r.status]))));
    card.append(block('사이트 접근 등록',table(['사이트','조직','역할','상태','근거'],
      person.siteGrants.map(g=>[g.siteKey,g.tenant?g.tenant.slug:'-',g.role,STATUS[g.status]||g.status,(g.source||'-')+(g.plan?' · '+g.plan:'')]))));
    card.append(block('최근 인증 기록',table(['일시','동작','공급자'],
      person.recentAudit.map(x=>[fmt(x.at),x.action,x.provider||'-']))));
    const merges=Array.isArray(person.merges)?person.merges:[];
    if(merges.length){
      const list=el('div');
      merges.forEach(m=>{
        const row=el('p','',(m.role==='survivor'?'이 ID로 합쳐진 ':'다른 ID로 합쳐진 ')+(PROVIDER[m.provider]||m.provider)+' 계정 · '
          +(m.status==='executed'?'병합 '+fmt(m.executedAt):'되돌림 '+fmt(m.revertedAt)));
        if(m.status==='executed'){
          const undo=el('button','','되돌리기');undo.type='button';undo.style.marginLeft='10px';
          undo.addEventListener('click',async()=>{
            if(!confirm('이 계정 병합을 되돌릴까요? 합쳐졌던 로그인이 원래 계정으로 돌아갑니다.'))return;
            undo.disabled=true;
            try{const r=await call('/admin/merges/'+encodeURIComponent(m.id)+'/revert','POST');
              row.textContent='되돌렸습니다 (로그인 '+r.restored+'개 복원). 다시 조회하면 최신 상태가 보입니다.';}
            catch(error){undo.disabled=false;show('되돌리기 실패: '+error.message);}
          });
          row.append(undo);
        }
        list.append(row);
      });
      card.append(block('계정 병합 이력',list));
    }
    return card;
  }
  async function call(path,method='GET'){
    const res=await fetch(API+path,{method,headers:{apikey:ANON,authorization:'Bearer '+token},cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.code||data.error||'HTTP '+res.status);
    return data;
  }
  async function init(){
    const fragment=new URLSearchParams(location.hash.slice(1));
    const handoff=fragment.get('ekodi_token');
    if(handoff){
      history.replaceState(null,'',location.pathname+location.search);
      const r=await fetch(SUPABASE+'/auth/v1/verify',{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},
        body:JSON.stringify({token_hash:handoff,type:fragment.get('ekodi_type')||'email'}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.access_token)throw new Error('Google 인증 세션 확인 실패');
      token=data.access_token;try{sessionStorage.setItem(KEY,token)}catch{}
    }else{
      // The current central EKODI session wins over an older token kept in this tab,
      // so signing in again with another account takes effect immediately.
      try{const s=JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token')||'null');
        if(s?.access_token&&Number(s.expires_at||0)*1000>Date.now()+30000)token=s.access_token;}catch{}
      if(!token){try{token=sessionStorage.getItem(KEY)||''}catch{}}
    }
    if(!token){show('조회하려면 먼저 Google 계정으로 인증하세요.');return}
    const authority=await call('/platform-authority');
    if(authority.platformAdmin!==true){show(notAdminMessage());try{sessionStorage.removeItem(KEY)}catch{}return}
    $('signIn').hidden=true;form.hidden=false;button.disabled=false;
    show('최고관리자 확인 완료. 조회할 이메일, EKODI ID 또는 내부 ID를 입력하세요.');
    const q=new URL(location.href).searchParams.get('q');
    if(q){$('query').value=q;form.requestSubmit();}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(button.disabled)return;
    const q=$('query').value.trim();if(q.length<3){show('3자 이상 입력하세요.');return}
    button.disabled=true;results.replaceChildren();show('조회 중…');
    try{
      const data=await call('/admin/person?q='+encodeURIComponent(q));
      if(!data.matched){show('정확히 일치하는 회원이 없습니다.');return}
      show(data.matched===1?'1명의 회원을 찾았습니다.':data.matched+'명의 회원이 같은 이메일을 사용합니다. 계정 연결 여부를 확인하세요.');
      data.people.forEach(p=>results.append(render(p)));
    }catch(error){
      if(error.message==='platform_admin_required'){show('최고관리자 권한이 확인되지 않았습니다. 다시 인증하세요.');try{sessionStorage.removeItem(KEY)}catch{}}
      else show('조회 실패: '+error.message);
    }finally{button.disabled=false;}
  });
  init().catch(error=>{show('인증 확인 실패: '+error.message);try{sessionStorage.removeItem(KEY)}catch{}});
})();`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
