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

  const localeOptions = [
    { code:'ko-KR', short:'KO', label:'한국어' },
    { code:'en', short:'EN', label:'English' },
    { code:'zh-CN', short:'中', label:'中文(简体)' },
    { code:'ja', short:'JA', label:'日本語' },
  ];

  const localeCopy = {
    'ko-KR': {
      about:'소개', login:'로그인', start:'무료로 시작', hero:'원하는 일, 바로 시작하세요',
      heroSub:'공동체, 사역, 비즈니스, 삶. 필요한 길만 가볍게 연결합니다.',
      note:'복잡한 메뉴 대신, 지금 필요한 한 가지에서 시작하세요.',
      quick:'QUICK START', today:'오늘 무엇을 하시나요?',
      desc:'하고 싶은 일을 고르거나 적어보세요. 필요한 길만 보여드립니다.',
      placeholder:'예: 교회 주보 만들기, 매장 홍보하기', find:'찾기', recommendation:'추천',
      empty:'현재 연결 가능한 서비스를 찾지 못했습니다.',
      intents:['공동체','사역','비즈니스','콘텐츠'],
      paths:[['교회와 모임','공동체와 사역에 필요한 길'],['매장과 마케팅','사업과 홍보에 필요한 길'],['콘텐츠와 글쓰기','글·출판·콘텐츠에 필요한 길']],
      history:'역사', terms:'이용약관', privacy:'개인정보처리방침',
    },
    en: {
      about:'About', login:'Sign in', start:'Start free', hero:'Start with what you need',
      heroSub:'Community, ministry, business, and life. Connect only to the paths you need.',
      note:'Skip the maze of menus. Start with the one thing you need now.',
      quick:'QUICK START', today:'What would you like to do today?',
      desc:'Choose or describe what you want to do. We will show only the relevant paths.',
      placeholder:'e.g. Create a church bulletin, promote my store', find:'Find', recommendation:'Recommendations',
      empty:'No available service matches yet.',
      intents:['Community','Ministry','Business','Content'],
      paths:[['Church & groups','For community and ministry'],['Store & marketing','For business and promotion'],['Content & writing','For writing, publishing and content']],
      history:'History', terms:'Terms', privacy:'Privacy',
    },
    'zh-CN': {
      about:'介绍', login:'登录', start:'免费开始', hero:'从你需要的事情开始',
      heroSub:'社区、事工、商业与生活，只连接此刻需要的路径。',
      note:'无需浏览复杂菜单，从现在最需要的一件事开始。',
      quick:'快速开始', today:'今天想做什么？',
      desc:'选择或输入你想做的事，只显示相关路径。',
      placeholder:'例如：制作教会周报、宣传门店', find:'查找', recommendation:'推荐',
      empty:'暂未找到可连接的服务。',
      intents:['社区','事工','商业','内容'],
      paths:[['教会与聚会','社区与事工所需路径'],['门店与营销','商业与推广所需路径'],['内容与写作','写作、出版与内容路径']],
      history:'历史', terms:'使用条款', privacy:'隐私政策',
    },
    ja: {
      about:'紹介', login:'ログイン', start:'無料で始める', hero:'必要なことから、すぐ始めよう',
      heroSub:'コミュニティ、ミニストリー、ビジネス、暮らし。必要な道だけをつなぎます。',
      note:'複雑なメニューではなく、今必要な一つから始めましょう。',
      quick:'クイックスタート', today:'今日は何をしますか？',
      desc:'やりたいことを選ぶか入力してください。必要な道だけを表示します。',
      placeholder:'例：教会週報を作る、店舗を宣伝する', find:'検索', recommendation:'おすすめ',
      empty:'現在利用できるサービスが見つかりません。',
      intents:['コミュニティ','ミニストリー','ビジネス','コンテンツ'],
      paths:[['教会と集まり','コミュニティとミニストリー'],['店舗とマーケティング','ビジネスと広報'],['コンテンツと執筆','執筆・出版・コンテンツ']],
      history:'沿革', terms:'利用規約', privacy:'プライバシー',
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
      .language-menu summary{min-height:34px;display:flex;align-items:center;gap:5px;padding:0 10px;border:1px solid rgba(69,103,81,.1);border-radius:999px;background:rgba(255,255,255,.55);color:#5e7566;cursor:pointer;list-style:none;font-size:10px;font-weight:850}
      .language-menu summary::-webkit-details-marker{display:none}
      .language-menu summary span{font-size:12px}.language-menu summary b{font-size:9px}
      .language-options{position:absolute;top:calc(100% + 8px);right:0;z-index:20;width:156px;padding:6px;border:1px solid rgba(69,103,81,.1);border-radius:15px;background:rgba(255,255,255,.96);box-shadow:0 16px 42px rgba(56,76,63,.12);backdrop-filter:blur(16px)}
      .language-options button{width:100%;min-height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 9px;border:0;border-radius:9px;background:transparent;color:#506358;cursor:pointer;font:inherit;font-size:10px;text-align:left}
      .language-options button:hover,.language-options button:focus-visible,.language-options button[aria-checked="true"]{background:#f2f7f1;outline:0}
      .language-options small{color:#91a098;font-size:8px}
      @media(max-width:640px){.language-menu summary{width:34px;justify-content:center;padding:0}.language-menu summary b{display:none}.language-options{right:-44px}}
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
    if (!nav) return;
    const details = document.createElement('details');
    details.className = 'language-menu';
    details.dataset.ekodiLanguage = 'v1';
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

  function setHookFirstHero(locale) {
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = 'EKODI NEXT';

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
      const about = document.createElement('a');
      about.href = '#about';
      about.textContent = copy(locale, 'about');
      nav.append(about);
      installLanguageSelector(nav, locale);
      if (login) {
        login.innerHTML = copy(locale, 'login');
        login.setAttribute('aria-label', copy(locale, 'login'));
        nav.append(login);
      }
    }

    const actions = document.querySelector('.hero-actions');
    if (actions) {
      actions.replaceChildren();
      const start = document.createElement('a');
      start.href = '#start';
      start.className = 'hero-primary-action';
      start.textContent = copy(locale, 'start');
      actions.append(start);
      if (login) {
        const signIn = document.createElement('a');
        signIn.href = login.href;
        signIn.className = 'hero-secondary-action';
        signIn.textContent = copy(locale, 'login');
        actions.append(signIn);
      }
      const note = document.createElement('p');
      note.className = 'hero-note';
      note.textContent = copy(locale, 'note');
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

  function renderRecommendations(host, cards, query = '', preferred = [], label = '추천', locale = 'ko-KR') {
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
      empty.textContent = copy(locale, 'empty');
      host.append(empty);
    }
  }

  function buildQuickLinks(cards, locale) {
    const list = document.createElement('div');
    list.className = 'quick-paths';
    list.setAttribute('aria-label', copy(locale, 'quick'));

    quickPaths.forEach((path, index) => {
      const item = bestService(cards, path);
      const translated = copy(locale, 'paths')[index] || [path.label, path.copy];
      const link = document.createElement('a');
      link.className = 'quick-path';
      link.href = item?.url || '#services';
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = translated[0];
      const small = document.createElement('small');
      small.textContent = translated[1];
      const arrow = document.createElement('b');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      text.append(strong, small);
      link.append(text, arrow);
      list.append(link);
    });
    return list;
  }

  function buildDailyPanel(cards, locale) {
    const host = document.querySelector('.ecosystem-pulse');
    if (!host) return;
    host.id = 'start';
    host.className = 'ecosystem-pulse living-daily intent-gateway';
    host.setAttribute('aria-label', copy(locale, 'today'));
    host.replaceChildren();

    const panel = document.createElement('article');
    panel.className = 'daily-connect intent-panel';

    const kicker = document.createElement('p');
    kicker.className = 'daily-connect-kicker';
    kicker.textContent = copy(locale, 'quick');

    const title = document.createElement('h2');
    title.className = 'intent-title';
    title.textContent = copy(locale, 'today');

    const desc = document.createElement('p');
    desc.className = 'intent-desc';
    desc.textContent = copy(locale, 'desc');

    const chips = document.createElement('div');
    chips.className = 'intent-chips';

    const results = document.createElement('div');
    results.className = 'intent-results';
    results.setAttribute('aria-live', 'polite');
    results.hidden = true;

    intentSets.forEach((intent, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'intent-chip';
      button.textContent = copy(locale, 'intents')[index] || intent.label;
      button.addEventListener('click', () => {
        results.hidden = false;
        renderRecommendations(results, cards, intent.query, intent.preferred, `${button.textContent} ${copy(locale, 'recommendation')}`, locale);
      });
      chips.append(button);
    });

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
    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        input.focus();
        return;
      }
      results.hidden = false;
      renderRecommendations(results, cards, query, [], `“${query.slice(0, 24)}” ${copy(locale, 'recommendation')}`, locale);
    });

    panel.append(kicker, title, desc, chips, form, buildQuickLinks(cards, locale), results);
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

  function installSecondaryLinks(locale) {
    const note = document.querySelector('.footer-note');
    if (!note || note.querySelector('[data-ekodi-secondary-links]')) return;
    const links = document.createElement('span');
    links.dataset.ekodiSecondaryLinks = 'v2';
    links.className = 'secondary-links';
    const history = document.createElement('a');
    history.href = '/history';
    history.dataset.ekodiHistoryLink = 'v1';
    history.innerHTML = locale === 'ko-KR' ? '역사 <span>History</span>' : copy(locale, 'history');
    const about = document.createElement('a');
    about.href = '#about';
    about.textContent = copy(locale, 'about');
    const terms = document.createElement('a');
    terms.href = '/terms';
    terms.textContent = copy(locale, 'terms');
    const privacy = document.createElement('a');
    privacy.href = '/privacy';
    privacy.textContent = copy(locale, 'privacy');
    links.append(history, about, terms, privacy);
    note.append(links);
  }

  async function start() {
    installMessageUI();
    installPresentationStyle();
    installLanguageStyle();

    const locale = getLocale();
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    setHookFirstHero(locale);
    installSecondaryLinks(locale);

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
    buildDailyPanel(cards, locale);
  }

  start().catch(error => console.warn('[EKODI] hook-first gateway failed to initialize.', error));
})();