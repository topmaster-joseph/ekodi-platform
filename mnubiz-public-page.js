const MNUBIZ_SLUG='mnubiz';

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function isMnuBizWorkspaceSlug(value){return String(value||'').trim().toLowerCase()===MNUBIZ_SLUG;}

const CSS=`
:root{
  color-scheme:only light;
  --mnubiz-ink:#10233b;
  --mnubiz-ink-soft:#42546a;
  --mnubiz-paper:#f7f3ea;
  --mnubiz-paper-2:#fffdf8;
  --mnubiz-line:#d9d1c2;
  --mnubiz-navy:#0d2c4a;
  --mnubiz-navy-2:#173d63;
  --mnubiz-brass:#a77a35;
  --mnubiz-brass-soft:#e8dbc2;
  --ekodi-service-paper:#f7f3ea;
  --ekodi-service-accent:#a77a35;
  --ekodi-user-footer-background:#0d2c4a;
  --ekodi-user-footer-border:rgba(255,255,255,.16);
  --ekodi-user-footer-safe-text:#fffdf8;
  --ekodi-user-footer-safe-muted:#d8d3c9;
  --ekodi-user-chrome-bg:#fbf8f1;
  --ekodi-user-chrome-text:#10233b;
  --ekodi-user-chrome-muted:#5e6b7b;
  --ekodi-user-chrome-link:#173d63;
  --ekodi-user-chrome-line:rgba(16,35,59,.16);
  font-family:Inter,Pretendard,"Noto Sans KR","Malgun Gothic",system-ui,sans-serif;
  background:var(--mnubiz-paper);
  color:var(--mnubiz-ink);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;background:#f7f3ea!important}
html[data-ekodi-site-subject="mnubiz"][data-ekodi-user-ui]{--ekodi-user-chrome-bg:#fbf8f1!important;--ekodi-user-chrome-text:#10233b!important;--ekodi-user-chrome-muted:#5e6b7b!important;--ekodi-user-chrome-link:#173d63!important;--ekodi-user-chrome-line:rgba(16,35,59,.16)!important;--ekodi-service-paper:#f7f3ea!important;--ekodi-service-ink:#10233b!important}
html[data-ekodi-site-subject="mnubiz"][data-ekodi-user-ui] body>main.mnubiz-main{width:100%!important;max-width:none!important;margin-inline:0!important}
body{margin:0;background:#f7f3ea!important;color:#10233b!important}
a{color:inherit}
.mnubiz-shell{width:min(1180px,calc(100% - 40px));margin-inline:auto}
.site-header.mnubiz-header{position:relative;z-index:20;border-bottom:1px solid rgba(16,35,59,.14)!important;background:rgba(251,248,241,.97)!important;backdrop-filter:blur(16px);color:#10233b!important}
.mnubiz-header__inner{min-height:72px;display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:24px;align-items:center}
.mnubiz-brand{text-decoration:none;display:flex;align-items:center;gap:12px;min-width:0;color:#10233b!important}
.mnubiz-brand__mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--mnubiz-brass);background:var(--mnubiz-paper-2);font-weight:900;font-size:11px;letter-spacing:.06em;color:var(--mnubiz-navy)}
.mnubiz-brand__text{display:grid;gap:2px;min-width:0}
.mnubiz-brand__name{font-size:15px;font-weight:850;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#10233b!important}
.mnubiz-brand__sub{font-size:10px;font-weight:750;letter-spacing:.12em;color:var(--mnubiz-brass);white-space:nowrap}
.mnubiz-nav{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
.mnubiz-nav a{padding:9px 10px;text-decoration:none;font-size:13px;font-weight:700;color:var(--mnubiz-ink-soft);border-bottom:2px solid transparent}
.mnubiz-nav a:hover,.mnubiz-nav a:focus-visible{color:var(--mnubiz-navy);border-bottom-color:var(--mnubiz-brass);outline:none}
.mnubiz-main{width:100%;min-width:0;background:#f7f3ea!important;color:#10233b!important}
.mnubiz-hero{position:relative;overflow:hidden;padding:clamp(72px,10vw,132px) 0 clamp(64px,8vw,96px);border-bottom:1px solid #d9d1c2!important;background:linear-gradient(135deg,#fffdf8 0%,#f7f3ea 58%,#f0e7d8 100%)!important;color:#10233b!important}
.mnubiz-hero:after{content:"";position:absolute;width:min(520px,54vw);aspect-ratio:1;right:max(-170px,calc((100vw - 1180px)/2 - 120px));top:-190px;border:1px solid rgba(167,122,53,.2);border-radius:50%;box-shadow:0 0 0 54px rgba(167,122,53,.045),0 0 0 108px rgba(13,44,74,.025);pointer-events:none}
.mnubiz-kicker{margin:0 0 18px;font-size:11px;line-height:1.4;font-weight:900;letter-spacing:.16em;color:var(--mnubiz-brass)}
.mnubiz-hero h1{max-width:850px;margin:0;font-size:clamp(42px,7vw,78px);line-height:1.02;letter-spacing:-.055em;color:#0d2c4a!important;word-break:keep-all}
.mnubiz-lead{max-width:760px;margin:26px 0 0;font-size:clamp(17px,2vw,22px);line-height:1.72;color:#42546a!important;word-break:keep-all}
.mnubiz-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:32px}
.mnubiz-button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 17px;border:1px solid var(--mnubiz-line);background:var(--mnubiz-paper-2);text-decoration:none;font-size:14px;font-weight:800;letter-spacing:-.01em}
.mnubiz-button--primary{border-color:var(--mnubiz-navy);background:var(--mnubiz-navy);color:#fff}
.mnubiz-button:hover,.mnubiz-button:focus-visible{transform:translateY(-1px);box-shadow:0 10px 28px rgba(13,44,74,.08);outline:2px solid transparent}
.mnubiz-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:46px;border-top:1px solid var(--mnubiz-line);border-bottom:1px solid var(--mnubiz-line)}
.mnubiz-meta>div{padding:18px 18px 18px 0}
.mnubiz-meta>div+div{padding-left:18px;border-left:1px solid var(--mnubiz-line)}
.mnubiz-meta strong{display:block;font-size:12px;letter-spacing:.05em;color:#173d63!important}
.mnubiz-meta span{display:block;margin-top:6px;font-size:13px;line-height:1.5;color:#526276!important}
.mnubiz-section{padding:clamp(54px,7vw,88px) 0;border-bottom:1px solid #d9d1c2!important;background:#f7f3ea!important;color:#10233b!important}
.mnubiz-section__head{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,420px);gap:32px;align-items:end;margin-bottom:30px}
.mnubiz-section__eyebrow{margin:0 0 8px;font-size:10px;font-weight:900;letter-spacing:.16em;color:var(--mnubiz-brass)}
.mnubiz-section h2{margin:0;font-size:clamp(28px,4vw,44px);letter-spacing:-.045em;line-height:1.12;color:#0d2c4a!important}
.mnubiz-section__desc{margin:0;color:#526276!important;font-size:14px;line-height:1.7;word-break:keep-all}
.mnubiz-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--mnubiz-line);border-left:1px solid var(--mnubiz-line)}
.mnubiz-card{min-height:225px;padding:28px;border-right:1px solid #d9d1c2!important;border-bottom:1px solid #d9d1c2!important;background:#fffdf8!important;color:#10233b!important}
.mnubiz-card__index{font:800 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;color:var(--mnubiz-brass)}
.mnubiz-card h3{margin:36px 0 10px;font-size:21px;letter-spacing:-.03em;color:#0d2c4a!important}
.mnubiz-card p{margin:0;color:#526276!important;font-size:14px;line-height:1.7;word-break:keep-all}
.mnubiz-network{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:16px}
.mnubiz-network__primary,.mnubiz-network__aside{padding:clamp(28px,4vw,44px);border:1px solid #d9d1c2!important;background:#fffdf8!important}
.mnubiz-network__primary{background:linear-gradient(135deg,#0d2c4a,#173d63)!important;color:#fff!important}
.mnubiz-network__primary .mnubiz-section__eyebrow{color:#d9b97c}
.mnubiz-network__primary h3{margin:0;font-size:clamp(27px,4vw,42px);line-height:1.12;letter-spacing:-.04em}
.mnubiz-network__primary p{max-width:680px;margin:16px 0 0;color:#dce6ef;line-height:1.75;word-break:keep-all}
.mnubiz-network__primary .mnubiz-button{margin-top:26px;border-color:#fff;background:#fff;color:var(--mnubiz-navy)}
.mnubiz-network__aside h3{margin:0 0 12px;font-size:20px;color:#0d2c4a!important}
.mnubiz-network__aside p{margin:0;color:#526276!important;font-size:14px;line-height:1.7;word-break:keep-all}
.mnubiz-empty{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start;padding:26px 0;border-top:1px solid var(--mnubiz-line);border-bottom:1px solid var(--mnubiz-line)}
.mnubiz-empty__date{font:800 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mnubiz-brass);letter-spacing:.08em}
.mnubiz-empty strong{display:block;font-size:16px;color:var(--mnubiz-navy)}
.mnubiz-empty p{margin:7px 0 0;color:var(--mnubiz-ink-soft);font-size:14px;line-height:1.65}
.mnubiz-service-note{padding:18px 0 8px;text-align:center;color:#526276!important;font-size:12px;line-height:1.6;background:#f7f3ea!important}
.mnubiz-character-zone,.mnubiz-character-zone.ekodi-main-ekodian-host{position:absolute!important;right:max(24px,calc((100vw - 1180px)/2));left:auto!important;bottom:34px;top:auto!important;width:142px;height:154px;z-index:2;pointer-events:none}
.mnubiz-character-zone .ekodi-main-ekodian{inset:auto 0 0 auto!important;transform:none!important;--ekodi-character-width:108px!important;opacity:.72!important}
.mnubiz-hero>.mnubiz-shell{position:relative;z-index:2;padding-right:200px}
@media(prefers-color-scheme:dark){
  html[data-ekodi-site-subject="mnubiz"],html[data-ekodi-site-subject="mnubiz"] body,html[data-ekodi-site-subject="mnubiz"] .mnubiz-main{background:#f7f3ea!important;color:#10233b!important}
  html[data-ekodi-site-subject="mnubiz"] .mnubiz-header{background:rgba(251,248,241,.98)!important;color:#10233b!important}
  html[data-ekodi-site-subject="mnubiz"] .mnubiz-hero{background:linear-gradient(135deg,#fffdf8 0%,#f7f3ea 58%,#f0e7d8 100%)!important;color:#10233b!important}
  html[data-ekodi-site-subject="mnubiz"] .mnubiz-section{background:#f7f3ea!important;color:#10233b!important}
  html[data-ekodi-site-subject="mnubiz"] .mnubiz-card,html[data-ekodi-site-subject="mnubiz"] .mnubiz-network__aside{background:#fffdf8!important;color:#10233b!important}
}
@media(max-width:860px){
  .mnubiz-shell{width:min(100% - 28px,1180px)}
  .mnubiz-header__inner{grid-template-columns:1fr;gap:10px;padding:12px 0}
  .mnubiz-nav{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px}
  .mnubiz-nav a{white-space:nowrap}
  .mnubiz-section__head,.mnubiz-network{grid-template-columns:1fr}
  .mnubiz-hero>.mnubiz-shell{padding-right:0}
  .mnubiz-character-zone{display:none}
  .mnubiz-grid{grid-template-columns:1fr}
  .mnubiz-meta{grid-template-columns:1fr}
  .mnubiz-meta>div{padding:14px 0!important;border-left:0!important}
  .mnubiz-meta>div+div{border-top:1px solid var(--mnubiz-line)}
}
@media(max-width:520px){
  .mnubiz-shell{width:min(100% - 22px,1180px)}
  .mnubiz-hero{padding-top:58px}
  .mnubiz-hero h1{font-size:clamp(38px,12vw,54px)}
  .mnubiz-card{padding:22px;min-height:0}
  .mnubiz-button{width:100%}
  .mnubiz-actions{display:grid;grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.mnubiz-button{transition:none}}
`;

