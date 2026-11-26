// FACTCHAT-PORTAL-20261127: ekodi.kr/factchat — university-selectable FactChat (BAZE) workspace for EKODI admins.
//
// /factchat             → public guide: what FactChat is, how to start, university list
// /factchat/<slug>      → university page: sign in on the university's own FactChat site (its account, its rules)
// /factchat/<slug>/chat → EKODI admin-only built-in chat bound to that university's institutional API account
// /factchat/app.js|css  → this surface's own assets (strict CSP: nothing inline)
// The guide and university pages hold no account data; EKODI never sees the university sign-in.
//
// Security model: the page carries no secret and no account data. Every generation goes through the existing
// super_admin-only server path (/api/ai-modules/v1/providers/admin/<provider>/playground), which enforces the
// admin session, institutional-use approval, enabled flag, daily cap and institution-sponsored billing.
// The page only reads the admin session the visitor already holds in this tab (sessionStorage 'ekodi-auth-token').
// A university is usable only when it is listed here with status 'active' and a server-side provider id.

export const FACTCHAT_PORTAL_ROUTE='factchat-portal';
const PREFIX='/factchat';

// Add a university: one entry here + its institutional provider (key, approval) in the AI provider registry.
export const FACTCHAT_UNIVERSITIES=Object.freeze([
  Object.freeze({slug:'mokpo',name:'국립목포대학교',short:'목포대',provider:'factchat-institution',host:'mokpo.factchat.bot',loginUrl:'https://mokpo.factchat.bot/',status:'active'}),
]);

export function factChatUniversity(slug){
  const value=String(slug||'').trim().toLowerCase();
  return FACTCHAT_UNIVERSITIES.find(item=>item.slug===value)||null;
}
export function isFactChatPortalPath(pathname){
  return pathname===PREFIX||pathname.startsWith(PREFIX+'/');
}

// Only an https URL on the university's own listed host may be offered as a sign-in link.
export function factChatLoginUrl(u){
  try{const url=new URL(String(u?.loginUrl||''));if(url.protocol==='https:'&&url.hostname===u.host&&!url.username&&!url.password)return url.toString()}catch{}
  return '';
}

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function headers(type,extra={}){
  return {
    'content-type':type,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow',
    'referrer-policy':'same-origin',
    'x-ekodi-route':FACTCHAT_PORTAL_ROUTE,
    ...extra,
  };
}
const CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

