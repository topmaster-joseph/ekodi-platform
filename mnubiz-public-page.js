const MNUBIZ_SLUG='mnubiz';

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function isMnuBizWorkspaceSlug(value){return String(value||'').trim().toLowerCase()===MNUBIZ_SLUG;}

export function renderMnuBizPublicPage(){
  const name='국립목포대학교 경영동문회';
  const html=`<!doctype html><html lang="ko" data-ekodi-ui-surface="user-public" data-ekodi-site-subject="mnubiz"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(name)} · EKODI</title>
<meta name="description" content="국립목포대학교 경영 동문을 연결하고 소식·행사·진로·사업 경험을 나누는 동문 네트워크 운영공간">
<meta name="robots" content="index,follow">
<style>
:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#16231c;background:#f6f8f4;--ink:#16231c;--muted:#657268;--line:#dce4dc;--paper:#fff;--accent:#225f49}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:linear-gradient(180deg,#f8faf7,#f2f6f1)}a{color:inherit}.wrap{width:min(1120px,calc(100% - 32px));margin:auto}.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0}.brand{text-decoration:none;font-weight:850;letter-spacing:-.035em}.top nav{display:flex;gap:18px;font-size:13px;color:var(--muted)}.top nav a{text-decoration:none}.hero{padding:clamp(64px,10vw,120px) 0 62px}.kicker{font-size:12px;font-weight:850;letter-spacing:.14em;color:var(--accent)}h1{margin:14px 0 18px;font-size:clamp(38px,7vw,72px);line-height:1.04;letter-spacing:-.055em}.lead{max-width:760px;margin:0;font-size:clamp(17px,2.2vw,22px);line-height:1.7;color:#46534a;word-break:keep-all}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:30px}.button{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:800;border:1px solid var(--line);background:#fff}.button.primary{background:var(--accent);border-color:var(--accent);color:#fff}.section{padding:42px 0;border-top:1px solid var(--line)}.head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:20px}.head h2{margin:0;font-size:27px;letter-spacing:-.035em}.head p{margin:0;color:var(--muted);font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{min-height:180px;padding:21px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.9)}.card small{font-size:11px;font-weight:800;color:var(--accent);letter-spacing:.08em}.card h3{margin:14px 0 8px;font-size:19px}.card p{margin:0;color:var(--muted);font-size:14px;line-height:1.65;word-break:keep-all}.community{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.community>div{padding:26px;border-radius:20px;border:1px solid var(--line);background:#fff}.community h3{margin:0 0 10px;font-size:23px}.community p{margin:0;color:var(--muted);line-height:1.7}.empty{padding:22px;border:1px dashed #cbd6cd;border-radius:16px;color:var(--muted);background:rgba(255,255,255,.55)}footer{padding:44px 0 60px;color:var(--muted);font-size:12px}.foot{display:flex;justify-content:space-between;gap:16px}.admin{text-decoration:none}@media(max-width:760px){.top nav{display:none}.grid,.community{grid-template-columns:1fr}.head{align-items:start;flex-direction:column}.foot{flex-direction:column}}
</style></head><body>
<header><div class="wrap top"><a class="brand" href="/mnubiz">${esc(name)}</a><nav><a href="#about">소개</a><a href="#network">동문 네트워크</a><a href="#news">소식·행사</a><a href="/mnubiz/community">Community</a></nav></div></header>
<main>
<section class="hero"><div class="wrap"><div class="kicker">MOKPO NATIONAL UNIVERSITY · BUSINESS ALUMNI</div><h1>${esc(name)}</h1><p class="lead">동문을 잇고, 경험을 나누고, 다음 기회를 함께 만드는 경영동문 네트워크입니다. 공개 정보와 회원 전용 기능을 분리해 운영합니다.</p><div class="actions"><a class="button primary" href="/mnubiz/community">동문 Community</a><a class="button" href="#news">소식·행사</a><a class="button" href="/mnubiz/admin">운영자 관리</a></div></div></section>
<section class="section" id="about"><div class="wrap"><div class="head"><div><h2>동문회 운영공간</h2><p>공개 소개와 회원 활동을 한 주소에서 연결합니다.</p></div></div><div class="grid">
<article class="card"><small>CONNECT</small><h3>동문 연결</h3><p>졸업생과 재학생, 선후배가 필요한 관계를 찾고 서로의 경험을 나눌 수 있도록 연결합니다.</p></article>
<article class="card"><small>CAREER & BUSINESS</small><h3>진로 · 사업 네트워크</h3><p>취업, 창업, 경영, 협업 등 동문이 가진 현장 경험을 필요한 사람과 연결하는 기반을 둡니다.</p></article>
<article class="card"><small>ACTIVITY</small><h3>행사 · 소식 · 기록</h3><p>모임과 행사, 공지, 동문 소식을 축적하되 개인정보와 비공개 회원 정보는 공개 화면과 분리합니다.</p></article>
</div></div></section>
<section class="section" id="network"><div class="wrap"><div class="community"><div><h3>Community 엔진 연결</h3><p>동문 Circle, 회원 참여, 모임, 추천과 관계 기능은 Community를 Workspace 범위로 사용합니다. 다른 단체의 Community 데이터와 섞이지 않도록 <strong>mnubiz</strong> 공간 기준으로 분리합니다.</p><div class="actions"><a class="button primary" href="/mnubiz/community">Community 열기</a></div></div><div><h3>운영 원칙</h3><p>공개 페이지는 로그인 없이 열리고, 회원·관리자 기능은 역할과 권한을 확인한 뒤 추가됩니다.</p></div></div></div></section>
<section class="section" id="news"><div class="wrap"><div class="head"><div><h2>소식 · 행사</h2><p>검증된 동문회 공지와 일정만 공개합니다.</p></div></div><div class="empty">현재 공개된 동문회 공지·행사는 없습니다. 운영자가 확인한 내용부터 순서대로 표시됩니다.</div></div></section>
</main><footer><div class="wrap foot"><span>${esc(name)} · EKODI Workspace</span><a class="admin" href="/mnubiz/admin">관리자 페이지</a></div></footer>
</body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-workspace':'mnubiz','x-ekodi-community-scope':'workspace'}});
}