export function mnubizPublicCss(){
  return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
}

export function renderMnuBizPublicPage(){
  const name='국립목포대학교 경영동문회';
  const html=`<!doctype html><html lang="ko" data-ekodi-ui-surface="user-public" data-ekodi-site-subject="mnubiz" data-ekodi-user-header="default"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(name)} · EKODI</title>
<meta name="description" content="국립목포대학교 경영 동문을 연결하고 소식·행사·진로·사업 경험을 나누는 동문 네트워크">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="/mnubiz/assets/site.css?v=20260924-3">
</head><body>
<header class="site-header mnubiz-header" role="banner">
  <div class="mnubiz-shell mnubiz-header__inner">
    <a class="mnubiz-brand" data-ekodi-header-home href="/mnubiz/" aria-label="${esc(name)} 홈">
      <span class="mnubiz-brand__mark" aria-hidden="true">MNU</span>
      <span class="mnubiz-brand__text"><strong class="mnubiz-brand__name" data-ekodi-header-site-name>${esc(name)}</strong><span class="mnubiz-brand__sub">BUSINESS ALUMNI</span></span>
    </a>
    <nav class="mnubiz-nav" data-ekodi-header-actions aria-label="동문회 주요 메뉴">
      <a href="#about">소개</a><a href="#network">동문 네트워크</a><a href="#news">소식 · 행사</a>
    </nav>
  </div>
</header>
<main class="mnubiz-main" id="main">
  <section class="mnubiz-hero">
    <div class="mnubiz-shell">
      <p class="mnubiz-kicker">MOKPO NATIONAL UNIVERSITY · BUSINESS ALUMNI</p>
      <h1>${esc(name)}</h1>
      <p class="mnubiz-lead">동문을 잇고, 경험을 나누고, 다음 기회를 함께 만드는 경영동문 네트워크입니다. 공개 정보와 회원 활동을 명확히 구분하면서 서로의 경험과 기회를 연결합니다.</p>
      <div class="mnubiz-actions"><a class="mnubiz-button mnubiz-button--primary" href="/mnubiz/community">동문 Community</a><a class="mnubiz-button" href="#news">소식 · 행사 보기</a></div>
      <div class="mnubiz-meta" aria-label="동문회 운영 구조">
        <div><strong>NETWORK</strong><span>선후배 · 재학생 · 졸업생 연결</span></div>
        <div><strong>CAREER & BUSINESS</strong><span>진로 · 창업 · 경영 경험 공유</span></div>
        <div><strong>MEMBER SPACE</strong><span>회원 활동은 Workspace 범위로 분리</span></div>
      </div>
    </div>
    <div class="mnubiz-character-zone" data-ekodi-character-host aria-hidden="true"></div>
  </section>

  <section class="mnubiz-section" id="about">
    <div class="mnubiz-shell">
      <div class="mnubiz-section__head"><div><p class="mnubiz-section__eyebrow">ABOUT</p><h2>경영동문회</h2></div><p class="mnubiz-section__desc">단순한 소개 홈페이지를 넘어 동문 소식, 관계, 진로와 사업 경험을 축적하고 연결합니다.</p></div>
      <div class="mnubiz-grid">
        <article class="mnubiz-card"><span class="mnubiz-card__index">01 · CONNECT</span><h3>동문 연결</h3><p>졸업생과 재학생, 선후배가 필요한 관계를 찾고 서로의 경험을 나눌 수 있도록 연결합니다.</p></article>
        <article class="mnubiz-card"><span class="mnubiz-card__index">02 · CAREER</span><h3>진로 · 사업 네트워크</h3><p>취업, 창업, 경영, 협업 등 동문이 가진 현장 경험을 필요한 사람과 연결하는 기반을 만듭니다.</p></article>
        <article class="mnubiz-card"><span class="mnubiz-card__index">03 · ARCHIVE</span><h3>행사 · 소식 · 기록</h3><p>모임과 행사, 공지, 동문 소식을 축적하되 개인정보와 비공개 회원 정보는 공개 화면과 분리합니다.</p></article>
      </div>
    </div>
  </section>

  <section class="mnubiz-section" id="network">
    <div class="mnubiz-shell">
      <div class="mnubiz-section__head"><div><p class="mnubiz-section__eyebrow">COMMUNITY</p><h2>동문 네트워크</h2></div><p class="mnubiz-section__desc">Community 기능은 전체 플랫폼과 섞이지 않고 <strong>mnubiz</strong> Workspace 범위에서 동문 Circle과 참여 관계를 관리합니다.</p></div>
      <div class="mnubiz-network">
        <div class="mnubiz-network__primary"><p class="mnubiz-section__eyebrow">MEMBER COMMUNITY</p><h3>관계가 필요한 순간에 연결되는 동문회</h3><p>동문 Circle, 참여, 모임, 추천과 관계 기능을 한 흐름으로 연결합니다. 공개 소개와 회원 전용 활동은 권한에 따라 분리됩니다.</p><a class="mnubiz-button" href="/mnubiz/community">Community 열기</a></div>
        <aside class="mnubiz-network__aside"><h3>운영 원칙</h3><p>공개 페이지는 로그인 없이 확인할 수 있고, 회원 활동과 운영 기능은 인증과 역할 확인 후 제공됩니다. 개인정보는 공개 페이지에 노출하지 않습니다.</p></aside>
      </div>
    </div>
  </section>

  <section class="mnubiz-section" id="news">
    <div class="mnubiz-shell">
      <div class="mnubiz-section__head"><div><p class="mnubiz-section__eyebrow">NEWS & EVENTS</p><h2>소식 · 행사</h2></div><p class="mnubiz-section__desc">동문회에서 확인한 공지와 일정만 공개하며, 추후 행사 신청과 참여 기록도 같은 운영공간에서 연결합니다.</p></div>
      <div class="mnubiz-empty"><span class="mnubiz-empty__date">READY</span><div><strong>공개된 동문회 공지·행사를 준비하고 있습니다.</strong><p>운영자가 확인한 내용부터 순서대로 표시됩니다.</p></div></div>
    </div>
  </section>
  <div class="mnubiz-shell mnubiz-service-note">국립목포대학교 경영동문회 · 회원 정보와 공개 정보는 분리하여 관리합니다.</div>
</main>
</body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-workspace':'mnubiz','x-ekodi-community-scope':'workspace','x-ekodi-site-subject':'mnubiz'}});
}
