(() => {
  const palettes = [
    ['#f3c69d66','#a9d6b966','#c6b6e552','18%','18%','82%','30%','55%','82%'],
    ['#f1d6aa5c','#b6dcbf5c','#b9cae65c','24%','24%','76%','22%','68%','78%'],
    ['#e8c4ad5c','#b7d8c85c','#d5c3e052','20%','30%','84%','18%','48%','84%'],
    ['#f5d1a95c','#a9d0c65c','#c5c8e252','14%','22%','78%','38%','62%','86%'],
    ['#efd2b35c','#a6d4c05c','#b8cee65c','30%','18%','78%','33%','52%','86%'],
    ['#f1c9b15c','#b9d8ad5c','#d2bfe052','12%','31%','88%','19%','62%','78%'],
  ];
  const dailyStories = [
    { keyword:'CONNECT', title:'오늘, 어디로 연결될까요?', sub:'필요한 일을 말하면 EKODI가 다음 길을 골라 보여드립니다.' },
    { keyword:'SHARE', title:'나눌수록 길은 넓어집니다', sub:'사람과 공동체, 지식과 일이 서로의 다음 장면을 엽니다.' },
    { keyword:'CREATE', title:'오늘의 생각을 다음 일로', sub:'창작과 연구, 비즈니스와 실행을 필요한 만큼 연결합니다.' },
    { keyword:'GROW', title:'작은 시작이 다음 행동을 만납니다', sub:'서비스 목록 대신 지금 필요한 일에서 시작합니다.' },
    { keyword:'LEARN', title:'배우고 연결하고 다시 움직입니다', sub:'지식이 머무르지 않고 사람과 현장으로 흐르도록 연결합니다.' },
    { keyword:'BUILD', title:'서로 잘 서도록 연결합니다', sub:'각 서비스는 독립적으로 서고 필요한 순간에만 이어집니다.' },
    { keyword:'TODAY', title:'오늘의 EKODI를 엽니다', sub:'해야 할 일을 중심으로 가장 가까운 다음 길만 보여드립니다.' },
  ];
  const intentSets = [
    { id:'community', label:'공동체 · 사역', query:'교회 예배 말씀 묵상 공동체 모임 기도 사역', preferred:['church','bible','community'] },
    { id:'work', label:'일 · 사업', query:'사업 경영 마케팅 홍보 일 프로젝트 채용', preferred:['marketing','management','work','business','biz'] },
    { id:'create', label:'콘텐츠 · 지식', query:'콘텐츠 글 출판 책 연구 소셜 창작', preferred:['author','publishing','lab','social','books'] },
  ];
  function installMessageUI() {
    if (window.EKODIMessage || document.querySelector('script[data-ekodi-message-runtime]')) return;
    const script = document.createElement('script');
    script.src = '/ekodi-message-ui.js';
    script.defer = true;
    script.dataset.ekodiMessageRuntime = 'v1';
    script.addEventListener('error', () => console.warn('[EKODI] shared message UI runtime failed to load.'), { once:true });
    document.head.appendChild(script);
  }
  function installPresentationStyle() {
    if (document.querySelector('#ekodi-homepage-presentation-style')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-homepage-presentation-style';
    style.textContent = '.service-group[hidden],.service-card[hidden]{display:none!important}.service-card.is-daily-feature{outline:1px solid rgba(93,143,116,.2)}';
    document.head.appendChild(style);
  }
  function seoulDateKey(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' });
    const values = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function dailySeed(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }
  function setHeroStory(story, dateLabel) {
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = `${story.keyword} · ${dateLabel}`;
    const title = document.getElementById('hero-title');
    if (!title) return;
    title.textContent = story.title;
    const sub = document.createElement('span');
    sub.textContent = story.sub;
    title.append(sub);
  }
  function simplifyPublicChrome() {
    const nav = document.querySelector('.site-header .nav');
    if (nav) {
      const login = nav.querySelector('.login');
      nav.replaceChildren();
      const about = document.createElement('a');
      about.href = '#about'; about.innerHTML = '소개 <span>About</span>';
      const start = document.createElement('a');
      start.href = '#start'; start.innerHTML = '시작 <span>Start</span>';
      nav.append(about, start);
      if (login) nav.append(login);
    }
    const actions = document.querySelector('.hero-actions');
    if (actions) actions.innerHTML = '<a href="#start">에코디 시작하기 <span>Start</span></a><a href="https://auth.ekodi.kr/?site=my&amp;return_to=https%3A%2F%2Fmy.ekodi.kr%2F">로그인 <span>Sign in</span></a>';
  }
  function serviceData(card) {
    return {
      id: card.dataset.serviceId || '',
      status: card.dataset.serviceStatus || '',
      name: card.querySelector('.service-title strong')?.textContent?.trim() || 'EKODI',
      copy: card.querySelector('.service-description > span')?.textContent?.trim() || '필요한 EKODI 기능으로 이동합니다.',
      url: card.getAttribute('href') || '#start',
    };
  }
  function matchServices(cards, query = '', preferred = [], limit = 3) {
    const words = String(query || '').toLowerCase().split(/[\s,./·]+/).map(v => v.trim()).filter(v => v.length > 1);
    const preferredRank = new Map(preferred.map((id, index) => [id, Math.max(2, 18 - index * 3)]));
    return cards.map(card => {
      const item = serviceData(card);
      const haystack = `${item.id} ${item.name} ${item.copy}`.toLowerCase();
      let score = item.status === 'live' ? 2 : 0;
      score += preferredRank.get(item.id) || 0;
      for (const word of words) if (haystack.includes(word)) score += 5;
      return { card, item, score };
    }).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko')).slice(0, limit);
  }
  function renderRecommendations(host, cards, query = '', preferred = [], label = '지금 추천') {
    const matches = matchServices(cards, query, preferred, 3);
    host.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'intent-results-label';
    heading.textContent = label;
    host.append(heading);
    for (const { item } of matches) {
      const link = document.createElement('a');
      link.className = 'intent-result';
      link.href = item.url;
      link.innerHTML = `<span><strong></strong><small></small></span><b aria-hidden="true">→</b>`;
      link.querySelector('strong').textContent = item.name;
      link.querySelector('small').textContent = item.copy;
      host.append(link);
    }
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'intent-empty';
      empty.textContent = '현재 연결 가능한 서비스가 없습니다.';
      host.append(empty);
    }
  }
  function buildCatalog(cards) {
    const details = document.createElement('details');
    details.className = 'intent-catalog';
    const summary = document.createElement('summary');
    summary.textContent = '모든 서비스 보기';
    const list = document.createElement('div');
    list.className = 'intent-catalog-list';
    for (const card of cards) {
      const item = serviceData(card);
      const link = document.createElement('a');
      link.href = item.url;
      link.textContent = item.name;
      list.append(link);
    }
    details.append(summary, list);
    return details;
  }
  function buildDailyPanel(focus, liveCount, story, dateLabel, cards) {
    const host = document.querySelector('.ecosystem-pulse');
    if (!host) return;
    host.id = 'start';
    host.classList.add('living-daily', 'intent-gateway');
    host.setAttribute('aria-label', 'EKODI 다음 행동 안내');
    host.replaceChildren();
    const panel = document.createElement('article');
    panel.className = 'daily-connect intent-panel';
    const top = document.createElement('div');
    top.className = 'daily-connect-top';
    top.innerHTML = '<span class="daily-connect-kicker">EKODI NEXT</span><span class="daily-live-count"><i aria-hidden="true"></i><b></b><span> ready</span></span>';
    top.querySelector('b').textContent = String(liveCount);
    const date = document.createElement('p');
    date.className = 'daily-date';
    date.textContent = `${dateLabel} · ${story.keyword}`;
    const title = document.createElement('h2');
    title.className = 'intent-title';
    title.textContent = '오늘 무엇을 하시나요?';
    const desc = document.createElement('p');
    desc.className = 'intent-desc';
    desc.textContent = '원하는 일을 적으면 필요한 곳만 골라 보여드립니다.';
    const chips = document.createElement('div');
    chips.className = 'intent-chips';
    const results = document.createElement('div');
    results.className = 'intent-results';
    results.setAttribute('aria-live', 'polite');
    for (const intent of intentSets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'intent-chip';
      button.textContent = intent.label;
      button.addEventListener('click', () => renderRecommendations(results, cards, intent.query, intent.preferred, `${intent.label} 추천`));
      chips.append(button);
    }
    const form = document.createElement('form');
    form.className = 'intent-form';
    form.setAttribute('role', 'search');
    const input = document.createElement('input');
    input.type = 'search';
    input.name = 'intent';
    input.autocomplete = 'off';
    input.placeholder = '예: 교회 주보 만들기, 매장 홍보하기';
    input.setAttribute('aria-label', '하고 싶은 일 입력');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '찾기';
    form.append(input, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) { input.focus(); return; }
      renderRecommendations(results, cards, query, [], `“${query.slice(0, 24)}” 추천`);
    });
    const defaultPreferred = focus ? [focus.dataset.serviceId || ''] : [];
    renderRecommendations(results, cards, '', defaultPreferred, '오늘의 추천');
    panel.append(top, date, title, desc, chips, form, results, buildCatalog(cards));
    host.append(panel);
  }
  function staticPresentation(card) {
    return {
      visibility: card.dataset.homepageDefault || (card.hasAttribute('hidden') ? 'hidden' : 'normal'),
      order: Math.max(0, Math.min(9999, Math.trunc(Number(card.dataset.homepageOrder) || 9999))),
    };
  }
  function updateServiceGroups() {
    document.querySelectorAll('.service-group').forEach(group => {
      const cards = [...group.querySelectorAll('.service-card[data-service-id]')];
      const visible = cards.filter(card => !card.hasAttribute('hidden'));
      group.toggleAttribute('hidden', visible.length === 0);
      group.querySelectorAll('[data-service-count]').forEach(node => { node.textContent = String(visible.length); });
    });
  }
  async function applyHomepagePresentation(cards) {
    const settings = new Map();
    try {
      const response = await fetch('https://api.ekodi.kr/api/homepage/presentation', {
        method:'GET', mode:'cors', credentials:'omit', cache:'no-store', headers:{ accept:'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const item of data.services || []) {
        if (!item?.id) continue;
        const visibility = ['hidden','normal','featured'].includes(item.visibility) ? item.visibility : 'hidden';
        const order = Math.max(0, Math.min(9999, Math.trunc(Number(item.order) || 9999)));
        settings.set(String(item.id), { visibility, order });
      }
      document.documentElement.dataset.homepagePresentation = 'live';
    } catch (error) {
      console.warn('[EKODI] homepage presentation API unavailable; using registry defaults.', error);
      document.documentElement.dataset.homepagePresentation = 'default';
    }
    for (const card of cards) {
      const fallback = staticPresentation(card);
      const current = settings.get(card.dataset.serviceId) || fallback;
      card.toggleAttribute('hidden', current.visibility === 'hidden');
      card.classList.toggle('is-admin-featured', current.visibility === 'featured');
      card.dataset.homepageVisibility = current.visibility;
      card.dataset.homepageOrder = String(current.order);
    }
    document.querySelectorAll('.service-list').forEach(list => {
      const serviceCards = [...list.querySelectorAll('.service-card[data-service-id]')];
      serviceCards.sort((a, b) => Number(a.dataset.homepageOrder || 9999) - Number(b.dataset.homepageOrder || 9999)
        || String(a.dataset.serviceId || '').localeCompare(String(b.dataset.serviceId || '')));
      serviceCards.forEach(card => list.append(card));
    });
    updateServiceGroups();
  }
  function installSecondaryLinks() {
    const note = document.querySelector('.footer-note');
    if (!note || note.querySelector('[data-ekodi-secondary-links]')) return;
    const links = document.createElement('span');
    links.dataset.ekodiSecondaryLinks = 'v1';
    links.className = 'secondary-links';
    const history = document.createElement('a');
    history.href = '/history';
    history.dataset.ekodiHistoryLink = 'v1';
    history.innerHTML = '역사 <span>History</span>';
    const privacy = document.createElement('a'); privacy.href = '/privacy'; privacy.textContent = '개인정보처리방침';
    const terms = document.createElement('a'); terms.href = '/terms'; terms.textContent = '이용약관';
    links.append(history, privacy, terms);
    note.append(links);
  }
  async function start() {
    installMessageUI();
    installPresentationStyle();
    simplifyPublicChrome();
    installSecondaryLinks();
    const root = document.documentElement;
    const dateKey = seoulDateKey();
    const seed = dailySeed(dateKey);
    const palette = palettes[seed % palettes.length];
    const story = dailyStories[(seed >>> 4) % dailyStories.length];
    const keys = ['--ambient-a','--ambient-b','--ambient-c','--ambient-x1','--ambient-y1','--ambient-x2','--ambient-y2','--ambient-x3','--ambient-y3'];
    keys.forEach((key, index) => root.style.setProperty(key, palette[index]));
    root.dataset.ambientTheme = String((seed % palettes.length) + 1);
    root.dataset.dailyDate = dateKey;
    root.dataset.dailyKeyword = story.keyword;
    document.body.dataset.livingGateway = 'v3-intent-first';
    const allCards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(allCards);
    const cards = allCards.filter(card => !card.hasAttribute('hidden'));
    const liveCards = cards.filter(card => card.dataset.serviceStatus === 'live');
    for (const status of ['live','beta']) {
      const count = cards.filter(card => card.dataset.serviceStatus === status).length;
      document.querySelectorAll(`[data-status-count="${status}"]`).forEach(node => { node.textContent = String(count); });
    }
    const dateLabel = new Intl.DateTimeFormat('ko-KR', {
      timeZone:'Asia/Seoul', month:'long', day:'numeric', weekday:'short',
    }).format(new Date());
    setHeroStory(story, dateLabel);
    let focus = liveCards[0] || cards[0] || null;
    if (liveCards.length) {
      const preferred = liveCards.filter(card => card.classList.contains('is-admin-featured'));
      const pool = preferred.length ? preferred : liveCards;
      focus = pool[(seed >>> 9) % pool.length];
      focus.classList.add('is-daily-feature');
      focus.setAttribute('aria-current', 'true');
    }
    buildDailyPanel(focus, liveCards.length, story, dateLabel, cards);
  }
  start().catch(error => console.warn('[EKODI] intent-first gateway failed to initialize.', error));
})();
