(() => {
  const palettes = [
    ['#f3c69d66','#a9d6b966','#c6b6e552','18%','18%','82%','30%','55%','82%'],
    ['#f1d6aa5c','#b6dcbf5c','#b9cae65c','24%','24%','76%','22%','68%','78%'],
    ['#e8c4ad5c','#b7d8c85c','#d5c3e052','20%','30%','84%','18%','48%','84%'],
  ];

  const intentSets = [
    { id:'all', category:'all', label:'전체' },
    { id:'community-ministry', category:'community-ministry', label:'공동체 · 사역' },
    { id:'business-growth', category:'business-growth', label:'비즈니스 · 성장' },
    { id:'knowledge-creation', category:'knowledge-creation', label:'지식 · 콘텐츠' },
    { id:'work-life', category:'work-life', label:'일 · 생활' },
  ];

  const quickPaths = [
    { label:'교회와 모임', copy:'공동체와 사역에 필요한 길', query:'교회 공동체 모임 사역 예배', preferred:['church','community','bible'] },
    { label:'매장과 마케팅', copy:'사업과 홍보에 필요한 길', query:'매장 사업 마케팅 홍보 판매', preferred:['marketing','business','biz','management','work'] },
    { label:'콘텐츠와 글쓰기', copy:'글·출판·콘텐츠에 필요한 길', query:'콘텐츠 글쓰기 출판 책 창작', preferred:['author','publishing','books','social','lab'] },
  ];

  const localeCopy = {
    'ko-KR': {
      about:'소개', login:'로그인', start:'무료로 시작', hero:'원하는 일, 바로 시작하세요',
      heroSub:'공동체, 사역, 비즈니스, 삶. 필요한 길만 가볍게 연결합니다.',
      note:'복잡한 메뉴 대신, 지금 필요한 한 가지에서 시작하세요.',
      quick:'QUICK START', today:'오늘 무엇을 하시나요?',
      desc:'하고 싶은 일을 고르거나 적어보세요. 필요한 길만 보여드립니다.',
      placeholder:'예: 교회 주보 만들기, 매장 홍보하기', find:'찾기', recommendation:'추천', connect:'연결하기',
      empty:'현재 연결 가능한 서비스를 찾지 못했습니다.',
      intents:['전체','공동체 · 사역','비즈니스 · 성장','지식 · 콘텐츠','일 · 생활'],
      paths:[['교회와 모임','공동체와 사역에 필요한 길'],['매장과 마케팅','사업과 홍보에 필요한 길'],['콘텐츠와 글쓰기','글·출판·콘텐츠에 필요한 길']],
      history:'역사', terms:'이용약관', privacy:'개인정보처리방침',
    },
    en: {
      about:'About', login:'Sign in', start:'Start free', hero:'Start with what you need',
      heroSub:'Community, ministry, business, and life. Connect only to the paths you need.',
      note:'Skip the maze of menus. Start with the one thing you need now.',
      quick:'QUICK START', today:'What would you like to do today?',
      desc:'Choose or describe what you want to do. We will show only the relevant paths.',
      placeholder:'e.g. Create a church bulletin, promote my store', find:'Find', recommendation:'Recommendations', connect:'Connect',
      empty:'No available service matches yet.',
      intents:['All','Community & Ministry','Business & Growth','Knowledge & Content','Work & Life'],
      paths:[['Church & groups','For community and ministry'],['Store & marketing','For business and promotion'],['Content & writing','For writing, publishing and content']],
      history:'History', terms:'Terms', privacy:'Privacy',
    },
    'zh-CN': {
      about:'介绍', login:'登录', start:'免费开始', hero:'从你需要的事情开始',
      heroSub:'社区、事工、商业与生活，只连接此刻需要的路径。',
      note:'无需浏览复杂菜单，从现在最需要的一件事开始。',
      quick:'快速开始', today:'今天想做什么？',
      desc:'选择或输入你想做的事，只显示相关路径。',
      placeholder:'例如：制作教会周报、宣传门店', find:'查找', recommendation:'推荐', connect:'连接',
      empty:'暂未找到可连接的服务。',
      intents:['全部','社区 · 事工','商业 · 成长','知识 · 内容','工作 · 生活'],
      paths:[['教会与聚会','社区与事工所需路径'],['门店与营销','商业与推广所需路径'],['内容与写作','写作、出版与内容路径']],
      history:'历史', terms:'使用条款', privacy:'隐私政策',
    },
    ja: {
      about:'紹介', login:'ログイン', start:'無料で始める', hero:'必要なことから、すぐ始めよう',
      heroSub:'コミュニティ、ミニストリー、ビジネス、暮らし。必要な道だけをつなぎます。',
      note:'複雑なメニューではなく、今必要な一つから始めましょう。',
      quick:'クイックスタート', today:'今日は何をしますか？',
      desc:'やりたいことを選ぶか入力してください。必要な道だけを表示します。',
      placeholder:'例：教会週報を作る、店舗を宣伝する', find:'検索', recommendation:'おすすめ', connect:'接続する',
      empty:'現在利用できるサービスが見つかりません。',
      intents:['すべて','コミュニティ · ミニストリー','ビジネス · 成長','知識 · コンテンツ','仕事 · 暮らし'],
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
      const item = String(document.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('ekodi_locale='));
      if (item) return normalizeLocale(decodeURIComponent(item.slice('ekodi_locale='.length)));
    } catch {}
    try {
      const saved = localStorage.getItem('ekodi_user_locale') || localStorage.getItem('ekodi.locale');
      if (saved) return normalizeLocale(saved);
    } catch {}
    return normalizeLocale(navigator.language);
  }

  const copy = (locale, key) => localeCopy[locale]?.[key] ?? localeCopy['ko-KR'][key];

  const pageCopy = Object.freeze({
    'ko-KR':{live:'운영중',beta:'테스트',services:'현재 이용 가능한 플랫폼',aboutMain:'는 사람의 선택과 독립성을 지키면서 공동체, 사역, 비즈니스, 창작과 생활을 연결하는 플랫폼 생태계입니다.',aboutSub:'EKODI connects community, ministry, business, creativity, and everyday life while keeping each person and platform free to stand on its own.',pills:['사람 중심 · Human-centered','독립 플랫폼 · Independent','필요한 연결 · Connected by choice'],groups:{'community-ministry':['공동체 · 사역','Community & Ministry'],'business-growth':['비즈니스 · 성장','Business & Growth'],'knowledge-creation':['지식 · 콘텐츠','Knowledge & Content'],'work-life':['일 · 생활','Work & Life']},connect:{kicker:'CONNECTED ECOSYSTEM · 연결',title:'각 플랫폼은 독립적으로, 필요한 곳에서 연결됩니다',sub:'Independent by design. Connected by choice.',body:'서비스의 목적과 운영 경계는 분명히 유지하고, 계정·데이터·AI는 허용된 범위에서만 이어집니다.',bodySub:'Each service keeps a clear purpose and boundary. Accounts, data, and AI connect only where permitted.',points:[['하나의 입구','One entrance','ekodi.kr에서 전체 생태계를 찾습니다.'],['독립 운영','Independent services','플랫폼마다 목적과 정체성을 지킵니다.'],['필요한 연결','Connected by choice','사람이 선택한 범위 안에서만 연결합니다.']]},contact:{kicker:'CONTACT · 문의',title:'어디에서 시작할지 모르겠다면',sub:'Not sure where to begin?',body:'비즈니스와 협력은 에코디비즈, 공동체와 사역은 커뮤니티에서 시작할 수 있습니다.',bodySub:'Start with EKODI Biz for business and collaboration, or Community for people and ministry.',actions:['비즈니스 문의','공동체 연결']}},
    en:{live:'Live',beta:'Beta',services:'Available platforms',aboutMain:' connects community, ministry, business, creativity, and everyday life while protecting each person’s choice and independence.',aboutSub:'',pills:['Human-centered','Independent platforms','Connected by choice'],groups:{'community-ministry':['Community & Ministry',''],'business-growth':['Business & Growth',''],'knowledge-creation':['Knowledge & Content',''],'work-life':['Work & Life','']},connect:{kicker:'CONNECTED ECOSYSTEM',title:'Independent by design. Connected where needed.',sub:'',body:'Each service keeps a clear purpose and operating boundary. Accounts, data, and AI connect only where permitted.',bodySub:'',points:[['One entrance','','Find the whole ecosystem at ekodi.kr.'],['Independent services','','Each platform keeps its purpose and identity.'],['Connected by choice','','Connections happen only within the scope people choose.']]},contact:{kicker:'CONTACT',title:'Not sure where to begin?',sub:'',body:'Start with EKODI Biz for business and collaboration, or Community for people and ministry.',bodySub:'',actions:['Business inquiry','Community connection']}},
    'zh-CN':{live:'运行中',beta:'测试',services:'当前可用平台',aboutMain:'连接社区、事工、商业、创作与日常生活，同时尊重每个人的选择与独立性。',aboutSub:'',pills:['以人为本','平台独立','按需连接'],groups:{'community-ministry':['社区 · 事工',''],'business-growth':['商业 · 成长',''],'knowledge-creation':['知识 · 内容',''],'work-life':['工作 · 生活','']},connect:{kicker:'连接生态',title:'各平台独立运行，在需要之处彼此连接。',sub:'',body:'每项服务都保持清晰的目标与运营边界，账户、数据与 AI 仅在获准范围内连接。',bodySub:'',points:[['一个入口','','从 ekodi.kr 找到整个生态。'],['独立运营','','每个平台保有自己的目标与身份。'],['按需连接','','只在用户选择的范围内建立连接。']]},contact:{kicker:'联系我们',title:'不知道从哪里开始？',sub:'',body:'商务与合作可从 EKODI Biz 开始，社区与事工可从 Community 开始。',bodySub:'',actions:['商务咨询','连接社区']}},
    ja:{live:'運用中',beta:'テスト',services:'現在利用できるプラットフォーム',aboutMain:'は、一人ひとりの選択と自立を大切にしながら、コミュニティ、ミニストリー、ビジネス、創作、暮らしをつなぐプラットフォーム・エコシステムです。',aboutSub:'',pills:['人を中心に','独立したプラットフォーム','必要なつながり'],groups:{'community-ministry':['コミュニティ · ミニストリー',''],'business-growth':['ビジネス · 成長',''],'knowledge-creation':['知識 · コンテンツ',''],'work-life':['仕事 · 暮らし','']},connect:{kicker:'CONNECTED ECOSYSTEM',title:'各プラットフォームは独立し、必要な場所でつながります。',sub:'',body:'サービスごとの目的と運営境界を明確に保ち、アカウント・データ・AI は許可された範囲でのみ連携します。',bodySub:'',points:[['一つの入口','','ekodi.kr からエコシステム全体を探せます。'],['独立運営','','各プラットフォームが目的とアイデンティティを守ります。'],['必要なつながり','','人が選んだ範囲の中でのみつながります。']]},contact:{kicker:'お問い合わせ',title:'どこから始めればよいかわからないときは',sub:'',body:'ビジネスと協力は EKODI Biz、コミュニティとミニストリーは Community から始められます。',bodySub:'',actions:['ビジネス相談','コミュニティにつながる']}}
  });
  const serviceCopy = Object.freeze({
    church:{'zh-CN':['爱可迪教会','礼拜、圣经话语与共同体的空间'],ja:['エコディ教会','礼拝とみことば、コミュニティの場']},
    bible:{'zh-CN':['爱可迪圣经对话','从生活问题到圣经话语，再到默想、实践与共同体分享'],ja:['エコディ聖書対話','暮らしの問いからみことばへ、黙想・実践・共同体の分かち合いへ']},
    community:{'zh-CN':['社区','连接人与聚会及参与'],ja:['コミュニティ','人、集まり、参加をつなぐ']},
    social:{'zh-CN':['EKODI Social','汇聚 EKODI 的社交动态'],ja:['EKODI Social','EKODI のソーシャルの流れを一か所に']},
    biz:{'zh-CN':['EKODI Biz','业务与成长的执行枢纽'],ja:['EKODI Biz','事業と成長の実行ハブ']},
    mall:{'zh-CN':['爱可迪商城','轻松快速找到日常所需商品'],ja:['エコディモール','暮らしに必要な商品を手軽に見つけるショッピングモール']},
    marketing:{'zh-CN':['Marketing AI','面向小商户与组织的 AI 营销'],ja:['Marketing AI','小規模事業者と組織のための AI マーケティング']},
    books:{'zh-CN':['爱可迪书店','连接图书探索、销售与独立网上书店'],ja:['エコディ書店','本の発見・販売と独立オンライン書店をつなぐ']},
    publishing:{'zh-CN':['出版','提供出版咨询、制作、代理、发行与工作室服务'],ja:['出版','出版相談・制作・出版代行・流通・スタジオを提供']},
    author:{'zh-CN':['Creator AI','支持写作及更广泛创作工作的 AI'],ja:['Creator AI','文章だけでなく創作全般を支える AI']},
    lab:{'zh-CN':['爱可迪研究所','积累研究、证据与实验'],ja:['エコディ研究所','研究・根拠・実験を蓄積']},
    life:{'zh-CN':['今日问题','从关系、金钱、工作、家庭、内心、未来、信仰与人生问题开始的 Life AI'],ja:['今日の質問','関係・お金・仕事・家族・心・未来・信仰・人生の問いから始まる Life AI']},
    my:{'zh-CN':['My EKODI','集中管理我的活动与服务'],ja:['My EKODI','自分の活動とサービスを一か所に']},
    space:{'zh-CN':['运营空间','以固定空间 ID 与权限连接个人、机构、团体和项目空间'],ja:['運営スペース','不変のスペース ID と権限で個人・機関・団体・プロジェクトをつなぐ']},
    work:{'zh-CN':['EKODI Work','执行工作与项目的空间'],ja:['EKODI Work','仕事とプロジェクトを実行する空間']}
  });

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
      const utilities = [...nav.querySelectorAll('[data-ekodi-language-control],#ekodi-ccm-mr-toggle')];
      nav.replaceChildren();
      const about = document.createElement('a');
      about.href = '#about';
      about.textContent = copy(locale, 'about');
      nav.append(about);
      if (login) {
        login.textContent = copy(locale, 'login');
        login.setAttribute('aria-label', copy(locale, 'login'));
        nav.append(login);
      }
      utilities.forEach(node => nav.append(node));
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
      let note = document.querySelector('.hero-note');
      if (!note) {
        note = document.createElement('p');
        note.className = 'hero-note';
        actions.after(note);
      }
      note.textContent = copy(locale, 'note');
    }
  }

  function setHeading(node, main, sub='') {
    if (!node) return;
    node.replaceChildren(document.createTextNode(main));
    if (sub) { const span=document.createElement('span'); span.textContent=sub; node.append(span); }
  }

  function applyPageLocale(locale) {
    const c=pageCopy[locale]||pageCopy['ko-KR'];
    document.documentElement.lang=locale;
    document.documentElement.dataset.locale=locale;
    const about=document.querySelector('#about .about-grid > p');
    if(about){about.replaceChildren();const brand=document.createElement('strong');brand.textContent='EKODI';about.append(brand,document.createTextNode(c.aboutMain));if(c.aboutSub){const span=document.createElement('span');span.textContent=c.aboutSub;about.append(span);}}
    [...document.querySelectorAll('#about .about-pills > span')].forEach((node,index)=>{if(c.pills[index])node.textContent=c.pills[index];});
    const servicesHeading=document.querySelector('#services > h2.sr-only');if(servicesHeading)servicesHeading.textContent=c.services;
    document.querySelector('#ecosystem')?.setAttribute('aria-label',c.services);
    for(const group of document.querySelectorAll('.service-group[data-service-category]')){
      const pair=c.groups[group.dataset.serviceCategory];if(!pair)continue;
      const strong=group.querySelector('.service-group-heading h3 strong');const small=group.querySelector('.service-group-heading h3 small');
      if(strong)strong.textContent=pair[0];if(small){small.textContent=pair[1]||'';small.hidden=!pair[1];}
    }
    for(const card of document.querySelectorAll('.service-card[data-service-id]')){
      const title=card.querySelector('.service-title strong');const enTitle=card.querySelector('.service-name-en');const desc=card.querySelector('.service-description > span');const enDesc=card.querySelector('.service-description small');
      if(title&&!card.dataset.ekodiKoTitle)card.dataset.ekodiKoTitle=title.textContent.trim();if(enTitle&&!card.dataset.ekodiEnTitle)card.dataset.ekodiEnTitle=enTitle.textContent.trim();
      if(desc&&!card.dataset.ekodiKoDescription)card.dataset.ekodiKoDescription=desc.textContent.trim();if(enDesc&&!card.dataset.ekodiEnDescription)card.dataset.ekodiEnDescription=enDesc.textContent.trim();
      const custom=serviceCopy[card.dataset.serviceId]?.[locale];
      if(locale==='ko-KR'){if(title)title.textContent=card.dataset.ekodiKoTitle||title.textContent;if(desc)desc.textContent=card.dataset.ekodiKoDescription||desc.textContent;}
      else if(locale==='en'){if(title)title.textContent=card.dataset.ekodiEnTitle||card.dataset.ekodiKoTitle;if(desc)desc.textContent=card.dataset.ekodiEnDescription||card.dataset.ekodiKoDescription;}
      else {if(title)title.textContent=custom?.[0]||card.dataset.ekodiEnTitle||card.dataset.ekodiKoTitle;if(desc)desc.textContent=custom?.[1]||card.dataset.ekodiEnDescription||card.dataset.ekodiKoDescription;}
      if(enTitle)enTitle.hidden=locale!=='ko-KR';if(enDesc)enDesc.hidden=locale!=='ko-KR';
      const status=card.querySelector('.service-status b');const statusSub=card.querySelector('.service-status span');if(status)status.textContent=card.dataset.serviceStatus==='beta'?c.beta:c.live;if(statusSub)statusSub.hidden=locale!=='ko-KR';
    }
    const connect=document.querySelector('#connect');if(connect){const kicker=connect.querySelector('.section-kicker');if(kicker)kicker.textContent=c.connect.kicker;setHeading(connect.querySelector('h2'),c.connect.title,c.connect.sub);setHeading(connect.querySelector('p:not(.section-kicker)'),c.connect.body,c.connect.bodySub);[...connect.querySelectorAll('.connect-point')].forEach((node,index)=>{const p=c.connect.points[index];if(!p)return;const strong=node.querySelector('strong'),small=node.querySelector('small'),span=node.querySelector('span');if(strong)strong.textContent=p[0];if(small){small.textContent=p[1]||'';small.hidden=!p[1];}if(span)span.textContent=p[2];});}
    const contact=document.querySelector('#contact');if(contact){const kicker=contact.querySelector('.section-kicker');if(kicker)kicker.textContent=c.contact.kicker;setHeading(contact.querySelector('h2'),c.contact.title,c.contact.sub);setHeading(contact.querySelector('p:not(.section-kicker)'),c.contact.body,c.contact.bodySub);[...contact.querySelectorAll('.contact-actions a')].forEach((node,index)=>{if(c.contact.actions[index])node.textContent=c.contact.actions[index];});}
    for(const node of document.querySelectorAll('.status-satellite')){const status=node.dataset.status;const b=node.querySelector('b'),span=node.querySelector('span');if(b)b.textContent=status==='beta'?c.beta:c.live;if(span)span.hidden=locale!=='ko-KR';}
  }

  function serviceData(card) {
    return {
      id: card.dataset.serviceId || '',
      status: card.dataset.serviceStatus || '',
      name: card.querySelector('.service-title strong')?.textContent?.trim() || '서비스',
      copy: card.querySelector('.service-description > span')?.textContent?.trim() || '필요한 기능으로 이동합니다.',
      url: card.getAttribute('href') || '#services',
      order: Number(card.dataset.homepageOrder || 9999),
    };
  }

  function rankServices(cards, query = '', preferred = [], limit = 3) {
    const words = String(query || '').toLowerCase().split(/[\s,./·]+/).map(value => value.trim()).filter(value => value.length > 1);
    const preferredRank = new Map(preferred.map((id, index) => [id, Math.max(3, 24 - index * 4)]));
    return cards.map(card => {
      const item = serviceData(card);
      const haystack = `${item.id} ${item.name} ${item.copy}`.toLowerCase();
      const matchedWords = words.filter(word => haystack.includes(word));
      let score = item.status === 'live' ? 3 : 0;
      score += preferredRank.get(item.id) || 0;
      score += matchedWords.length * 6;
      return { item, score, matched: words.length === 0 || matchedWords.length > 0 || preferredRank.has(item.id) };
    }).filter(entry => entry.matched)
      .sort((a, b) => b.score - a.score || a.item.order - b.item.order || a.item.name.localeCompare(b.item.name, 'ko')).slice(0, limit);
  }

  function bestService(cards, path) {
    return rankServices(cards, path.query, path.preferred, 1)[0]?.item || null;
  }

  function renderRecommendations(host, cards, query = '', preferred = [], label = '추천', locale = 'ko-KR', limit = 6) {
    const matches = rankServices(cards, query, preferred, limit);
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
      arrow.className = 'intent-result-action';
      arrow.textContent = copy(locale, 'connect');
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
        const categoryCards = intent.category === 'all'
          ? cards
          : cards.filter(card => card.closest('.service-group')?.dataset.serviceCategory === intent.category);
        results.hidden = false;
        renderRecommendations(results, categoryCards, '', [], `${button.textContent} ${copy(locale, 'recommendation')}`, locale, categoryCards.length);
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
      renderRecommendations(results, cards, query, [], `“${query.slice(0, 24)}” ${copy(locale, 'recommendation')}`, locale, 6);
    });

    panel.append(kicker, title, desc, chips, form, results);
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
    if (!note) return;
    let links = note.querySelector('[data-ekodi-secondary-links]');
    if (!links) {
      links = document.createElement('span');
      links.dataset.ekodiSecondaryLinks = 'v2';
      links.className = 'secondary-links';
      note.append(links);
    }
    links.replaceChildren();
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

  function renderHomepageLocale(locale) {
    const next=normalizeLocale(locale);
    setHookFirstHero(next);
    applyPageLocale(next);
    installSecondaryLinks(next);
    const cards=[...document.querySelectorAll('.service-card[data-service-status][data-service-id]')].filter(card=>!card.hasAttribute('hidden'));
    buildDailyPanel(cards,next);
  }

  async function start() {
    installMessageUI();
    installPresentationStyle();

    const locale = getLocale();
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;

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
    renderHomepageLocale(locale);
  }

  window.addEventListener('ekodi:locale-change', event => renderHomepageLocale(event.detail?.locale || getLocale()));
  start().catch(error => console.warn('[EKODI] hook-first gateway failed to initialize.', error));
})();