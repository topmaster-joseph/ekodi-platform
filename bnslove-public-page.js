/**
 * 형제사랑회 public workspace home.
 * This is a safe guest projection. The workspace ID remains the authorization key;
 * no membership, officer, finance or meeting data is synthesized here.
 */
const BN_SHEET = "    :root{font-family:Pretendard,\"Noto Sans KR\",system-ui,-apple-system,sans-serif;color:#1b2925;background:#f6f7f3;--ink:#1b2925;--muted:#57655e;--line:#dbe3dc;--accent:#1f6950;--cream:#f6f7f3;--panel:#fff}\n    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:86px}\n    body{margin:0;min-width:0;background:var(--cream);color:var(--ink);line-height:1.6;word-break:keep-all;overflow-wrap:normal}\n    a{color:inherit}a:focus-visible{outline:3px solid #358266;outline-offset:4px;border-radius:4px}\n    .wrap{width:min(1120px,calc(100% - 36px));margin-inline:auto}\n    .top{position:sticky;top:0;z-index:5;background:rgba(246,247,243,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}\n    .top-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:70px}\n    .brand{display:flex;gap:9px;align-items:center;text-decoration:none;font-size:20px;font-weight:850;letter-spacing:-.045em;white-space:nowrap}\n    .skip-link{position:absolute;left:-9999px;top:8px;background:white;padding:10px 14px;z-index:20}.skip-link:focus{left:12px}\n    .symbol{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:11px;background:var(--accent);color:white;font-size:18px}\n    .nav{display:flex;flex-wrap:wrap;gap:clamp(8px,1.4vw,20px);align-items:center}\n    .nav a{text-decoration:none;color:#47564e;font-size:14px;font-weight:650}\n    .nav a:hover,.nav a:focus-visible{color:var(--accent)}\n    .pill{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 17px;border:1px solid #28765b;background:var(--accent);color:#fff!important;text-decoration:none;border-radius:999px;font-weight:750;line-height:1.3;text-align:center}\n    .pill.secondary{background:transparent;color:var(--accent)!important;border-color:#aabfb2}\n    .hero{background:linear-gradient(120deg,#e9f0e9 0%,#f6f7f3 56%,#e5ede6 100%);border-bottom:1px solid var(--line)}\n    .hero-inner{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(220px,.75fr);gap:30px;align-items:center;min-height:540px;padding-block:76px}\n    .eyebrow{display:block;color:#34664f;font-weight:800;letter-spacing:.11em;font-size:12px}\n    h1{margin:18px 0 20px;font-size:clamp(39px,6.4vw,70px);letter-spacing:-.065em;line-height:1.12;font-weight:850;max-width:720px}\n    .lead{font-size:clamp(16px,2vw,20px);color:#4c5d52;max-width:620px;margin:0;line-height:1.8}\n    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}\n    .hero-art{min-height:310px;border:1px solid #d3e1d7;border-radius:28px;display:grid;place-items:center;position:relative;background:linear-gradient(150deg,#dce9dd,#f4f8ed);overflow:hidden}\n    .hero-art::before,.hero-art::after{content:\"\";position:absolute;border-radius:50%;border:22px solid rgba(36,116,81,.12)}\n    .hero-art::before{width:260px;height:260px;right:-60px;top:-80px}\n    .hero-art::after{width:180px;height:180px;left:-70px;bottom:-50px}\n    .art-content{z-index:1;text-align:center;color:#315e48;padding:28px}\n    .art-content strong{display:block;font-size:clamp(50px,7vw,100px);font-weight:400;line-height:1}\n    .art-content span{display:block;margin-top:16px;font-size:15px;font-weight:700;letter-spacing:.04em}\n    .section{padding-block:74px;border-bottom:1px solid var(--line)}\n    .section-head{max-width:750px;margin-bottom:28px}\n    .section h2{font-size:clamp(26px,3vw,35px);letter-spacing:-.045em;line-height:1.35;margin:9px 0 12px}\n    .section p{margin:0;color:var(--muted)}\n    .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}\n    .card{padding:25px;background:var(--panel);border:1px solid var(--line);border-radius:18px;min-width:0}\n    .card .number{color:var(--accent);font-size:13px;font-weight:850}\n    .card h3{font-size:20px;letter-spacing:-.035em;margin:18px 0 8px}\n    .card p{font-size:14px}\n    .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}\n    .notice{display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;min-height:160px}\n    .notice h3{font-size:20px;margin:0;letter-spacing:-.035em}\n    .notice p{font-size:14px}\n    .notice small{color:#41745b;font-weight:750}\n    .cta{background:#225840;color:#fff;border-radius:22px;padding:clamp(26px,4vw,48px);display:flex;justify-content:space-between;gap:24px;align-items:center}\n    .cta h2{margin:8px 0;font-size:clamp(24px,3vw,34px)}\n    .cta p{color:#dfebe1}\n    .cta .pill{background:#fff;color:#225840!important;border-color:#fff}\n    .cta .eyebrow{color:#d4e9da}\n    footer{padding:28px 0 40px;color:#67736c;font-size:13px}\n    .foot-inner{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}\n    footer a{color:#3b5f4b;text-decoration:none}\n    @media(max-width:850px){.hero-inner{grid-template-columns:1fr;min-height:0}.hero-art{min-height:230px}.nav{gap:12px}}\n    @media(max-width:640px){.wrap{width:min(100% - 28px,1120px)}.top-inner{min-height:64px;align-items:flex-start;padding-block:12px;flex-direction:column;gap:9px}.nav{width:100%;flex-wrap:nowrap;overflow-x:auto;padding-bottom:5px;scrollbar-width:thin}.nav a{white-space:nowrap;font-size:13px}.hero-inner{padding-block:46px;gap:24px}.hero-art{min-height:185px}.section{padding-block:48px}.cards,.two{grid-template-columns:1fr}.cta{flex-direction:column;align-items:flex-start}.actions{gap:8px}.pill{font-size:14px}}\n    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}";

