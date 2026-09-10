(() => {
  const palettes = [
    ['#f3c69d66','#a9d6b966','#c6b6e552','18%','18%','82%','30%','55%','82%'],
    ['#f1d6aa5c','#b6dcbf5c','#b9cae65c','24%','24%','76%','22%','68%','78%'],
    ['#e8c4ad5c','#b7d8c85c','#d5c3e052','20%','30%','84%','18%','48%','84%'],
  ];

  const intentSets = [
    { id:'all', label:'전체', query:'', preferred:[] },
    { id:'community-ministry', label:'공동체 · 사역', query:'공동체 사역 교회 예배 말씀 성경 묵상 기도 사람 모임 연결', preferred:['church','community','bible','social'] },
    { id:'business-growth', label:'비즈니스 · 성장', query:'비즈니스 성장 사업 경영 매장 마케팅 홍보 판매 쇼핑', preferred:['biz','marketing','mall','management','business'] },
    { id:'knowledge-content', label:'지식 · 콘텐츠', query:'지식 콘텐츠 글 출판 책 연구 창작 소셜', preferred:['books','publishing','author','lab','social'] },
    { id:'work-life', label:'일 · 생활', query:'일 생활 업무 프로젝트 삶 질문', preferred:['work','life','my'] },
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
      placeholder:'e.g. Create a church bulletin, promote my store', find:'Find', recommendation:'Recommendations',
      empty:'No available service matches yet.',
      intents:['All','Community · Ministry','Business · Growth','Knowledge · Content','Work · Life'],
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
      placeholder:'例：教会週報を作る、店舗を宣伝する', find:'検索', recommendation:'おすすめ',
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
    const labels = ({
      'ko-KR':{services:'서비스',ecosystem:'생태계',explore:'둘러보기'},
      en:{services:'Services',ecosystem:'Ecosystem',explore:'Explore'},
      'zh-CN':{services:'服务',ecosystem:'生态',explore:'浏览'},
      ja:{services:'サービス',ecosystem:'エコシステム',explore:'見る'},
    })[locale] || {services:'서비스',ecosystem:'생태계',explore:'둘러보기'};
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow) eyebrow.textContent = 'PEOPLE · PURPOSE · CONNECTED';

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
      for (const [href, text] of [['#about', copy(locale, 'about')], ['#start', labels.services], ['#connect', labels.ecosystem]]) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = text;
        nav.append(link);
      }
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
      start.textContent = locale === 'ko-KR' ? '무료로 시작하기' : copy(locale, 'start');
      const explore = document.createElement('a');
      explore.href = '#services';
      explore.className = 'hero-secondary-action';
      explore.textContent = labels.explore;
      actions.append(start, explore);
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

  function renderRecommendations(host, cards, query = '', preferred = [], label = '추천', locale = 'ko-KR', limit = 5) {
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

  function dynamicCopy(locale) {
    return ({
      'ko-KR':{
        stage:'사람을 중심으로 연결되는 더 큰 가능성',
        domains:[['공동체','함께하는 사람들이 더 큰 변화를 만듭니다.'],['사역','좋은 사역이 더 멀리, 더 깊이 이어집니다.'],['비즈니스','가치 있는 일이 지속되도록 연결합니다.'],['삶','오늘도, 더 나은 내일을 향해 이어집니다.']],
        kicker:'EKODI NEXT',title:'지금, 당신의 필요를 여기서 시작하세요.',desc:'독립적인 서비스들이 필요한 순간 연결되어 더 큰 가치를 만듭니다.',more:'모든 서비스',my:['마이 에코디','나의 활동과 서비스를 한곳에서'],
        values:[['사람 중심','사람이 있는 곳에서 가능성이 시작됩니다.'],['독립적 운영','각 서비스는 목적과 경계를 지킵니다.'],['필요한 연결','선택한 범위 안에서 안전하게 연결됩니다.']],
      },
      en:{
        stage:'More possibility, connected around people',
        domains:[['Community','People together create larger change.'],['Ministry','Good ministry travels farther and deeper.'],['Business','Helping valuable work endure.'],['Life','For a better tomorrow, starting today.']],
        kicker:'EKODI NEXT',title:'Start with what you need, right here.',desc:'Independent services connect when needed to create more value.',more:'All services',my:['My EKODI','Your activity and services in one place'],
        values:[['Human centered','Possibility starts where people are.'],['Independent','Each service keeps its purpose and boundary.'],['Connected by choice','Connections stay within the scope you choose.']],
      },
      'zh-CN':{
        stage:'以人为中心，连接更多可能',
        domains:[['社区','同行的人一起创造更大的改变。'],['事工','让好的事工走得更远、更深。'],['商业','让有价值的工作持续成长。'],['生活','从今天连接更好的明天。']],
        kicker:'EKODI NEXT',title:'从这里开始你此刻需要的事。',desc:'独立服务在需要时连接，创造更大的价值。',more:'全部服务',my:['My EKODI','集中管理我的活动与服务'],
        values:[['以人为本','可能性从人所在之处开始。'],['独立运营','每项服务守住自己的目标与边界。'],['按需连接','只在你选择的范围内安全连接。']],
      },
      ja:{
        stage:'人を中心につながる、より大きな可能性',
        domains:[['コミュニティ','人が集まり、より大きな変化を生み出します。'],['ミニストリー','良い働きを、より遠く深くへ。'],['ビジネス','価値ある仕事が続くようにつなぎます。'],['暮らし','今日から、より良い明日へ。']],
        kicker:'EKODI NEXT',title:'今必要なことを、ここから始めよう。',desc:'独立したサービスが必要な時につながり、より大きな価値を生みます。',more:'すべてのサービス',my:['My EKODI','活動とサービスを一か所に'],
        values:[['人を中心に','人がいる場所から可能性が始まります。'],['独立運営','各サービスが目的と境界を守ります。'],['必要なつながり','選んだ範囲の中で安全につながります。']],
      },
    })[locale] || null;
  }

  function buildDynamicVisual(locale) {
    const host = document.querySelector('.ecosystem-pulse');
    const c = dynamicCopy(locale) || dynamicCopy('ko-KR');
    if (!host) return;
    host.className = 'ecosystem-pulse dynamic-ecosystem';
    host.removeAttribute('id');
    host.setAttribute('aria-label', c.stage);
    host.replaceChildren();

    const stage = document.createElement('div');
    stage.className = 'ecosystem-stage';
    const field = document.createElement('div');
    field.className = 'orbital-field';
    field.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= 3; i += 1) {
      const orbit = document.createElement('span');
      orbit.className = `ecosystem-orbit ecosystem-orbit-${i}`;
      const node = document.createElement('i');
      node.className = 'orbit-node';
      orbit.append(node);
      field.append(orbit);
    }
    const core = document.createElement('div');
    core.className = 'ecosystem-core';
    core.innerHTML = '<strong>EKODI</strong><small>ECOSYSTEM</small>';
    const coreCopy = document.createElement('span');
    coreCopy.textContent = c.stage;
    core.append(coreCopy);
    stage.append(field, core);

    const classes = ['community','ministry','business','life'];
    c.domains.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = `domain-float domain-${classes[index]}`;
      const mark = document.createElement('i');
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = ['●','✦','↗','♥'][index];
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = item[0];
      const small = document.createElement('small');
      small.textContent = item[1];
      text.append(strong, small);
      card.append(mark, text);
      stage.append(card);
    });
    host.append(stage);
  }

  function buildQuickLaunch(cards, locale) {
    document.querySelector('.dynamic-start-panel')?.remove();
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const c = dynamicCopy(locale) || dynamicCopy('ko-KR');
    const section = document.createElement('section');
    section.id = 'start';
    section.className = 'dynamic-start-panel section-anchor';
    section.setAttribute('aria-labelledby', 'dynamic-start-title');

    const intro = document.createElement('div');
    intro.className = 'dynamic-start-intro';
    const kicker = document.createElement('p');
    kicker.className = 'dynamic-start-kicker';
    kicker.textContent = c.kicker;
    const title = document.createElement('h2');
    title.id = 'dynamic-start-title';
    title.textContent = c.title;
    const desc = document.createElement('p');
    desc.textContent = c.desc;
    intro.append(kicker, title, desc);

    const launcher = document.createElement('div');
    launcher.className = 'dynamic-service-launchers';
    const preferred = ['church','biz','books','lab','work'];
    const byId = new Map(cards.filter(card => !card.hasAttribute('hidden')).map(card => [card.dataset.serviceId, card]));
    const selected = preferred.map(id => byId.get(id)).filter(Boolean);
    if (selected.length < 5) {
      for (const card of cards) {
        if (selected.length >= 5) break;
        if (!card.hasAttribute('hidden') && !selected.includes(card)) selected.push(card);
      }
    }
    selected.slice(0, 5).forEach((card, index) => {
      const item = serviceData(card);
      const link = document.createElement('a');
      link.className = 'dynamic-service-card';
      link.href = item.url;
      link.dataset.quickService = item.id;
      const icon = document.createElement('span');
      icon.className = 'dynamic-service-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ['교','비','책','연','일'][index] || '•';
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const small = document.createElement('small');
      small.textContent = item.copy;
      link.append(icon, strong, small);
      launcher.append(link);
    });

    const my = document.createElement('a');
    my.className = 'dynamic-service-card dynamic-service-my';
    my.href = 'https://ekodi.kr/my/';
    my.dataset.quickService = 'my';
    const myIcon = document.createElement('span');
    myIcon.className = 'dynamic-service-icon';
    myIcon.setAttribute('aria-hidden', 'true');
    myIcon.textContent = '나';
    const myTitle = document.createElement('strong');
    myTitle.textContent = c.my[0];
    const myCopy = document.createElement('small');
    myCopy.textContent = c.my[1];
    my.append(myIcon, myTitle, myCopy);
    launcher.append(my);

    const more = document.createElement('a');
    more.className = 'dynamic-more-link';
    more.href = '#services';
    more.textContent = `${c.more} →`;

    const values = document.createElement('div');
    values.className = 'dynamic-values';
    c.values.forEach((item, index) => {
      const value = document.createElement('div');
      value.className = 'dynamic-value';
      const badge = document.createElement('span');
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = ['◎','◇','↗'][index];
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = item[0];
      const small = document.createElement('small');
      small.textContent = item[1];
      text.append(strong, small);
      value.append(badge, text);
      values.append(value);
    });

    section.append(intro, launcher, more, values);
    hero.after(section);
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
    buildDynamicVisual(next);
    buildQuickLaunch(cards,next);
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
    document.body.dataset.livingGateway = 'v6-dynamic-ecosystem';

    const allCards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(allCards);
    renderHomepageLocale(locale);
  }

  window.addEventListener('ekodi:locale-change', event => renderHomepageLocale(event.detail?.locale || getLocale()));
  start().catch(error => console.warn('[EKODI] hook-first gateway failed to initialize.', error));
})();