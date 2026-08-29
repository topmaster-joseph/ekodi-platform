(() => {
  const palettes = [
    ['#f3c69d66','#a9d6b966','#c6b6e552','18%','18%','82%','30%','55%','82%'],
    ['#f1d6aa5c','#b6dcbf5c','#b9cae65c','24%','24%','76%','22%','68%','78%'],
    ['#e8c4ad5c','#b7d8c85c','#d5c3e052','20%','30%','84%','18%','48%','84%'],
  ];

  const intentSets = [
    { id:'community', label:'공동체', query:'공동체 모임 교회 사람 연결', preferred:['community','church'] },
    { id:'ministry', label:'사역', query:'교회 예배 말씀 성경 묵상 기도 사역', preferred:['church','bible','community'] },
    { id:'business', label:'비즈니스', query:'사업 경영 매장 마케팅 홍보 판매 일', preferred:['marketing','management','work','business','biz'] },
    { id:'content', label:'콘텐츠', query:'콘텐츠 글 출판 책 연구 소셜 창작', preferred:['author','publishing','books','social','lab'] },
  ];

  const quickPaths = [
    { label:'교회와 모임', copy:'공동체와 사역에 필요한 길', query:'교회 공동체 모임 사역 예배', preferred:['church','community','bible'] },
    { label:'매장과 마케팅', copy:'사업과 홍보에 필요한 길', query:'매장 사업 마케팅 홍보 판매', preferred:['marketing','business','biz','management','work'] },
    { label:'콘텐츠와 글쓰기', copy:'글·출판·콘텐츠에 필요한 길', query:'콘텐츠 글쓰기 출판 책 창작', preferred:['author','publishing','books','social','lab'] },
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
    style.textContent = '.service-group[hidden],.service-card[hidden]{display:none!important}';
    document.head.appendChild(style);
  }

  function seoulDateKey(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' });
    const values = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function dailySeed(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function setHookFirstHero() {
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = 'EKODI NEXT';

    const title = document.getElementById('hero-title');
    if (title) {
      title.textContent = '원하는 일, 바로 시작하세요';
      const sub = document.createElement('span');
      sub.textContent = '공동체, 사역, 비즈니스, 삶. 필요한 길만 가볍게 연결합니다.';
      title.append(sub);
    }

    const nav = document.querySelector('.site-header .nav');
    const login = nav?.querySelector('.login');
    if (nav) {
      nav.replaceChildren();
      const about = document.createElement('a');
      about.href = '#about';
      about.textContent = '소개';
      nav.append(about);
      if (login) {
        login.innerHTML = '로그인';
        login.setAttribute('aria-label', '로그인');
        nav.append(login);
      }
    }

    const actions = document.querySelector('.hero-actions');
    if (actions) {
      actions.replaceChildren();
      const start = document.createElement('a');
      start.href = '#start';
      start.className = 'hero-primary-action';
      start.textContent = '무료로 시작';
      actions.append(start);
      if (login) {
        const signIn = document.createElement('a');
        signIn.href = login.href;
        signIn.className = 'hero-secondary-action';
        signIn.textContent = '로그인';
        actions.append(signIn);
      }
      const note = document.createElement('p');
      note.className = 'hero-note';
      note.textContent = '복잡한 메뉴 대신, 지금 필요한 한 가지에서 시작하세요.';
      actions.after(note);
    }
  }

  function serviceData(card) {
    return {
      id: card.dataset.serviceId || '',
      status: card.dataset.serviceStatus || '',
      name: card.querySelector('.service-title strong')?.textContent?.trim() || '서비스',
      copy: card.querySelector('.service-description > span')?.textContent?.trim() || '필요한 기능으로 이동합니다.',
      url: card.getAttribute('href') || '#services',
    };
  }

  function rankServices(cards, query = '', preferred = [], limit = 3) {
    const words = String(query || '').toLowerCase().split(/[\s,./·]+/).map(value => value.trim()).filter(value => value.length > 1);
    const preferredRank = new Map(preferred.map((id, index) => [id, Math.max(3, 24 - index * 4)]));
    return cards.map(card => {
      const item = serviceData(card);
      const haystack = `${item.id} ${item.name} ${item.copy}`.toLowerCase();
      let score = item.status === 'live' ? 3 : 0;
      score += preferredRank.get(item.id) || 0;
      for (const word of words) if (haystack.includes(word)) score += 6;
      return { item, score };
    }).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko')).slice(0, limit);
  }

  function bestService(cards, path) {
    return rankServices(cards, path.query, path.preferred, 1)[0]?.item || null;
  }

  function renderRecommendations(host, cards, query = '', preferred = [], label = '추천') {
    const matches = rankServices(cards, query, preferred, 3);
    host.replaceChildren();
    const heading = document.createElement('p');
    heading.className = 'intent-results-label';
    heading.textContent = label;
    host.append(heading);

    for (const { item } of matches) {
      const link = document.createElement('a');
      link.className = 'intent-result';
      link.href = item.url;
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const small = document.createElement('small');
      small.textContent = item.copy;
      const arrow = document.createElement('b');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      text.append(strong, small);
      link.append(text, arrow);
      host.append(link);
    }

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'intent-empty';
      empty.textContent = '현재 연결 가능한 서비스를 찾지 못했습니다.';
      host.append(empty);
    }
  }

  function buildQuickLinks(cards) {
    const list = document.createElement('div');
    list.className = 'quick-paths';
    list.setAttribute('aria-label', '빠른 시작');

    for (const path of quickPaths) {
      const item = bestService(cards, path);
      const link = document.createElement('a');
      link.className = 'quick-path';
      link.href = item?.url || '#services';
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = path.label;
      const small = document.createElement('small');
      small.textContent = path.copy;
      const arrow = document.createElement('b');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      text.append(strong, small);
      link.append(text, arrow);
      list.append(link);
    }
    return list;
  }

  function buildDailyPanel(cards) {
    const host = document.querySelector('.ecosystem-pulse');
    if (!host) return;
    host.id = 'start';
    host.className = 'ecosystem-pulse living-daily intent-gateway';
    host.setAttribute('aria-label', '오늘 필요한 일을 찾는 빠른 시작');
    host.replaceChildren();

    const panel = document.createElement('article');
    panel.className = 'daily-connect intent-panel';

    const kicker = document.createElement('p');
    kicker.className = 'daily-connect-kicker';
    kicker.textContent = 'QUICK START';

    const title = document.createElement('h2');
    title.className = 'intent-title';
    title.textContent = '오늘 무엇을 하시나요?';

    const desc = document.createElement('p');
    desc.className = 'intent-desc';
    desc.textContent = '하고 싶은 일을 고르거나 적어보세요. 필요한 길만 보여드립니다.';

    const chips = document.createElement('div');
    chips.className = 'intent-chips';

    const results = document.createElement('div');
    results.className = 'intent-results';
    results.setAttribute('aria-live', 'polite');
    results.hidden = true;

    for (const intent of intentSets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'intent-chip';
      button.textContent = intent.label;
      button.addEventListener('click', () => {
        results.hidden = false;
        renderRecommendations(results, cards, intent.query, intent.preferred, `${intent.label} 추천`);
      });
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
      if (!query) {
        input.focus();
        return;
      }
      results.hidden = false;
      renderRecommendations(results, cards, query, [], `“${query.slice(0, 24)}” 추천`);
    });

    panel.append(kicker, title, desc, chips, form, buildQuickLinks(cards), results);
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
    links.dataset.ekodiSecondaryLinks = 'v2';
    links.className = 'secondary-links';
    const about = document.createElement('a');
    about.href = '#about';
    about.textContent = '소개';
    const terms = document.createElement('a');
    terms.href = '/terms';
    terms.textContent = '이용약관';
    const privacy = document.createElement('a');
    privacy.href = '/privacy';
    privacy.textContent = '개인정보처리방침';
    links.append(about, terms, privacy);
    note.append(links);
  }

  async function start() {
    installMessageUI();
    installPresentationStyle();
    setHookFirstHero();
    installSecondaryLinks();

    const root = document.documentElement;
    const dateKey = seoulDateKey();
    const seed = dailySeed(dateKey);
    const palette = palettes[seed % palettes.length];
    const keys = ['--ambient-a','--ambient-b','--ambient-c','--ambient-x1','--ambient-y1','--ambient-x2','--ambient-y2','--ambient-x3','--ambient-y3'];
    keys.forEach((key, index) => root.style.setProperty(key, palette[index]));
    root.dataset.ambientTheme = String((seed % palettes.length) + 1);
    root.dataset.dailyDate = dateKey;
    document.body.dataset.livingGateway = 'v4-hook-first';

    const allCards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(allCards);
    const cards = allCards.filter(card => !card.hasAttribute('hidden'));
    buildDailyPanel(cards);
  }

  start().catch(error => console.warn('[EKODI] hook-first gateway failed to initialize.', error));
})();