export function bnslovePublicCss() {
  return new Response(BN_SHEET, {headers: {'content-type':'text/css; charset=utf-8', 'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

export function renderBnslovePublicPage() {
  const html = `<!doctype html>
<html lang="ko" data-ekodi-ui-surface="user-public" data-ekodi-workspace="bnslove">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>형제사랑회 | 함께 이어가는 만남과 나눔</title>
  <meta name="description" content="형제사랑회 공식 운영공간. 단체 소개와 공개 활동 소식, 모임 안내를 확인할 수 있습니다.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://ekodi.kr/bnslove/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="형제사랑회">
  <meta property="og:description" content="형제사랑회 공식 운영공간">
  <meta property="og:url" content="https://ekodi.kr/bnslove/">
  <link rel="stylesheet" href="/bnslove/site.css">
</head>
<body>
  <a class="skip-link" href="#main">본문으로 이동</a>
  <header class="top"><div class="wrap top-inner">
    <a class="brand" href="/bnslove/"><span class="symbol" aria-hidden="true">♥</span>형제사랑회</a>
    <nav class="nav" aria-label="형제사랑회 주요 메뉴">
      <a href="#about">소개</a><a href="#activities">활동</a><a href="#meetings">모임</a><a href="#notices">공지</a><a href="#participate">참여</a>
    </nav>
  </div></header>
  <main id="main">
    <section class="hero"><div class="wrap hero-inner">
      <div><span class="eyebrow">BROTHERLY LOVE · COMMUNITY</span>
      <h1>사람을 잇고,<br>사랑을 나누는<br>형제사랑회</h1>
      <p class="lead">형제사랑회의 소개와 공개 소식을 전하는 공간입니다. 서로를 알아가고 함께하는 만남이 이어질 수 있도록 이곳을 가꾸어 갑니다.</p>
      <div class="actions"><a class="pill" href="#about">형제사랑회 알아보기</a><a class="pill secondary" href="#notices">공개 소식 보기</a></div></div>
      <div class="hero-art" aria-hidden="true"><div class="art-content"><strong>♡</strong><span>연결 · 교제 · 나눔</span></div></div>
    </div></section>
    <section class="section" id="about"><div class="wrap">
      <div class="section-head"><span class="eyebrow">ABOUT</span><h2>형제사랑회를 소개합니다</h2><p>단체의 공식 소개, 활동 목적과 조직 정보는 운영자가 확인해 순차적으로 게시합니다. 확인되지 않은 설립 이력이나 임원 명단은 표시하지 않습니다.</p></div>
      <div class="cards">
        <article class="card"><span class="number">01 / CONNECTION</span><h3>만남</h3><p>공개된 모임과 소식을 한곳에서 쉽게 확인할 수 있도록 준비합니다.</p></article>
        <article class="card"><span class="number">02 / FELLOWSHIP</span><h3>교제</h3><p>회원과 참여자를 위한 기능은 권한 확인 후 별도로 제공합니다.</p></article>
        <article class="card"><span class="number">03 / SHARING</span><h3>나눔</h3><p>확인된 활동 기록을 정리하고 필요한 소식을 함께 전합니다.</p></article>
      </div>
    </div></section>
    <section class="section" id="activities"><div class="wrap">
      <div class="section-head"><span class="eyebrow">ACTIVITIES</span><h2>활동과 소식</h2><p>공개 승인을 받은 활동 기록과 사진, 영상은 이 영역에 게시할 예정입니다.</p></div>
      <div class="notice"><small>공개 자료 안내</small><h3>등록된 공개 활동 자료가 없습니다.</h3><p>검증된 사진과 활동 설명을 준비하여 게시하겠습니다.</p></div>
    </div></section>
    <section class="section" id="meetings"><div class="wrap">
      <div class="section-head"><span class="eyebrow">GATHERINGS</span><h2>모임 안내</h2><p>실제 날짜와 장소가 확인된 모임만 게시하며, 개인정보가 포함된 출석 명단은 공개하지 않습니다.</p></div>
      <div class="notice"><small>일정 안내</small><h3>공개된 모임 일정이 없습니다.</h3><p>일정이 확정되고 공개 승인되면 이곳에서 안내합니다.</p></div>
    </div></section>
    <section class="section" id="notices"><div class="wrap">
      <div class="section-head"><span class="eyebrow">NOTICE</span><h2>공지사항</h2><p>확인된 공지사항만 공개합니다. 회원별 권한 정보와 비공개 회계 자료는 이 페이지에 표시하지 않습니다.</p></div>
      <div class="two">
        <article class="notice"><small>형제사랑회</small><h3>현재 공개된 공지사항이 없습니다.</h3><p>관리자가 게시를 승인한 뒤 최신 소식을 보여드립니다.</p></article>
        <article class="notice"><small>회원 안내</small><h3>회원 운영은 별도로 관리합니다.</h3><p>회원정보 및 운영 업무는 해당 권한이 확인된 이용자에게만 제공됩니다.</p></article>
      </div>
    </div></section>
    <section class="section" id="participate"><div class="wrap">
      <div class="cta"><div><span class="eyebrow">PARTICIPATE</span><h2>형제사랑회와 함께하기</h2><p>로그인하면 허용된 회원 기능을 이용할 수 있습니다. 로그인만으로 회원 가입이나 모임 신청이 완료되지는 않습니다.</p></div>
      <a class="pill" href="/auth/?site=space&amp;return_to=https%3A%2F%2Fekodi.kr%2Fbnslove%2F">로그인</a></div>
    </div></section>
  </main>
  <footer><div class="wrap foot-inner"><span>© 형제사랑회 · Powered by EKODI</span><a href="/bnslove/admin">운영자 관리</a></div></footer>
</body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-content-type-options': 'nosniff',
      'x-ekodi-route': 'bnslove-public',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