function page({title,body,university}){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><link rel="stylesheet" href="${PREFIX}/app.css">
</head><body data-factchat-university="${esc(university?.slug||'')}" data-factchat-provider="${esc(university?.provider||'')}" data-factchat-name="${esc(university?.name||'')}">
${body}
<script src="${PREFIX}/app.js" defer></script></body></html>`;
}

const OUT='target="_blank" rel="noopener noreferrer"';
function pickerHtml(){
  const cards=FACTCHAT_UNIVERSITIES.map(u=>`<a class="fc-uni" href="${PREFIX}/${esc(u.slug)}" data-status="${esc(u.status)}"><strong>${esc(u.name)}</strong><small>${esc(u.host)} · ${u.status==='active'?'이용 안내·로그인':'준비 중'}</small><span class="fc-go" aria-hidden="true">→</span></a>`).join('');
  return page({title:'FactChat 안내 | EKODI',body:`<main class="fc-picker">
<header class="fc-head"><p class="fc-kicker">EKODI × FactChat</p><h1>대학 FactChat 이용 안내</h1>
<p>FactChat(팩트챗)은 마인드로직이 제공하는 생성형 AI 플랫폼으로, 현재 이름은 <b>BAZE Enterprise</b>입니다. 대학이 기관 단위로 도입하면 학생·교직원이 학교 계정으로 여러 AI 모델을 한곳에서 사용할 수 있습니다.</p></header>
<section class="fc-info" aria-label="FactChat 기본 안내">
<div><h2>무엇을 할 수 있나요</h2><ul><li>대화형 질문·답변, 글쓰기·요약·번역</li><li>여러 AI 모델을 골라 비교 사용</li><li>학교가 정한 범위 안에서 문서·자료 활용</li></ul></div>
<div><h2>이용 방법</h2><ol><li>아래에서 소속 대학을 선택합니다.</li><li>대학 FactChat 사이트로 이동해 학교에서 안내한 계정으로 로그인합니다.</li><li>로그인 후 바로 대화를 시작합니다.</li></ol></div>
<div><h2>꼭 알아두세요</h2><ul><li>로그인은 각 대학 FactChat 사이트에서 이뤄지며, EKODI는 계정 정보를 받지 않습니다.</li><li>사용 가능 모델·한도·이용 범위는 대학 정책을 따릅니다.</li><li>개인정보·비밀번호·민감 자료는 입력하지 마세요.</li></ul></div>
</section>
<h2 class="fc-sub">대학 선택</h2>
<nav class="fc-unis" aria-label="대학 목록">${cards}</nav>
<p class="fc-note">목록에 없는 대학은 해당 대학 FactChat 도입 여부를 학교에 확인하세요. EKODI 관리자 내장 채팅은 각 대학 페이지에서 최고관리자만 열 수 있습니다.</p>
</main>`});
}

function universityHtml(u){
  const login=factChatLoginUrl(u);
  return page({title:`${u.short} FactChat 로그인 | EKODI`,body:`<main class="fc-picker">
<p class="fc-crumb"><a href="${PREFIX}/">← FactChat 안내</a></p>
<header class="fc-head"><p class="fc-kicker">${esc(u.host)}</p><h1>${esc(u.name)} FactChat</h1>
<p>${esc(u.name)} 구성원은 학교 FactChat 사이트에서 로그인해 바로 사용할 수 있습니다.</p></header>
${login?`<p class="fc-cta-row"><a class="fc-cta" href="${esc(login)}" ${OUT} data-factchat-login>${esc(u.short)} FactChat 로그인하고 사용하기 ↗</a></p>
<p class="fc-small">새 창에서 <b>${esc(u.host)}</b>(학교 공식 FactChat)로 이동합니다. 로그인 방법·계정 문의는 학교 안내를 따르세요.</p>`:'<p class="fc-note">이 대학의 로그인 주소가 아직 등록되지 않았습니다.</p>'}
<section class="fc-info" aria-label="이용 순서">
<div><h2>1. 로그인</h2><p>위 버튼으로 ${esc(u.short)} FactChat에 접속해 학교에서 안내한 계정으로 로그인합니다.</p></div>
<div><h2>2. 모델 선택</h2><p>대화 화면에서 사용할 AI 모델을 고릅니다. 제공 모델은 학교 설정에 따라 다릅니다.</p></div>
<div><h2>3. 대화 시작</h2><p>질문을 입력하면 됩니다. 결과는 반드시 사실 확인 후 사용하세요.</p></div>
</section>
<aside class="fc-admin"><h2>EKODI 관리자용</h2><p>EKODI 최고관리자는 승인된 ${esc(u.short)} 기관계정 API로 EKODI 안에서 바로 대화할 수 있습니다.</p><p><a href="${PREFIX}/${esc(u.slug)}/chat" data-factchat-admin-chat>관리자 내장 채팅 열기 →</a></p></aside>
</main>`});
}

function chatHtml(u){
  const others=FACTCHAT_UNIVERSITIES.map(item=>`<option value="${esc(item.slug)}"${item.slug===u.slug?' selected':''}>${esc(item.short)}</option>`).join('');
  return page({title:`${u.short} FactChat | EKODI`,university:u,body:`<div class="fc-app">
<header class="fc-bar">
  <a class="fc-home" href="${PREFIX}/${esc(u.slug)}" aria-label="대학 안내로">FactChat · 관리자</a>
  <label class="fc-field"><span>대학</span><select id="fcUniversity" aria-label="대학 선택">${others}</select></label>
  <label class="fc-field"><span>모델</span><select id="fcModel" aria-label="모델 선택"><option value="">기본 모델</option></select></label>
  <button type="button" id="fcNew" class="fc-ghost">새 대화</button>
</header>
<section id="fcGate" class="fc-gate" hidden></section>
<main id="fcThread" class="fc-thread" aria-live="polite">
  <div class="fc-welcome" id="fcWelcome"><h1>${esc(u.name)} FactChat</h1><p>무엇을 도와드릴까요? 아래 빠른 선택으로 시작할 수 있습니다.</p><div class="fc-templates" id="fcTemplates"></div></div>
</main>
<form id="fcForm" class="fc-composer" autocomplete="off">
  <textarea id="fcInput" rows="2" maxlength="6000" placeholder="${esc(u.short)} 기관계정 AI에게 질문하기 (Enter 전송 · Shift+Enter 줄바꿈)" aria-label="질문 입력"></textarea>
  <button type="submit" id="fcSend">전송</button>
  <p class="fc-meta" id="fcMeta">기관 크레딧 사용 · 개인정보·비밀번호는 입력하지 마세요</p>
</form>
</div>`});
}

export const FACTCHAT_PORTAL_CSS=`:root{color-scheme:light dark;--bg:#f7f7f5;--panel:#fff;--ink:#1d1d1b;--muted:#5f5f5a;--line:#d9d9d4;--accent:#1f5f8b;--accent-ink:#fff;--user:#eef3f7}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--panel:#1f1f1f;--ink:#ececea;--muted:#a8a8a2;--line:#353533;--accent:#6fb1e0;--accent-ink:#0d1b26;--user:#23303a}}
*{box-sizing:border-box}html,body{margin:0;height:100%}body{background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--accent)}button,select,textarea{font:inherit;color:inherit}
.fc-picker{max-width:720px;margin:0 auto;padding:40px 16px}.fc-kicker{margin:0;color:var(--muted);font-size:13px;font-weight:700}.fc-head h1{margin:4px 0 8px;font-size:28px}.fc-head p,.fc-note{color:var(--muted)}
.fc-unis{display:grid;gap:10px;margin:20px 0}.fc-uni{display:grid;gap:2px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);text-decoration:none}.fc-uni:hover{border-color:var(--accent)}.fc-uni strong{font-size:17px}.fc-uni small{color:var(--muted)}
.fc-info{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:20px 0}.fc-info>div,.fc-admin{padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.fc-info h2,.fc-admin h2{margin:0 0 6px;font-size:15px}.fc-info ul,.fc-info ol{margin:0;padding-left:18px}.fc-info p,.fc-admin p{margin:0 0 4px}
.fc-sub{font-size:18px;margin:24px 0 0}.fc-uni{grid-template-columns:1fr auto;align-items:center}.fc-uni .fc-go{grid-row:1/3;grid-column:2;font-size:20px;color:var(--accent)}
.fc-crumb{margin:0 0 12px;font-size:14px}.fc-cta-row{margin:20px 0 6px}.fc-cta{display:inline-block;padding:12px 20px;border-radius:12px;background:var(--accent);color:var(--accent-ink);font-weight:800;text-decoration:none}.fc-small{font-size:13px;color:var(--muted);margin:0}
.fc-admin{margin-top:20px;border-style:dashed}.fc-admin p{color:var(--muted)}.fc-admin a{font-weight:700}
.fc-app{display:grid;grid-template-rows:auto auto 1fr auto;height:100dvh;max-width:880px;margin:0 auto}
.fc-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--bg);position:sticky;top:0}
.fc-home{font-weight:800;text-decoration:none;color:var(--ink);margin-right:auto}.fc-field{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.fc-field select{min-height:34px;max-width:200px;padding:4px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.fc-ghost{min-height:34px;padding:4px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);cursor:pointer}
.fc-gate{margin:16px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.fc-gate h2{margin:0 0 6px;font-size:17px}.fc-gate a{font-weight:700}
.fc-thread{overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px}
.fc-welcome{margin:auto 0;text-align:center}.fc-welcome h1{font-size:24px;margin:0 0 6px}.fc-welcome p{color:var(--muted);margin:0 0 16px}
.fc-templates{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.fc-templates button{min-height:34px;padding:4px 14px;border:1px solid var(--line);border-radius:999px;background:var(--panel);cursor:pointer}.fc-templates button:hover{border-color:var(--accent)}
.fc-msg{max-width:100%;display:grid;gap:4px}.fc-msg .fc-who{font-size:12px;font-weight:700;color:var(--muted)}
.fc-msg .fc-body{white-space:pre-wrap;padding:10px 14px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}
.fc-msg.user{justify-items:end}.fc-msg.user .fc-body{background:var(--user);max-width:85%}.fc-msg.error .fc-body{border-color:#b3261e}
.fc-msg .fc-foot{font-size:12px;color:var(--muted)}.fc-msg .fc-copy{border:0;background:none;color:var(--accent);cursor:pointer;padding:0;font-size:12px}
.fc-composer{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px 16px 14px;border-top:1px solid var(--line);background:var(--bg)}
.fc-composer textarea{min-height:48px;max-height:40vh;resize:vertical;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.fc-composer button{min-width:72px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-ink);font-weight:700;cursor:pointer}.fc-composer button:disabled{opacity:.5;cursor:wait}
.fc-meta{grid-column:1/-1;margin:0;font-size:12px;color:var(--muted)}
@media(max-width:560px){.fc-bar{gap:6px}.fc-home{flex-basis:100%}.fc-field select{max-width:140px}.fc-msg.user .fc-body{max-width:100%}}`;

export const FACTCHAT_PORTAL_JS=`(()=>{'use strict';
const body=document.body,slug=body.dataset.factchatUniversity,provider=body.dataset.factchatProvider,uniName=body.dataset.factchatName;
if(!slug)return;
const $=id=>document.getElementById(id);
const API='/api/ai-modules/v1/providers/admin/'+encodeURIComponent(provider);
const KEY='ekodi-factchat-thread:'+slug;
const TEMPLATES=[
 ['회의록 정리','다음 회의 메모를 기관 회의록 형식(일시·참석·안건·논의·결정·후속조치·담당·기한)으로 정리해줘. 결정되지 않은 사항은 "확인필요"로 표시해줘.\\n\\n[회의 메모 붙여넣기]'],
 ['공문 초안','다음 내용을 대학 행정 공문 초안으로 작성해줘. 제목, 관련 근거, 본문(1·2·3 항목), 붙임, 끝. 형식으로 정중하고 간결하게.\\n\\n수신: [부서명]\\n내용: [전달할 내용]'],
 ['보고서 요약','다음 보고서를 결재권자용으로 요약해줘. ① 핵심 3줄 ② 주요 수치 ③ 쟁점·리스크 ④ 요청 사항 순서로, 원문에 없는 내용은 추가하지 마.\\n\\n[보고서 본문 붙여넣기]'],
 ['행사 안내문','다음 정보로 교직원 대상 행사 안내문을 작성해줘. 제목, 일시, 장소, 대상, 내용, 신청 방법, 문의처 순서로.\\n\\n행사명: [ ]\\n일시·장소: [ ]\\n대상: [ ]'],
 ['이메일 회신','다음 이메일에 대한 정중한 회신 초안을 써줘. 요청 사항에는 수락/조건부 수락/정중한 거절 중 [선택]으로 답하고, 다음 단계를 한 줄로 제안해줘.\\n\\n[받은 이메일 붙여넣기]'],
 ['발표 자료 개요','다음 주제로 10분 발표용 슬라이드 개요를 만들어줘. 슬라이드 8장 내외, 장마다 제목·핵심 메시지 1줄·글머리 3개. 마지막 장은 요청/결론.\\n\\n주제: [ ]\\n청중: [ ]'],
 ['부서 협업 정리','다음 업무를 여러 부서가 나눠 맡는다고 할 때, 부서별 역할·산출물·일정·의존관계를 표로 정리하고 병목이 될 수 있는 지점을 짚어줘.\\n\\n업무: [ ]\\n참여 부서: [ ]']
];
const SECRET=/(?:sk-[A-Za-z0-9]{16,}|password\\s*[:=]|비밀번호\\s*[:=]|api[_-]?key\\s*[:=]|\\b\\d{6}-[1-4]\\d{6}\\b)/i;
const ERRORS={institution_account_super_admin_required:'최고관리자만 사용할 수 있습니다.',institution_account_approval_required:'기관계정 사용 승인이 꺼져 있습니다. AI 운영센터에서 승인 후 저장하세요.',institution_account_disabled:'기관계정이 꺼져 있습니다. AI 운영센터에서 사용을 켜 주세요.',secret_not_configured:'기관계정 API 키가 연결되지 않았습니다.',institution_daily_limit_reached:'오늘 기관계정 호출 한도에 도달했습니다.',unauthorized:'관리자 로그인이 필요합니다.',input_required:'질문을 입력해 주세요.'};
let token='';try{token=sessionStorage.getItem('ekodi-auth-token')||''}catch{}
let thread=[];try{thread=JSON.parse(sessionStorage.getItem(KEY)||'[]');if(!Array.isArray(thread))thread=[]}catch{thread=[]}
const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(thread.slice(-40)))}catch{}};
async function api(path,opts={}){
  const res=await fetch(API+path,{...opts,headers:{'content-type':'application/json',authorization:'Bearer '+token,...(opts.headers||{})},credentials:'same-origin'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(data.error||data.code||('http_'+res.status));e.status=res.status;throw e}
  return data;
}
function gate(html){const g=$('fcGate');g.innerHTML=html;g.hidden=false;$('fcInput').disabled=true;$('fcSend').disabled=true}
const back=encodeURIComponent(location.pathname);
const LOGIN='<h2>관리자 전용입니다</h2><p>EKODI 관리자로 로그인한 같은 창에서 열어야 사용할 수 있습니다.</p><p><a href="/admin/?next='+back+'">관리자 로그인 →</a> 로그인 후 AI 운영센터의 「FactChat 포털」 링크로 이동하세요.</p>';
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function render(){
  const box=$('fcThread');[...box.querySelectorAll('.fc-msg')].forEach(n=>n.remove());
  $('fcWelcome').hidden=thread.length>0;
  for(const m of thread){
    const wrap=el('div','fc-msg '+m.role+(m.error?' error':''));
    wrap.append(el('span','fc-who',m.role==='user'?'나':(uniName+' FactChat')),el('div','fc-body',m.text));
    if(m.role==='assistant'&&!m.error){const foot=el('div','fc-foot',(m.model||'')+(m.usage?' · 입력 '+m.usage.inputUnits+' / 출력 '+m.usage.outputUnits+' 토큰 · 기관 크레딧':'')+' ');const c=el('button','fc-copy','복사');c.type='button';c.onclick=()=>navigator.clipboard?.writeText(m.text).then(()=>{c.textContent='복사됨'});foot.append(c);wrap.append(foot)}
    box.append(wrap);
  }
  box.scrollTop=box.scrollHeight;
}
function templates(){
  const t=$('fcTemplates');
  TEMPLATES.forEach(([label,text])=>{const b=el('button','',label);b.type='button';b.onclick=()=>{const a=$('fcInput');a.value=text;a.focus();const i=text.indexOf('[');if(i>=0)a.setSelectionRange(i,text.indexOf(']',i)+1)};t.append(b)});
}
async function boot(){
  templates();render();
  $('fcUniversity').onchange=e=>{location.href='/factchat/'+encodeURIComponent(e.target.value)+'/chat'};
  $('fcNew').onclick=()=>{thread=[];save();render();$('fcInput').focus()};
  if(!token){gate(LOGIN);return}
  try{
    const s=await fetch('/api/session',{headers:{authorization:'Bearer '+token},credentials:'same-origin'}).then(r=>r.json());
    if(!s?.authenticated){gate(LOGIN);return}
    if(String(s.role||'').toLowerCase()!=='super_admin'){gate('<h2>최고관리자 전용입니다</h2><p>현재 계정('+String(s.email||'').replace(/[<>&"]/g,'')+')은 기관계정을 사용할 수 없습니다.</p>');return}
  }catch{gate(LOGIN);return}
  try{
    const r=await api('/models');
    const sel=$('fcModel');
    if(r.defaultModel)sel.options[0].textContent='기본 · '+r.defaultModel;
    (r.models||[]).slice(0,120).forEach(id=>sel.append(new Option(id,id)));
    try{const saved=localStorage.getItem('ekodi-factchat-model:'+slug);if(saved&&[...sel.options].some(o=>o.value===saved))sel.value=saved}catch{}
    sel.onchange=()=>{try{localStorage.setItem('ekodi-factchat-model:'+slug,sel.value)}catch{}};
  }catch(e){if(e.status===401||e.status===403){gate(LOGIN);return}$('fcMeta').textContent='모델 목록을 불러오지 못했습니다. 기본 모델로 대화할 수 있습니다.'}
}
async function send(){
  const input=$('fcInput'),text=input.value.trim();if(!text)return;
  if(SECRET.test(text)){$('fcMeta').textContent='비밀번호·API 키·주민등록번호처럼 보이는 값은 보내지 않습니다. 지우고 다시 시도하세요.';return}
  const history=thread.filter(m=>!m.error).slice(-6);
  thread.push({role:'user',text});save();render();input.value='';
  $('fcSend').disabled=true;$('fcMeta').textContent='답변을 만드는 중입니다…';
  const transcript=history.map(m=>(m.role==='user'?'사용자':'AI')+': '+String(m.text).slice(0,900)).join('\\n');
  const payload=transcript?('[이전 대화]\\n'+transcript+'\\n\\n[이번 질문]\\n'+text).slice(-7800):text;
  try{
    const r=await api('/playground',{method:'POST',headers:{'x-ekodi-confirm-impact':'factchat-institution-playground'},body:JSON.stringify({input:payload,model:$('fcModel').value||undefined,system:'당신은 '+uniName+' 교직원 업무를 돕는 한국어 AI 비서입니다. 이전 대화 맥락을 이어서 간결하고 정확하게 답하고, 모르는 것은 확인필요라고 말하세요.'})});
    if(r.ok)thread.push({role:'assistant',text:String(r.text||''),model:r.model,usage:r.usage});
    else thread.push({role:'assistant',error:true,text:'호출 실패: '+(r.providerMessage||r.code||'알 수 없음')});
  }catch(e){
    if(e.status===401){gate(LOGIN)}
    thread.push({role:'assistant',error:true,text:ERRORS[e.message]||('호출 실패: '+e.message)});
  }
  save();render();$('fcSend').disabled=false;$('fcMeta').textContent='기관 크레딧 사용 · 개인정보·비밀번호는 입력하지 마세요';input.focus();
}
$('fcForm').addEventListener('submit',e=>{e.preventDefault();send()});
$('fcInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
boot();
})();`;

export async function routeFactChatPortal(request){
  const url=new URL(request.url);
  if(!isFactChatPortalPath(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:headers('text/plain; charset=utf-8',{allow:'GET, HEAD'})});
  const head=request.method==='HEAD';
  const path=url.pathname.replace(/\/+$/,'')||PREFIX;
  if(path===PREFIX+'/app.js')return new Response(head?null:FACTCHAT_PORTAL_JS,{headers:headers('text/javascript; charset=utf-8')});
  if(path===PREFIX+'/app.css')return new Response(head?null:FACTCHAT_PORTAL_CSS,{headers:headers('text/css; charset=utf-8')});
  if(path===PREFIX)return new Response(head?null:pickerHtml(),{headers:headers('text/html; charset=utf-8',{'content-security-policy':CSP})});
  const match=/^\/factchat\/([a-z0-9-]{2,40})(\/chat)?$/.exec(path);
  const university=match?factChatUniversity(match[1]):null;
  if(!university||university.status!=='active')return Response.redirect(new URL(PREFIX+'/',url).toString(),302);
  const html=match[2]?chatHtml(university):universityHtml(university);
  return new Response(head?null:html,{headers:headers('text/html; charset=utf-8',{'content-security-policy':CSP})});
}
