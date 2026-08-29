(() => {
  const palettes = [
    ['#efe6c966','#d7e3d866','#e7e1cf52','22%','18%','79%','28%','56%','80%'],
    ['#eee3cf60','#dce9df60','#d9d6c552','18%','24%','84%','20%','62%','77%'],
    ['#eadfca5c','#d4e3da5c','#e9e4d352','26%','22%','76%','26%','50%','84%'],
  ];

  const intentSets = [
    { id:'community', label:'공동체', query:'공동체 모임 교회 사람 연결', preferred:['community','church'] },
    { id:'ministry', label:'사역', query:'교회 예배 말씀 성경 묵상 기도 사역', preferred:['church','bible','community'] },
    { id:'business', label:'일·사업', query:'사업 경영 매장 마케팅 홍보 판매 일 창업', preferred:['marketing','management','work','business','biz'] },
    { id:'content', label:'창작·콘텐츠', query:'콘텐츠 글 출판 책 연구 소셜 창작 영상', preferred:['author','publishing','books','social','lab'] },
    { id:'learning', label:'배움', query:'배움 교육 강의 연구 성경 학습', preferred:['lab','bible','books','author'] },
    { id:'life', label:'일상', query:'일상 생활 지원 돌봄 나눔 에너지 삶', preferred:['life','energy','community','work'] },
  ];

  const localeOptions = [
    { code:'ko-KR', short:'KO', label:'한국어' },
    { code:'en', short:'EN', label:'English' },
    { code:'zh-CN', short:'ZH', label:'中文' },
    { code:'ja', short:'JA', label:'日本語' },
  ];

  const localeCopy = {
    'ko-KR': {
      browse:'서비스 둘러보기', guide:'사용 가이드', news:'소식', login:'로그인',
      eyebrow:'연결로 시작해, 변화로 이어가는 여정',
      hero:'필요한 길을 고르세요',
      heroSub:'EKODI의 다양한 서비스가 당신의 사역과 일상을 함께합니다.',
      today:'필요한 길을 검색하세요',
      placeholder:'예: 공동체 찾기, 콘텐츠 제작, 마케팅, 배움',
      find:'검색', recommendation:'추천', empty:'현재 연결 가능한 서비스를 찾지 못했습니다.',
      all:'전체', intents:['공동체','사역','일·사업','창작·콘텐츠','배움','일상'],
      todayPick:'오늘의 추천',
      endTitle:'작은 연결이 새로운 길을 엽니다',
      endCopy:'필요한 서비스만 가볍게 선택해 시작하세요.',
    },
    en: {
      browse:'Explore services', guide:'Guide', news:'Highlights', login:'Sign in',
      eyebrow:'A journey that begins with connection',
      hero:'Choose the path you need',
      heroSub:'EKODI brings together services for community, ministry, work, creativity, learning, and everyday life.',
      today:'Search for the path you need',
      placeholder:'e.g. Find a community, create content, marketing, learning',
      find:'Search', recommendation:'Recommendations', empty:'No available service matches yet.',
      all:'All', intents:['Community','Ministry','Work · Business','Create · Content','Learning','Everyday'],
      todayPick:"Today's picks",
      endTitle:'Small connections open new paths',
      endCopy:'Choose only what you need and begin lightly.',
    },
    'zh-CN': {
      browse:'浏览服务', guide:'使用指南', news:'推荐', login:'登录',
      eyebrow:'从连接开始，走向改变',
      hero:'选择你需要的路径',
      heroSub:'EKODI 将社区、事工、工作、创作、学习与日常生活自然连接起来。',
      today:'搜索你需要的路径',
      placeholder:'例如：寻找社区、内容制作、营销、学习',
      find:'搜索', recommendation:'推荐', empty:'暂未找到可连接的服务。',
      all:'全部', intents:['社区','事工','工作·商业','创作·内容','学习','日常'],
      todayPick:'今日推荐',
      endTitle:'小小的连接，开启新的道路',
      endCopy:'只选择现在需要的服务，轻松开始。',
    },
    ja: {
      browse:'サービスを見る', guide:'使い方', news:'おすすめ', login:'ログイン',
      eyebrow:'つながりから始まり、変化へ続く旅',
      hero:'必要な道を選んでください',
      heroSub:'EKODIはコミュニティ、ミニストリー、仕事、創作、学び、暮らしを自然につなぎます。',
      today:'必要な道を検索',
      placeholder:'例：コミュニティ、コンテンツ制作、マーケティング、学び',
      find:'検索', recommendation:'おすすめ', empty:'現在利用できるサービスが見つかりません。',
      all:'すべて', intents:['コミュニティ','ミニストリー','仕事・事業','創作・コンテンツ','学び','暮らし'],
      todayPick:'今日のおすすめ',
      endTitle:'小さなつながりが、新しい道を開きます',
      endCopy:'必要なサービスだけを軽やかに選んで始めましょう。',
    },
  };

  const normalizeLocale = value => {
    const raw = String(value || '');
    if (/^zh/i.test(raw)) return 'zh-CN';
    if (/^ja/i.test(raw)) return 'ja';
    if (/^en/i.test(raw)) return 'en';
    return 'ko-KR';
  };

  function getLocale() {
    try {
      const saved = localStorage.getItem('ekodi.locale');
      if (saved) return normalizeLocale(saved);
    } catch {}
    return normalizeLocale(navigator.language);
  }

  const copy = (locale, key) => localeCopy[locale]?.[key] ?? localeCopy['ko-KR'][key];

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

  function installLanguageStyle() {
    if (document.querySelector('#ekodi-homepage-language-style')) return;
    const style = document.createElement('style');
    style.id = 'ekodi-homepage-language-style';
    style.textContent = `
      .language-menu{position:relative;flex:0 0 auto}
      .language-menu summary{min-height:36px;display:flex;align-items:center;gap:6px;padding:0 11px;border:1px solid rgba(69,103,81,.1);border-radius:12px;background:rgba(255,255,255,.58);color:#496153;cursor:pointer;list-style:none;font-size:10px;font-weight:850}
      .language-menu summary::-webkit-details-marker{display:none}
      .language-menu summary span{font-size:12px}.language-menu summary b{font-size:9px}
      .language-options{position:absolute;top:calc(100% + 8px);right:0;z-index:30;width:156px;padding:6px;border:1px solid rgba(69,103,81,.1);border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 18px 48px rgba(56,76,63,.12);backdrop-filter:blur(16px)}
      .language-options button{width:100%;min-height:36px;display:flex;align-items:center;justify-content:space-between;padding:0 9px;border:0;border-radius:9px;background:transparent;color:#506358;cursor:pointer;font:inherit;font-size:10px;text-align:left}
      .language-options button:hover,.language-options button:focus-visible,.language-options button[aria-checked="true"]{background:#f2f7f1;outline:0}
      .language-options small{color:#91a098;font-size:8px}
      @media(max-width:640px){.language-menu summary{width:34px;justify-content:center;padding:0}.language-menu summary b{display:none}.language-options{right:-34px}}
    `;
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

  function installLanguageSelector(nav, locale) {
    const details = document.createElement('details');
    details.className = 'language-menu';
    details.dataset.ekodiLanguage = 'v2-mystic';
    const selected = localeOptions.find(item => item.code === locale) || localeOptions[0];

    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'Language');
    summary.innerHTML = `<span aria-hidden="true">◎</span><b>${selected.short}</b>`;

    const menu = document.createElement('div');
    menu.className = 'language-options';
    menu.setAttribute('role', 'menu');

    for (const option of localeOptions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.locale = option.code;
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(option.code === locale));
      button.innerHTML = `<span>${option.label}</span><small>${option.short}</small>`;
      button.addEventListener('click', () => {
        try { localStorage.setItem('ekodi.locale', option.code); } catch {}
        window.location.reload();
      });
      menu.append(button);
    }
    details.append(summary, menu);
    nav.append(details);

    document.addEventListener('click', event => {
      if (details.open && !details.contains(event.target)) details.open = false;
    });
  }

  function setMysticHero(locale) {
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = copy(locale, 'eyebrow');

    const title = document.getElementById('hero-title');
    if (title) {
      title.textContent = copy(locale, 'hero');
      const sub = document.createElement('span');
      sub.textContent = copy(locale, 'heroSub');
      title.append(sub);
    }

    const nav = document.querySelector('.site-header .nav');
    const login = nav?.querySelector('.login');
    if (nav) {
      nav.replaceChildren();
      const links = [
        [copy(locale, 'browse'), '#services'],
        [copy(locale, 'guide'), '#start'],
        [copy(locale, 'news'), '#recommendations'],
      ];
      for (const [label, href] of links) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.textContent = label;
        nav.append(anchor);
      }
      installLanguageSelector(nav, locale);
      if (login) {
        login.innerHTML = copy(locale, 'login');
        login.setAttribute('aria-label', copy(locale, 'login'));
        nav.append(login);
      }
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

  function rankServices(cards, query = '', preferred = [], limit = 4) {
    const words = String(query || '').toLowerCase().split(/[\s,./·]+/).map(value => value.trim()).filter(value => value.length > 1);
    const preferredRank = new Map(preferred.map((id, index) => [id, Math.max(3, 24 - index * 4)]));
    return cards.map(card => {
      const item = serviceData(card);
      const haystack = `${item.id} ${item.name} ${item.copy}`.toLowerCase();
      let score = item.status === 'live' ? 4 : 0;
      score += preferredRank.get(item.id) || 0;
      for (const word of words) if (haystack.includes(word)) score += 7;
      return { item, score };
    }).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko')).slice(0, limit);
  }

  function renderRecommendations(host, cards, query = '', preferred = [], label = '추천', locale = 'ko-KR') {
    const matches = rankServices(cards, query, preferred, 4);
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
      empty.textContent = copy(locale, 'empty');
      host.append(empty);
    }
  }

  function buildSearchPanel(cards, locale) {
    const host = document.querySelector('.ecosystem-pulse');
    if (!host) return;
    host.id = 'start';
    host.className = 'ecosystem-pulse living-daily intent-gateway';
    host.setAttribute('aria-label', copy(locale, 'today'));
    host.replaceChildren();

    const panel = document.createElement('article');
    panel.className = 'daily-connect intent-panel';

    const form = document.createElement('form');
    form.className = 'intent-form';
    form.setAttribute('role', 'search');

    const input = document.createElement('input');
    input.type = 'search';
    input.name = 'intent';
    input.autocomplete = 'off';
    input.placeholder = copy(locale, 'placeholder');
    input.setAttribute('aria-label', copy(locale, 'today'));

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = copy(locale, 'find');
    form.append(input, submit);

    const chips = document.createElement('div');
    chips.className = 'intent-chips';

    const results = document.createElement('div');
    results.className = 'intent-results';
    results.setAttribute('aria-live', 'polite');
    results.hidden = true;

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'intent-chip is-active';
    all.textContent = copy(locale, 'all');
    all.addEventListener('click', () => {
      chips.querySelectorAll('.intent-chip').forEach(button => button.classList.toggle('is-active', button === all));
      results.hidden = true;
      input.value = '';
      document.getElementById('services')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    chips.append(all);

    intentSets.forEach((intent, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'intent-chip';
      button.textContent = copy(locale, 'intents')[index] || intent.label;
      button.addEventListener('click', () => {
        chips.querySelectorAll('.intent-chip').forEach(node => node.classList.toggle('is-active', node === button));
        results.hidden = false;
        renderRecommendations(results, cards, intent.query, intent.preferred, `${button.textContent} ${copy(locale, 'recommendation')}`, locale);
      });
      chips.append(button);
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        input.focus();
        return;
      }
      chips.querySelectorAll('.intent-chip').forEach(node => node.classList.remove('is-active'));
      results.hidden = false;
      renderRecommendations(results, cards, query, [], `“${query.slice(0, 24)}” ${copy(locale, 'recommendation')}`, locale);
    });

    panel.append(form, chips, results);
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

  function buildTodayRecommendations(cards, locale, seed) {
    const ecosystem = document.getElementById('ecosystem');
    if (!ecosystem || document.getElementById('recommendations')) return;

    const ranked = cards
      .map(card => ({ item:serviceData(card), salt:dailySeed(`${seed}:${card.dataset.serviceId || ''}`) }))
      .sort((a, b) => (a.item.status === 'live' ? -1 : 1) - (b.item.status === 'live' ? -1 : 1) || a.salt - b.salt)
      .slice(0, 4);

    if (!ranked.length) return;

    const section = document.createElement('section');
    section.id = 'recommendations';
    section.className = 'today-strip section-anchor';
    section.setAttribute('aria-label', copy(locale, 'todayPick'));

    const heading = document.createElement('h2');
    heading.className = 'today-heading';
    heading.textContent = copy(locale, 'todayPick');

    const list = document.createElement('div');
    list.className = 'today-list';

    ranked.forEach(({ item }, index) => {
      const link = document.createElement('a');
      link.className = 'today-item';
      link.href = item.url;

      const icon = document.createElement('span');
      icon.className = 'today-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ['✧','◌','◇','⌁'][index] || '✧';

      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const small = document.createElement('small');
      small.textContent = item.copy;
      text.append(strong, small);

      const arrow = document.createElement('b');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';

      link.append(icon, text, arrow);
      list.append(link);
    });

    section.append(heading, list);
    ecosystem.after(section);

    const end = document.createElement('div');
    end.className = 'mystic-end';
    const strong = document.createElement('strong');
    strong.textContent = copy(locale, 'endTitle');
    const small = document.createElement('small');
    small.textContent = copy(locale, 'endCopy');
    end.append(strong, small);
    section.after(end);
  }

  async function start() {
    installMessageUI();
    installPresentationStyle();
    installLanguageStyle();

    const locale = getLocale();
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    setMysticHero(locale);

    const root = document.documentElement;
    const dateKey = seoulDateKey();
    const seed = dailySeed(dateKey);
    const palette = palettes[seed % palettes.length];
    const keys = ['--ambient-a','--ambient-b','--ambient-c','--ambient-x1','--ambient-y1','--ambient-x2','--ambient-y2','--ambient-x3','--ambient-y3'];
    keys.forEach((key, index) => root.style.setProperty(key, palette[index]));
    root.dataset.ambientTheme = String((seed % palettes.length) + 1);
    root.dataset.dailyDate = dateKey;
    document.body.dataset.livingGateway = 'v5-mystic-journey';

    const allCards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(allCards);
    const cards = allCards.filter(card => !card.hasAttribute('hidden'));
    buildSearchPanel(cards, locale);
    buildTodayRecommendations(cards, locale, seed);
  }

  start().catch(error => console.warn('[EKODI] mystic journey gateway failed to initialize.', error));
})();