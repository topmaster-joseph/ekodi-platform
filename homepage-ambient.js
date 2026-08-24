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

  installMessageUI();
  installHistoryEntry();

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
  document.body.dataset.livingGateway = 'v1';

  const cards = [...document.querySelectorAll('.service-card[data-service-status]')];
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
    const focus = liveCards[(seed >>> 9) % liveCards.length];
    focus.classList.add('is-daily-feature');
    focus.setAttribute('aria-current', 'true');
    buildDailyPanel(focus, liveCards.length, story, dateLabel);
  }

  // Legacy random behavior used crypto.getRandomValues; the Living Gateway now uses one stable Seoul-date seed per day.
})();