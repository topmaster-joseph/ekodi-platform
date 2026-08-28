(() => {
  function installLegalFooter() {
    if (document.querySelector('[data-ekodi-legal-footer]')) return;
    if (!document.getElementById('ekodi-homepage-legal-style')) {
      const style = document.createElement('style');
      style.id = 'ekodi-homepage-legal-style';
      style.textContent = `
        .ekodi-legal-footer{position:relative;z-index:2;margin-top:32px;border-top:1px solid rgba(23,33,28,.12);background:rgba(250,250,247,.86);backdrop-filter:blur(12px);color:#536158;font-size:12px;line-height:1.65}
        .ekodi-legal-footer__inner{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0 28px;display:grid;gap:7px}
        .ekodi-legal-footer__top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
        .ekodi-legal-footer__brand{font-weight:800;letter-spacing:.12em;color:#18251d}
        .ekodi-legal-footer__links{display:flex;gap:14px;flex-wrap:wrap}
        .ekodi-legal-footer a{color:#315d48;text-decoration:none;text-underline-offset:3px}
        .ekodi-legal-footer a:hover,.ekodi-legal-footer a:focus-visible{text-decoration:underline}
        .ekodi-legal-footer__business{display:flex;gap:5px 12px;flex-wrap:wrap}
        .ekodi-legal-footer__address{word-break:keep-all}
        .ekodi-legal-footer__copyright{margin-top:2px;color:#738077}
        .ekodi-legal-footer__scope{margin-top:3px;color:#829087;font-size:11px}
        @media(prefers-color-scheme:dark){.ekodi-legal-footer{border-color:rgba(255,255,255,.12);background:rgba(16,21,18,.9);color:#adb9b1}.ekodi-legal-footer__brand{color:#edf4ef}.ekodi-legal-footer a{color:#9ed0b4}.ekodi-legal-footer__copyright,.ekodi-legal-footer__scope{color:#87958c}}
        @media(max-width:640px){.ekodi-legal-footer__inner{width:min(100% - 24px,1180px);padding:20px 0 24px}.ekodi-legal-footer__top{align-items:flex-start;flex-direction:column}.ekodi-legal-footer__links{gap:8px 12px}.ekodi-legal-footer__business{display:grid;gap:2px}}
      `;
      document.head.appendChild(style);
    }

    const footer = document.createElement('footer');
    footer.className = 'ekodi-legal-footer';
    footer.dataset.ekodiLegalFooter = 'v1';
    footer.setAttribute('aria-label', 'EKODI 운영 및 법적 고지');
    footer.innerHTML = `
      <div class="ekodi-legal-footer__inner">
        <div class="ekodi-legal-footer__top">
          <strong class="ekodi-legal-footer__brand">EKODI</strong>
          <nav class="ekodi-legal-footer__links" aria-label="법적 고지">
            <a href="/privacy">개인정보처리방침</a>
            <a href="/terms">이용약관</a>
            <a href="mailto:ekodibiz@gmail.com">문의</a>
          </nav>
        </div>
        <div class="ekodi-legal-footer__business">
          <span>운영주체 에코디비즈</span><span>대표 정찬균</span><span>사업자등록번호 213-13-01959</span>
        </div>
        <div class="ekodi-legal-footer__address">사업장 소재지 전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층 · <a href="mailto:ekodibiz@gmail.com">ekodibiz@gmail.com</a></div>
        <div class="ekodi-legal-footer__copyright">© 2026 EKODI · EKODIBIZ. All rights reserved.</div>
        <div class="ekodi-legal-footer__scope">독립 운영주체 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.</div>
      </div>`;
    document.body.appendChild(footer);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLegalFooter, { once:true });
  else installLegalFooter();
})();

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
    { keyword:'CONNECT', title:'오늘, 어디로 연결될까요?', sub:'필요한 자리로 곧장 이어지는 EKODI의 오늘입니다.' },
    { keyword:'SHARE', title:'나눌수록 길은 넓어집니다', sub:'사람과 공동체, 지식과 일이 서로의 다음 장면을 엽니다.' },
    { keyword:'CREATE', title:'오늘의 생각을 다음 일로', sub:'창작과 연구, 비즈니스와 실행을 한 생태계에서 이어갑니다.' },
    { keyword:'GROW', title:'작은 시작이 생태계를 만납니다', sub:'운영 중인 EKODI 서비스에서 지금 필요한 도구를 찾아보세요.' },
    { keyword:'LEARN', title:'배우고 연결하고 다시 움직입니다', sub:'지식이 머무르지 않고 사람과 현장으로 흐르도록 연결합니다.' },
    { keyword:'BUILD', title:'서로 잘 서도록 연결합니다', sub:'각 서비스는 독립적으로 서고, 필요한 순간에만 자연스럽게 이어집니다.' },
    { keyword:'TODAY', title:'오늘의 EKODI를 엽니다', sub:'매일 조금 다른 표정으로, 같은 길을 더 쉽게 찾을 수 있게 합니다.' },
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
    style.textContent = '.service-card.is-admin-featured{outline:1px solid rgba(250,204,21,.42);box-shadow:0 12px 34px rgba(15,23,42,.10)}.service-card.is-admin-featured .service-title strong::after{content:" · Featured";font-size:.65em;font-weight:600;opacity:.48}.service-group[hidden],.service-card[hidden]{display:none!important}';
    document.head.appendChild(style);
  }

  function seoulDateKey(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
    });
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

  function installHistoryEntry() {
    const nav = document.querySelector('.site-header .nav');
    if (!nav || nav.querySelector('[data-ekodi-history-link]')) return;
    const login = nav.querySelector('.login');
    const link = document.createElement('a');
    link.href = '/history';
    link.dataset.ekodiHistoryLink = 'v1';
    link.innerHTML = '역사 <span>History</span>';
    nav.insertBefore(link, login || null);
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

  function buildDailyPanel(focus, liveCount, story, dateLabel) {
    const host = document.querySelector('.ecosystem-pulse');
    if (!host || !focus) return;

    host.classList.add('living-daily');
    host.setAttribute('aria-label', '오늘의 EKODI 연결 추천');
    host.replaceChildren();

    const panel = document.createElement('article');
    panel.className = 'daily-connect';
    panel.dataset.dailyFocus = focus.dataset.serviceId || '';

    const top = document.createElement('div');
    top.className = 'daily-connect-top';

    const kicker = document.createElement('span');
    kicker.className = 'daily-connect-kicker';
    kicker.textContent = 'TODAY IN EKODI';

    const live = document.createElement('span');
    live.className = 'daily-live-count';
    live.innerHTML = '<i aria-hidden="true"></i><b data-status-count="live"></b><span> live</span>';
    live.querySelector('b').textContent = String(liveCount);
    top.append(kicker, live);

    const date = document.createElement('p');
    date.className = 'daily-date';
    date.textContent = `${dateLabel} · ${story.keyword}`;

    const label = document.createElement('p');
    label.className = 'daily-focus-label';
    label.textContent = '오늘의 연결';

    const focusTitle = document.createElement('strong');
    focusTitle.className = 'daily-focus-title';
    focusTitle.textContent = focus.querySelector('.service-title strong')?.textContent || 'EKODI';

    const focusCopy = document.createElement('p');
    focusCopy.className = 'daily-focus-copy';
    focusCopy.textContent = focus.querySelector('.service-description > span')?.textContent || '지금 운영 중인 EKODI 서비스를 만나보세요.';

    const link = document.createElement('a');
    link.className = 'daily-focus-link';
    link.href = focus.getAttribute('href') || '#services';
    link.innerHTML = '사이트로 이동 <span aria-hidden="true">↗</span>';

    panel.append(top, date, label, focusTitle, focusCopy, link);
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
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const item of data.services || []) {
        if (!item?.id) continue;
        const visibility = ['hidden', 'normal', 'featured'].includes(item.visibility) ? item.visibility : 'hidden';
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

  async function start() {
    installMessageUI();
    installHistoryEntry();
    installPresentationStyle();

    const root = document.documentElement;
    const dateKey = seoulDateKey();
    const seed = dailySeed(dateKey);
    const palette = palettes[seed % palettes.length];
    const story = dailyStories[(seed >>> 4) % dailyStories.length];
    const keys = ['--ambient-a','--ambient-b','--ambient-c','--ambient-x1','--ambient-y1','--ambient-x2','--ambient-y2','--ambient-x3','--ambient-y3'];
    keys.forEach((key,index) => root.style.setProperty(key,palette[index]));
    root.dataset.ambientTheme = String((seed % palettes.length) + 1);
    root.dataset.dailyDate = dateKey;
    root.dataset.dailyKeyword = story.keyword;
    document.body.dataset.livingGateway = 'v2';

    const allCards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(allCards);
    const cards = allCards.filter(card => !card.hasAttribute('hidden'));
    const liveCards = cards.filter(card => card.dataset.serviceStatus === 'live');
    for (const status of ['live', 'beta']) {
      const count = cards.filter(card => card.dataset.serviceStatus === status).length;
      document.querySelectorAll(`[data-status-count="${status}"]`).forEach(node => {
        node.textContent = String(count);
      });
    }

    const dateLabel = new Intl.DateTimeFormat('ko-KR', {
      timeZone:'Asia/Seoul', month:'long', day:'numeric', weekday:'short'
    }).format(new Date());
    setHeroStory(story, dateLabel);

    if (liveCards.length) {
      const preferred = liveCards.filter(card => card.classList.contains('is-admin-featured'));
      const pool = preferred.length ? preferred : liveCards;
      const focus = pool[(seed >>> 9) % pool.length];
      focus.classList.add('is-daily-feature');
      focus.setAttribute('aria-current', 'true');
      buildDailyPanel(focus, liveCards.length, story, dateLabel);
    }
  }

  start().catch(error => console.warn('[EKODI] living gateway failed to initialize.', error));
})();