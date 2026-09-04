(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const LOCALES = [
    { code:'ko-KR', short:'KO', lang:'ko' },
    { code:'en', short:'EN', lang:'en' },
    { code:'zh-CN', short:'中', lang:'zh-CN' },
    { code:'ja', short:'JA', lang:'ja' },
  ];
  const COPY = {
    'ko-KR': {
      'nav.discover':'Discover','nav.circles':'Circles','nav.people':'People','nav.channels':'Channels',
      'hero.title':'관심이 사람을 만나고,<br><span>함께할 일이 태어납니다.</span>',
      'hero.lead':'유튜브와 소식만 보는 홈페이지를 넘어, 관심사·배움·도움·지역을 따라 서로 발견하고 작은 모임을 시작하는 소통플랫폼입니다.',
      'hero.start':'내 관심으로 시작하기','hero.browse':'모임 둘러보기 →',
      'circles.title':'관심에서 시작되는 작은 공동체','circles.intro':'로그인 전에도 다양한 Circle을 먼저 둘러볼 수 있습니다. 참여하는 순간 로그인 여부를 확인합니다.',
      'people.title':'비슷해서, 또 서로 달라서 연결되는 사람들','people.intro':'로그인 전에는 관심사 기반 예시를 먼저 둘러볼 수 있습니다. 실제 회원 연결은 로그인 후 공개 범위와 상호 조건을 확인해 진행합니다.','people.empty':'아직 추천할 연결이 없습니다.',
      'channels.title':'흩어진 채널은 열어 두고, 관계는 한곳에 모읍니다','channels.intro':'다양한 채널을 먼저 살펴보고, 선택하는 순간 로그인 여부를 확인해 자연스럽게 이어집니다.',
      login:'Google로 시작', logout:'로그아웃', connect:'연결 보기'
    },
    en: {
      'nav.discover':'Discover','nav.circles':'Circles','nav.people':'People','nav.channels':'Channels',
      'hero.title':'Interests meet people,<br><span>and something shared begins.</span>',
      'hero.lead':'Go beyond a page that only shows videos and news. Discover people by interests, learning, help, and place, then begin small communities together.',
      'hero.start':'Start with my interests','hero.browse':'Browse circles →',
      'circles.title':'Small communities that start with interests','circles.intro':'Browse a wide range of Circles before signing in. We check your login only when you choose to participate.',
      'people.title':'People connected by what they share and how they differ','people.intro':'Before signing in, browse interest-based examples. Real member connections proceed only after login, with visibility and mutual conditions checked.','people.empty':'No connection recommendations yet.',
      'channels.title':'Keep channels open, gather relationships in one place','channels.intro':'Explore different channels first. When you choose one, we check login and continue from there.',
      login:'Start with Google', logout:'Sign out', connect:'View connection'
    },
    'zh-CN': {
      'nav.discover':'发现','nav.circles':'小组','nav.people':'伙伴','nav.channels':'频道',
      'hero.title':'兴趣遇见人，<br><span>共同的事情由此开始。</span>',
      'hero.lead':'不只看视频和消息。按照兴趣、学习、互助与地区彼此发现，并从小小的共同体开始。',
      'hero.start':'从我的兴趣开始','hero.browse':'浏览小组 →',
      'circles.title':'从兴趣开始的小共同体','circles.intro':'登录前也可以先浏览多样的小组。只有在参与时才确认登录状态。',
      'people.title':'因相似，也因不同而连接的人','people.intro':'登录前可先查看基于兴趣的示例。真实会员连接会在登录后确认公开范围和双方条件再进行。','people.empty':'暂时没有推荐的连接。',
      'channels.title':'频道保持开放，关系汇聚一处','channels.intro':'先浏览不同频道，选择时再确认登录并自然继续。',
      login:'使用 Google 开始', logout:'退出登录', connect:'查看连接'
    },
    ja: {
      'nav.discover':'見つける','nav.circles':'サークル','nav.people':'人','nav.channels':'チャンネル',
      'hero.title':'関心が人と出会い、<br><span>一緒にすることが生まれます。</span>',
      'hero.lead':'動画やお知らせを見るだけのページを越えて、関心・学び・助け・地域から人を見つけ、小さなコミュニティを始めます。',
      'hero.start':'関心から始める','hero.browse':'サークルを見る →',
      'circles.title':'関心から始まる小さなコミュニティ','circles.intro':'ログイン前でも多様なサークルを先に見られます。参加するときにログイン状態を確認します。',
      'people.title':'似ているから、違うから、つながる人たち','people.intro':'ログイン前は関心ベースの例を閲覧できます。実際の会員同士の接続はログイン後、公開範囲と相互条件を確認して進めます。','people.empty':'まだおすすめのつながりはありません。',
      'channels.title':'チャンネルは開いたまま、関係は一か所へ','channels.intro':'さまざまなチャンネルを先に見て、選んだときにログインを確認して続けます。',
      login:'Googleで始める', logout:'ログアウト', connect:'つながりを見る'
    },
  };

  const EXTRA_CIRCLES = [
    ['청년 커리어 테이블','취업과 이직, 작은 창업까지 각자의 다음 걸음을 서로 점검하고 돕는 모임입니다.','Life','청년 · 창업 · 경영','온·오프라인 · 월 2회','14명'],
    ['동네 책 한 권','한 권의 책을 천천히 읽고 지역의 삶과 연결해 이야기하는 독서 모임입니다.','Culture','독서 · 지역활동 · 문화','오프라인 · 월 1회','9명'],
    ['영상 한 편 같이 만들기','기획부터 촬영과 편집까지 작은 프로젝트 하나를 끝까지 함께 완성합니다.','Learning','영상 · 영상편집 · 디자인','온·오프라인 · 프로젝트형','7명'],
    ['부모와 아이 동네친구','육아 정보를 나누고 아이들과 함께할 지역 활동을 가볍게 연결합니다.','Life','육아 · 지역활동 · 봉사','오프라인 · 월 2회','12명'],
    ['한국어 친구 / Language Buddy','한국어를 배우는 사람과 다른 언어를 배우고 싶은 사람이 서로 짝이 되어 돕습니다.','Diaspora','한국어 · 영어 · 외국인교류','온·오프라인 · 주 1회','18명'],
    ['우리동네 변화 실험실','도시재생, 상권, 골목과 생활 문제를 작은 실행으로 바꾸어 보는 지역 프로젝트입니다.','Local','도시재생 · 지역활동 · 소상공인','오프라인 · 월 1회','10명'],
  ];
  const DEMO_PEOPLE = [
    ['지역활동 메이트','목포 · 무안','동네 행사와 작은 프로젝트를 함께 기획하고 실행하는 연결을 찾고 있어요.','지역활동 · 도시재생'],
    ['Language Buddy','온라인 · 전남','한국어와 영어를 편하게 바꾸어 쓰며 서로의 일상을 나누고 싶어요.','한국어 · 영어 · 외국인교류'],
    ['AI 가게친구','목포','작은 가게에서 AI를 실제로 써 보고 잘 된 것과 실패한 것을 같이 나눕니다.','AI · 소상공인 · 마케팅'],
    ['책과 산책 친구','전남 서남권','책 한 권, 산책 한 번 정도의 가벼운 만남부터 시작하고 싶어요.','독서 · 여행'],
    ['콘텐츠 동료','온라인','촬영과 편집을 배우면서 실제 짧은 콘텐츠를 함께 만들어 보고 싶어요.','영상 · 음악 · 디자인'],
    ['청년 커리어 메이트','목포','일과 진로 이야기를 너무 무겁지 않게 나누는 동료 연결을 원합니다.','청년 · 창업 · 경영'],
    ['말씀 나눔 친구','무안','짧은 말씀을 읽고 서로의 삶을 존중하며 나누는 작은 연결을 찾습니다.','성경공부 · 기도'],
    ['동네 부모 메이트','목포 · 무안','아이들과 갈 곳, 함께할 활동, 육아 정보를 편하게 나누고 싶어요.','육아 · 지역활동'],
  ];

  const normalizeLocale = value => /^zh/i.test(value||'') ? 'zh-CN' : /^ja/i.test(value||'') ? 'ja' : /^en/i.test(value||'') ? 'en' : 'ko-KR';
  const locale = () => { try { return normalizeLocale(localStorage.getItem('ekodi.locale') || navigator.language); } catch { return normalizeLocale(navigator.language); } };
  const signedIn = () => $('#profileBtn') && !$('#profileBtn').hidden;
  const authUrl = () => { const u = new URL('https://auth.ekodi.kr/'); u.searchParams.set('site','community'); u.searchParams.set('return_to',location.href.split('#')[0]); return u.href; };

  function requireLogin(next) {
    if (signedIn()) return next();
    try { sessionStorage.setItem('ekodi.community.pending', JSON.stringify({ href: next.href, target: next.target || '_self' })); } catch {}
    location.assign(authUrl());
  }
  function openTarget(href, target='_self') {
    const absolute = new URL(href, location.origin).href;
    const action = () => target === '_blank' ? window.open(absolute, '_blank', 'noopener') : location.assign(absolute);
    action.href = absolute; action.target = target; requireLogin(action);
  }
  function resumePending() {
    if (!signedIn()) return;
    try {
      const raw = sessionStorage.getItem('ekodi.community.pending'); if (!raw) return;
      sessionStorage.removeItem('ekodi.community.pending');
      const item = JSON.parse(raw); if (item?.href) setTimeout(() => item.target === '_blank' ? window.open(item.href, '_blank', 'noopener') : location.assign(item.href), 120);
    } catch {}
  }

  function applyLocale(value = locale()) {
    const code = normalizeLocale(value), copy = COPY[code] || COPY['ko-KR'], option = LOCALES.find(x => x.code === code) || LOCALES[0];
    document.documentElement.lang = option.lang;
    const summary = $('#languageSummary b'); if (summary) summary.textContent = option.short;
    $$('[data-locale]').forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.locale === code)));
    $$('[data-i18n]').forEach(el => { if (copy[el.dataset.i18n]) el.textContent = copy[el.dataset.i18n]; });
    if ($('#heroTitle')) $('#heroTitle').innerHTML = copy['hero.title'];
    if ($('#heroLead')) $('#heroLead').textContent = copy['hero.lead'];
    if ($('#loginBtn')) $('#loginBtn').textContent = signedIn() ? copy.logout : copy.login;
    $$('.person-connect').forEach(btn => btn.textContent = copy.connect);
  }

  function extraCircleCard(item) {
    const [name, summary, category, tags, meta, members] = item;
    const card = document.createElement('article'); card.className = 'circle-card'; card.dataset.publicDemo = 'extra';
    card.innerHTML = `<div class="card-top"><span class="category">${category}</span></div><h3></h3><p></p><div class="tag-row"></div><div class="card-meta"><span></span><span></span></div><div class="card-actions"><button type="button">공유</button><button type="button" class="join">로그인 후 참여</button></div>`;
    $('h3',card).textContent=name; $('p',card).textContent=summary; $('.tag-row',card).textContent=tags; $('.card-meta span:first-child',card).textContent=meta; $('.card-meta span:last-child',card).textContent=members;
    $('.card-actions button:first-child',card).addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${name}\n${location.href}`); } catch {} });
    $('.join',card).addEventListener('click', () => openTarget('/connect/','_self'));
    return card;
  }
  function ensureExtraCircles() {
    if (signedIn()) return;
    const grid = $('#circleGrid'); if (!grid) return;
    const active = $('#circleFilters .filter-chip.active'); if (active && !/추천|Recommended|おすすめ|推荐/.test(active.textContent)) return;
    if ($('[data-public-demo="extra"]', grid)) return;
    EXTRA_CIRCLES.forEach(item => grid.append(extraCircleCard(item)));
  }

  function personCard(item) {
    const [name, region, bio, tags] = item;
    const card=document.createElement('article'); card.className='person-card public-person'; card.dataset.publicPerson='demo';
    card.innerHTML='<div class="person-head"><span class="avatar"></span><div><h3></h3><small></small></div></div><p></p><div class="tag-row"></div><div class="why"></div><button type="button" class="person-connect"></button>';
    $('.avatar',card).textContent=name.charAt(0); $('h3',card).textContent=name; $('small',card).textContent=region; $('p',card).textContent=bio; $('.tag-row',card).textContent=tags; $('.why',card).textContent='관심사가 맞닿아 있는 연결 예시입니다.';
    $('.person-connect',card).addEventListener('click',()=>openTarget('/connect/','_self')); return card;
  }
  function renderPublicPeople() {
    const grid=$('#peopleGrid'); if (!grid || signedIn()) return;
    if ($('[data-public-person="demo"]',grid)) return;
    grid.replaceChildren(...DEMO_PEOPLE.map(personCard)); $('#peopleEmpty').hidden=true; applyLocale();
  }

  function bind() {
    $$('[data-auth-href]').forEach(el => el.addEventListener('click', () => openTarget(el.dataset.authHref, el.dataset.authTarget || '_self')));
    $$('[data-locale]').forEach(btn => btn.addEventListener('click', () => { try { localStorage.setItem('ekodi.locale', btn.dataset.locale); } catch {} applyLocale(btn.dataset.locale); $('#languageMenu').open=false; }));
    document.addEventListener('click', e => { const menu=$('#languageMenu'); if (menu?.open && !menu.contains(e.target)) menu.open=false; });
    const profile=$('#profileBtn'); if (profile) new MutationObserver(() => { if (signedIn()) $$('.public-person').forEach(el=>el.remove()); else renderPublicPeople(); applyLocale(); resumePending(); }).observe(profile,{attributes:true,attributeFilter:['hidden']});
    const circleGrid=$('#circleGrid'); if (circleGrid) new MutationObserver(() => queueMicrotask(ensureExtraCircles)).observe(circleGrid,{childList:true});
    const filters=$('#circleFilters'); if (filters) filters.addEventListener('click',()=>setTimeout(ensureExtraCircles,0));
    applyLocale(); renderPublicPeople(); ensureExtraCircles();
    let tries=0; const pendingTimer=setInterval(()=>{ tries++; if(signedIn()){clearInterval(pendingTimer);resumePending();} else if(tries>40)clearInterval(pendingTimer); },250);
  }
  window.addEventListener('load', bind, { once:true });
})();
