(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const CHAT_STATE_KEY = 'ekodi-chief-ai-chat-v1';
  const MAX_MESSAGES = 40;
  const MAX_INPUT = 1800;

  const styles = [
    'ai-ops-admin.css',
    'release-control-admin.css',
    'work-admin.css',
    'marketing-ai-admin.css',
  ];
  const scripts = [
    'ai-ops-admin.js',
    'release-control-admin.js',
    'work-admin.js',
    'marketing-ai-admin.js',
  ];

  const SITE_META = [
    { domain:'ekodi.kr', name:'EKODI Home', group:'Core & Access', role:'생태계 정문·서비스 레지스트리', aliases:['에코디 홈','에코디','홈','root','home'] },
    { domain:'admin.ekodi.kr', name:'Control Center', group:'Core & Access', role:'통합운영·권한·감사', aliases:['관리자','관리자페이지','컨트롤센터','control center','admin'] },
    { domain:'auth.ekodi.kr', name:'EKODI Auth', group:'Core & Access', role:'통합인증·계정·SSO', aliases:['인증센터','통합인증','인증','auth','로그인'] },
    { domain:'church.ekodi.kr', name:'에코디교회', group:'Community', role:'예배·사역·공동체 운영', aliases:['에코디교회','교회','church'] },
    { domain:'community.ekodi.kr', name:'에코디커뮤니티', group:'Community', role:'관계·그룹·참여·소통', aliases:['에코디커뮤니티','커뮤니티','community'] },
    { domain:'social.ekodi.kr', name:'EKODI Social', group:'Community', role:'소셜채널·미디어 연동', aliases:['에코디소셜','소셜','social'] },
    { domain:'biz.ekodi.kr', name:'에코디비즈', group:'Business & Commerce', role:'사업·고객·서비스 운영', aliases:['에코디비즈','비즈','biz'] },
    { domain:'mall.ekodi.kr', name:'에코디몰', group:'Business & Commerce', role:'상품·판매·셀러 운영', aliases:['에코디몰','몰','mall'] },
    { domain:'marketing.ekodi.kr', name:'Marketing AI', group:'Business & Commerce', role:'마케팅·자동화·Workspace', aliases:['마케팅ai','마케팅 ai','마케팅','marketing ai','marketing'] },
    { domain:'trade.ekodi.kr', name:'EKODI Trading', group:'Business & Commerce', role:'무역·견적·계약·거래', aliases:['트레이딩','무역','trading','trade'] },
    { domain:'pay.ekodi.kr', name:'EKODI Pay', group:'Business & Commerce', role:'결제·정산·귀속', aliases:['에코디페이','결제','pay'] },
    { domain:'books.ekodi.kr', name:'에코디북스', group:'Knowledge & Content', role:'출판·배포·인세·콘텐츠', aliases:['에코디북스','북스','출판','books','book'] },
    { domain:'lab.ekodi.kr', name:'에코디연구소', group:'Knowledge & Content', role:'연구·교육·프로젝트', aliases:['에코디연구소','연구소','lab'] },
    { domain:'mail.ekodi.kr', name:'EKODI Mail', group:'Communication & Cloud', role:'메일 허브·조직 연결', aliases:['에코디메일','메일','mail'] },
    { domain:'live.ekodi.kr', name:'EKODI Live', group:'Communication & Cloud', role:'라이브·방송·송출', aliases:['에코디라이브','라이브','live'] },
    { domain:'cloud.ekodi.kr', name:'EKODI Cloud', group:'Communication & Cloud', role:'파일·문서·협업 자료', aliases:['에코디클라우드','클라우드','cloud'] },
    { domain:'cgma.ekodi.kr', name:'청계면상인회', group:'Client Sites', role:'상권·회원·고객 운영', aliases:['청계면상인회','청계상권','상인회','cgma'] },
    { domain:'jadam.ekodi.kr', name:'자담치킨 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', aliases:['자담치킨','자담','jadam'] },
    { domain:'pizzamaru.ekodi.kr', name:'피자마루 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', aliases:['피자마루','pizzamaru'] },
    { domain:'yogurt.ekodi.kr', name:'요거트퍼플 목포대점', group:'Client Sites', role:'점포·CRM·마케팅 운영', aliases:['요거트퍼플','요거트','yogurt'] },
  ];

  const DECISION_RULES = [
    { label:'가격·요금제·결제정책', topic:/(가격|요금제|요금|결제정책|수수료|구독료|판매가)/i },
    { label:'관리자·개인정보 권한', topic:/(관리자\s*권한|권한\s*(추가|삭제|변경|부여|해제)|개인정보|privacy)/i },
    { label:'파괴적 데이터 변경', topic:/(데이터\s*(삭제|대량|초기화)|db\s*(삭제|초기화)|테이블\s*(삭제|drop)|전체\s*삭제)/i },
    { label:'핵심 도메인·DNS·서비스 종료', topic:/(dns|도메인\s*(이전|변경|삭제)|서비스\s*(종료|폐쇄)|사이트\s*(종료|폐쇄))/i },
    { label:'외부 비용·계약·법적 책임', topic:/(계약|비용\s*(발생|지불|결제)|법적|위약|외부\s*구매)/i },
  ];
  const MUTATION_RE = /(바꿔|변경|수정|삭제|지워|추가|부여|해제|초기화|전환|중지|종료|폐쇄|적용|올려|내려|설정해|실행해|처리해|고쳐|복구해|fix|repair|change|delete|remove|update)/i;
  const SECRET_RE = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{20,}|akia[0-9a-z]{16}|-----begin [a-z ]+private key-----|\beyj[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b|(?:password|passwd|비밀번호)\s*[:=]\s*\S+)/i;

  let chatBusy = false;
  let latestOverview = null;
  let state = loadChatState();

  function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  function authHeaders(json = false) {
    const headers = token() ? { authorization:`Bearer ${token()}` } : {};
    if (json) headers['content-type'] = 'application/json';
    return headers;
  }
  function uid() {
    try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }
  function now() { return new Date().toISOString(); }
  function normalize(text) { return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function safeDomain(value) { return SITE_META.some(site => site.domain === value) ? value : 'all'; }

  function loadChatState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(CHAT_STATE_KEY) || '{}');
      return {
        threadId:String(parsed.threadId || uid()),
        scope:safeDomain(parsed.scope || 'all'),
        lastDomain:safeDomain(parsed.lastDomain || 'all'),
        messages:Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_MESSAGES) : [],
      };
    } catch {
      return { threadId:uid(), scope:'all', lastDomain:'all', messages:[] };
    }
  }
  function saveChatState() {
    state.messages = state.messages.slice(-MAX_MESSAGES);
    try { sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify(state)); } catch {}
  }

  function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    });
  }

  function installChatStyles() {
    if (document.querySelector('#ekodiChiefChatStyles')) return;
    const style = document.createElement('style');
    style.id = 'ekodiChiefChatStyles';
    style.textContent = `
      .ai-chief-chat{border:1px solid rgba(94,135,177,.32);background:rgba(6,22,38,.82);border-radius:16px;overflow:hidden}
      .ai-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border-bottom:1px solid rgba(94,135,177,.2);background:rgba(10,33,54,.72)}
      .ai-chat-head h3{margin:2px 0 0;font-size:16px}.ai-chat-head small{color:#7794af;font-size:9px;font-weight:800;letter-spacing:.08em}
      .ai-chat-head-actions{display:flex;align-items:center;gap:6px}.ai-chat-scope{min-width:150px;max-width:230px;height:30px;border:1px solid rgba(104,151,195,.34);border-radius:8px;background:#0b2943;color:#d7e6f5;padding:0 8px;font-size:10px}
      .ai-chat-new{height:30px;padding:0 9px;border:1px solid rgba(104,151,195,.3);border-radius:8px;background:#102c48;color:#b9d5ef;font-size:10px;cursor:pointer}
      .ai-chat-messages{height:360px;overflow:auto;padding:14px 13px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;background:linear-gradient(180deg,rgba(4,17,29,.56),rgba(7,25,42,.68))}
      .ai-chat-message{display:flex;gap:8px;max-width:88%}.ai-chat-message.user{align-self:flex-end;flex-direction:row-reverse}.ai-chat-avatar{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:9px;background:#12395d;border:1px solid rgba(110,169,224,.34);color:#b8d9fb;font-size:9px;font-weight:900}.ai-chat-message.user .ai-chat-avatar{background:#284057;color:#d4e1ed}
      .ai-chat-bubble{min-width:0;padding:9px 10px;border-radius:12px;background:#0d2c49;border:1px solid rgba(101,151,198,.24)}.ai-chat-message.user .ai-chat-bubble{background:#173a5b;border-color:rgba(102,161,214,.36)}
      .ai-chat-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px;color:#7893ac;font-size:8px}.ai-chat-meta b{color:#b8d5ef;font-size:9px}.ai-chat-class{padding:2px 5px;border-radius:999px;background:rgba(56,189,248,.1);color:#7dd3fc;font-weight:900}.ai-chat-class.report{background:rgba(245,158,11,.12);color:#fcd34d}.ai-chat-class.decision{background:rgba(244,63,94,.13);color:#fda4af}
      .ai-chat-text{white-space:pre-wrap;word-break:break-word;color:#d6e2ed;font-size:11px;line-height:1.55}.ai-chat-message.user .ai-chat-text{color:#edf6ff}
      .ai-chat-council{margin-top:7px;padding-top:7px;border-top:1px solid rgba(115,154,190,.16)}.ai-chat-council summary{cursor:pointer;color:#89afd2;font-size:9px}.ai-chat-council div{margin-top:6px;padding:6px 7px;border-radius:8px;background:rgba(4,18,31,.38)}.ai-chat-council strong{display:block;color:#b8d1e7;font-size:9px}.ai-chat-council span{display:block;margin-top:2px;color:#829bb2;font-size:8.5px;line-height:1.4}
      .ai-chat-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.ai-chat-action{border:1px solid rgba(100,157,209,.35);border-radius:7px;background:#102f4d;color:#a8d1f6;padding:5px 7px;font-size:8.5px;cursor:pointer}.ai-chat-action.primary{background:#1e5b91;color:#fff;border-color:#2c74ad}
      .ai-chat-typing{align-self:flex-start;color:#7592ad;font-size:10px;padding:2px 38px}.ai-chat-quick{display:flex;gap:5px;padding:8px 12px 0;overflow:auto}.ai-chat-quick button{flex:0 0 auto;border:1px solid rgba(91,139,184,.26);border-radius:999px;background:rgba(11,39,64,.72);color:#94b8d8;padding:5px 8px;font-size:8.5px;cursor:pointer}
      .ai-chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;padding:8px 12px 7px}.ai-chat-input{min-height:52px;max-height:120px;resize:vertical;border:1px solid rgba(103,153,198,.35);border-radius:10px;background:#071d31;color:#edf6ff;padding:9px 10px;font:inherit;font-size:11px;line-height:1.45;outline:none}.ai-chat-input:focus{border-color:#3f83bd;box-shadow:0 0 0 2px rgba(63,131,189,.11)}.ai-chat-send{align-self:end;height:34px;border:0;border-radius:9px;background:#2d6fa7;color:#fff;padding:0 13px;font-size:10px;font-weight:800;cursor:pointer}.ai-chat-send:disabled{opacity:.5;cursor:wait}.ai-chat-foot{display:flex;justify-content:space-between;gap:8px;padding:0 12px 10px;color:#65819a;font-size:8px}
      .ai-chat-context-card{border:1px solid rgba(94,135,177,.27);background:rgba(7,22,38,.72);border-radius:16px;padding:12px}.ai-chat-context-card h3{margin:2px 0 8px;font-size:14px}.ai-chat-context-row{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;padding:6px 0;border-bottom:1px solid rgba(98,136,174,.13)}.ai-chat-context-row:last-child{border-bottom:0}.ai-chat-context-row small{color:#718da7;font-size:8px}.ai-chat-context-row strong{font-size:9.5px;color:#bcd0e2;line-height:1.4}.ai-chat-context-status.good{color:#6ee7b7}.ai-chat-context-status.warn{color:#fcd34d}.ai-chat-context-status.bad{color:#fda4af}
      @media(max-width:820px){.ai-chat-head{align-items:flex-start;flex-direction:column}.ai-chat-head-actions{width:100%}.ai-chat-scope{flex:1;max-width:none}.ai-chat-messages{height:330px}.ai-chat-message{max-width:94%}}
      @media(max-width:540px){.ai-chat-form{grid-template-columns:1fr}.ai-chat-send{width:100%}.ai-chat-foot{display:block}.ai-chat-foot span{display:block;margin-top:3px}}
    `;
    document.head.appendChild(style);
  }

  function greeting() {
    return {
      id:uid(), role:'assistant', classification:'INFO', createdAt:now(),
      content:'Chief AI 운영대화가 준비되었습니다.\n\n예: “전체 상태 점검해줘”, “Marketing AI 문제 있어?”, “자담치킨 담당 AI가 누구야?”, “결정 대기사항 보여줘”처럼 말씀하시면 됩니다.',
      council:[], actions:[{ type:'review', label:'전체 점검' }],
    };
  }

  function ensureGreeting() {
    if (!state.messages.length) {
      state.messages.push(greeting());
      saveChatState();
    }
  }

  function siteByDomain(domain) { return SITE_META.find(site => site.domain === domain) || null; }
  function findExplicitSite(text) {
    const source = normalize(text);
    const candidates = [...SITE_META].sort((a, b) => {
      const aa = Math.max(a.domain.length, ...a.aliases.map(value => value.length));
      const bb = Math.max(b.domain.length, ...b.aliases.map(value => value.length));
      return bb - aa;
    });
    for (const site of candidates) {
      if (source.includes(site.domain)) return site;
      if (site.aliases.some(alias => source.includes(normalize(alias)))) return site;
    }
    return null;
  }
  function targetFor(text) {
    const explicit = findExplicitSite(text);
    if (explicit) return explicit;
    const source = normalize(text);
    if (/(거기|그\s*사이트|그곳|거기도|거긴|해당\s*사이트)/.test(source) && state.lastDomain !== 'all') return siteByDomain(state.lastDomain);
    if (state.scope !== 'all') return siteByDomain(state.scope);
    return null;
  }

  function decisionReason(text) {
    if (!MUTATION_RE.test(text)) return '';
    if (/(삭제|지워|초기화|drop)/i.test(text)) return '파괴적 데이터·설정 변경';
    const rule = DECISION_RULES.find(item => item.topic.test(text));
    return rule?.label || '';
  }

  function statusFor(site, overview = latestOverview) {
    if (!site) return null;
    const service = (overview?.services || []).find(item => String(item.domain || '').toLowerCase() === site.domain);
    if (!service) return { key:'standby', label:'연결 대기', note:'Control API 실시간 점검 레지스트리 미연결', service:null };
    if (service.state && service.state !== 'active') return { key:'standby', label:String(service.state).toUpperCase(), note:'운영상태가 active가 아님', service };
    const health = service.latest?.status || 'pending';
    if (health === 'offline') return { key:'critical', label:'장애', note:service.latest?.detail || '응답 없음', service };
    if (health === 'degraded') return { key:'attention', label:'지연', note:`HTTP ${service.latest?.httpStatus ?? '—'} · ${service.latest?.responseTime ?? '—'}ms`, service };
    if (health === 'online') return { key:'healthy', label:'정상', note:`HTTP ${service.latest?.httpStatus ?? '—'} · ${service.latest?.responseTime ?? '—'}ms`, service };
    return { key:'standby', label:'점검 전', note:'최근 상태값 없음', service };
  }

  function overviewIssues(overview = latestOverview) {
    return (overview?.services || []).filter(service => {
      if (service.state !== 'active' || !service.latest) return false;
      return ['offline','degraded'].includes(service.latest.status) || Number(service.latest.responseTime || 0) >= 1800;
    });
  }

  async function fetchOverview(force = false) {
    if (!token()) throw new Error('관리자 로그인 후 사용할 수 있습니다.');
    const response = await fetch(`${API}${force ? '/api/control/check' : '/api/control/overview'}`, {
      method:force ? 'POST' : 'GET',
      headers:authHeaders(),
      cache:'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `운영 API ${response.status}`);
    latestOverview = data;
    updateContextCard();
    return data;
  }

  function classificationClass(value) { return String(value || 'INFO').toLowerCase(); }
  function formatTime(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
  }

  function renderAction(action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ai-chat-action${action.primary ? ' primary' : ''}`;
    button.textContent = action.label || 'Action';
    button.addEventListener('click', () => handleAction(action));
    return button;
  }

  function renderMessage(message) {
    const article = document.createElement('article');
    article.className = `ai-chat-message ${message.role === 'user' ? 'user' : 'assistant'}`;
    const avatar = document.createElement('span');
    avatar.className = 'ai-chat-avatar';
    avatar.textContent = message.role === 'user' ? 'ME' : 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';
    const meta = document.createElement('div');
    meta.className = 'ai-chat-meta';
    const name = document.createElement('b');
    name.textContent = message.role === 'user' ? '관리자' : 'Chief AI';
    meta.append(name);
    if (message.role !== 'user' && message.classification) {
      const badge = document.createElement('span');
      badge.className = `ai-chat-class ${classificationClass(message.classification)}`;
      badge.textContent = message.classification;
      meta.append(badge);
    }
    const time = document.createElement('span');
    time.textContent = formatTime(message.createdAt);
    meta.append(time);
    const text = document.createElement('div');
    text.className = 'ai-chat-text';
    text.textContent = message.content || '';
    bubble.append(meta, text);

    if (Array.isArray(message.council) && message.council.length) {
      const details = document.createElement('details');
      details.className = 'ai-chat-council';
      const summary = document.createElement('summary');
      summary.textContent = `AI Council · ${message.council.length}개 관점`;
      details.append(summary);
      for (const item of message.council) {
        const row = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = item.name;
        const span = document.createElement('span');
        span.textContent = item.conclusion;
        row.append(strong, span);
        details.append(row);
      }
      bubble.append(details);
    }

    if (Array.isArray(message.actions) && message.actions.length) {
      const actions = document.createElement('div');
      actions.className = 'ai-chat-actions';
      message.actions.forEach(action => actions.append(renderAction(action)));
      bubble.append(actions);
    }
    article.append(avatar, bubble);
    return article;
  }

  function renderMessages() {
    const host = document.querySelector('#aiChiefChatMessages');
    if (!host) return;
    host.replaceChildren(...state.messages.map(renderMessage));
    if (chatBusy) {
      const typing = document.createElement('div');
      typing.className = 'ai-chat-typing';
      typing.textContent = 'Chief AI가 Site AI와 운영상태를 확인 중…';
      host.append(typing);
    }
    requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
  }

  function updateContextCard() {
    const root = document.querySelector('#aiChiefChatContext');
    if (!root) return;
    const site = state.scope !== 'all' ? siteByDomain(state.scope) : (state.lastDomain !== 'all' ? siteByDomain(state.lastDomain) : null);
    const status = site ? statusFor(site) : null;
    const issues = overviewIssues();
    const rows = [
      ['대화 범위', site ? site.name : '전체 EKODI'],
      ['담당', site ? `${site.name} Site AI` : 'Chief AI · 전체 Site AI'],
      ['현재 상태', status ? `${status.label} · ${status.note}` : latestOverview ? `정상 ${latestOverview.summary?.online ?? 0} · 확인필요 ${Number(latestOverview.summary?.degraded || 0) + Number(latestOverview.summary?.offline || 0)}` : '운영정보 대기'],
      ['Council', issues.length ? `${issues.length}개 상태 관찰` : '현재 즉시 안건 없음'],
      ['실행 경계', '조회·점검 자동 / 중요변경 Decision Gate'],
    ];
    root.replaceChildren();
    const head = document.createElement('div');
    const small = document.createElement('small'); small.textContent = 'CURRENT CONTEXT';
    const h3 = document.createElement('h3'); h3.textContent = 'Chief AI Context';
    head.append(small, h3); root.append(head);
    rows.forEach(([label, value], index) => {
      const row = document.createElement('div'); row.className = 'ai-chat-context-row';
      const l = document.createElement('small'); l.textContent = label;
      const v = document.createElement('strong'); v.textContent = value;
      if (index === 2 && status) v.className = `ai-chat-context-status ${status.key === 'healthy' ? 'good' : status.key === 'critical' ? 'bad' : 'warn'}`;
      row.append(l, v); root.append(row);
    });
  }

  function appendMessage(message) {
    state.messages.push({ id:uid(), createdAt:now(), council:[], actions:[], ...message });
    state.messages = state.messages.slice(-MAX_MESSAGES);
    saveChatState();
    renderMessages();
  }

  function councilFor(site, status, text, classification) {
    const items = [];
    if (site) {
      items.push({ name:`${site.name} Site AI`, conclusion:status ? `${status.label}. ${status.note}` : `${site.role} 범위에서 요청을 검토합니다.` });
    } else {
      items.push({ name:'Chief AI', conclusion:'전체 Site AI 상태를 모아 우선순위와 영향범위를 판단합니다.' });
    }
    if (/(로그인|인증|권한|보안|token|토큰|auth)/i.test(text) || site?.domain === 'auth.ekodi.kr') items.push({ name:'Security AI', conclusion:'인증·권한·토큰 노출 여부를 우선 확인하고 비밀정보를 브라우저에 남기지 않는 경계를 적용합니다.' });
    if (/(결제|요금|가격|정산|회계|pay|finance)/i.test(text) || site?.domain === 'pay.ekodi.kr') items.push({ name:'Finance AI', conclusion:'결제·정산·비용 영향은 별도 검토하며 정책 변경은 Decision Gate를 거칩니다.' });
    if (classification !== 'INFO' || status?.key === 'critical' || /(배포|수정|고쳐|복구|장애|오류)/i.test(text)) items.push({ name:'Release AI', conclusion:'수정이 필요하면 staging → CI → guarded release → 실제 도메인 검증 순서를 유지합니다.' });
    items.push({ name:'Platform AI', conclusion:'API·네트워크·공통 인프라와 서비스 상태를 함께 비교합니다.' });
    return items.slice(0, 4);
  }

  function actionSet(site, { includeReview = true, includeDecision = false } = {}) {
    const actions = [];
    if (includeReview) actions.push({ type:'review', label:'Council Review', primary:true });
    if (site) {
      actions.push({ type:'manage', domain:site.domain, label:'Manage' });
      actions.push({ type:'open', domain:site.domain, label:'Open ↗' });
      actions.push({ type:'scope', domain:site.domain, label:'이 사이트로 대화' });
    }
    if (includeDecision) actions.push({ type:'decision', label:'Decision Gate', primary:true });
    return actions;
  }

  function statusSummary(overview) {
    const total = overview?.summary?.total ?? 0;
    const online = overview?.summary?.online ?? 0;
    const degraded = overview?.summary?.degraded ?? 0;
    const offline = overview?.summary?.offline ?? 0;
    const issues = overviewIssues(overview);
    let text = `현재 자동점검 대상 ${total}개 중 정상 ${online}, 지연 ${degraded}, 장애 ${offline}입니다.`;
    if (issues.length) text += `\n\n확인이 필요한 항목: ${issues.slice(0, 6).map(item => `${item.name}(${item.domain})`).join(', ')}`;
    else text += '\n\n현재 실측 기준 즉시 대응이 필요한 장애는 보이지 않습니다.';
    return text;
  }

  async function createReply(input) {
    const text = normalize(input);
    const site = targetFor(input);
    if (site) state.lastDomain = site.domain;
    const risk = decisionReason(input);
    const asksDecision = /(결정\s*대기|승인\s*대기|decision\s*gate|결정사항|승인사항)/i.test(text);
    const asksCouncil = /(회의|협업|누가\s*담당|담당\s*ai|council|어떤\s*ai|담당이)/i.test(text);
    const asksOpen = /(사이트\s*열|열어\s*줘|접속|바로가기|open)/i.test(text);
    const asksManage = /(관리\s*열|관리메뉴|관리\s*페이지|manage)/i.test(text);
    const asksFix = /(고쳐|복구|해결|수정해|처리해|fix|repair)/i.test(text);
    const asksProblems = /(문제\s*있는|이상\s*있는|장애\s*있는|문제\s*뭐|이상해|안\s*열|오류|에러)/i.test(text);
    const asksCheck = /(점검|체크|상태|확인|health|느려|응답|정상)/i.test(text) || asksProblems;
    const asksAll = /(전체|모두|생태계|all)/i.test(text) && !site;
    const greetingOnly = /^(안녕|안녕하세요|하이|hello|hi|반가워)[.!?\s]*$/i.test(text);

    if (risk) {
      let overview = latestOverview;
      try { overview = await fetchOverview(false); } catch {}
      const status = site ? statusFor(site, overview) : null;
      return {
        role:'assistant', classification:'DECISION',
        content:`이 요청은 “${risk}” 범주라 자동 실행하지 않습니다.${site ? `\n\n대상: ${site.name} · ${site.domain}${status ? `\n현재 상태: ${status.label} · ${status.note}` : ''}` : ''}\n\nChief AI 권고: 영향범위와 되돌리기 방법을 먼저 확정한 뒤 Decision Gate에서 승인하도록 하겠습니다.`,
        council:councilFor(site, status, input, 'DECISION'),
        actions:actionSet(site, { includeReview:true, includeDecision:true }),
      };
    }

    if (greetingOnly) {
      return {
        role:'assistant', classification:'INFO',
        content:'네. 여기서는 EKODI 운영에 대해 대화로 확인하고 안전한 점검을 실행할 수 있습니다. 사이트 이름을 말한 뒤 “상태 확인”, “문제 봐줘”, “관리 열어줘”처럼 말씀하시면 문맥을 이어갑니다.',
        council:[], actions:[{ type:'prompt', prompt:'전체 상태 점검해줘', label:'전체 상태 보기', primary:true }],
      };
    }

    if (asksDecision) {
      let overview = latestOverview;
      try { overview = await fetchOverview(false); } catch {}
      const issues = overviewIssues(overview);
      const critical = issues.filter(item => ['admin.ekodi.kr','auth.ekodi.kr','pay.ekodi.kr','api.ekodi.kr'].includes(item.domain));
      return {
        role:'assistant', classification:critical.length ? 'DECISION' : 'INFO',
        content:critical.length
          ? `현재 핵심 서비스에서 대표 판단 가능성이 있는 항목 ${critical.length}개가 보입니다: ${critical.map(item => item.name).join(', ')}. Decision Gate에서 영향범위를 확인해 주세요.`
          : '현재 실측 상태만으로 즉시 대표 승인이 필요한 새 결정사항은 보이지 않습니다. 가격·권한·파괴적 데이터·핵심 DNS·외부 계약 관련 변경은 언제나 Decision Gate 대상입니다.',
        council:councilFor(site, site ? statusFor(site, overview) : null, input, critical.length ? 'DECISION' : 'INFO'),
        actions:[{ type:'decision', label:'Decision Gate', primary:true }, { type:'review', label:'상태 다시 점검' }],
      };
    }

    if (asksCouncil) {
      let overview = latestOverview;
      try { overview = await fetchOverview(false); } catch {}
      const status = site ? statusFor(site, overview) : null;
      const council = councilFor(site, status, input, 'INFO');
      return {
        role:'assistant', classification:'INFO',
        content:site
          ? `${site.name}은 ${site.name} Site AI가 1차 책임을 맡습니다. 이 요청의 성격에 따라 Chief AI가 Platform·Security·Release·Finance AI를 붙여 교차검토합니다.`
          : 'Chief AI가 전체 Site AI를 조정하고, Platform AI·Security AI·Release AI·Finance AI가 전문 관점으로 교차검토합니다. 한 AI의 판단만으로 중요한 변경을 확정하지 않습니다.',
        council, actions:actionSet(site, { includeReview:false }),
      };
    }

    if (asksOpen || asksManage) {
      if (!site) {
        return { role:'assistant', classification:'INFO', content:'어느 사이트인지 함께 말씀해 주세요. 예: “Marketing AI 관리 열어줘”, “에코디북스 사이트 열어줘”.', council:[], actions:[] };
      }
      let overview = latestOverview;
      try { overview = await fetchOverview(false); } catch {}
      const status = statusFor(site, overview);
      return {
        role:'assistant', classification:'INFO',
        content:`${site.name}을 선택했습니다. ${status ? `현재 상태는 ${status.label}이며 ${status.note}입니다.` : ''}\n아래 버튼으로 관리 화면 또는 공개 사이트를 열 수 있습니다.`,
        council:councilFor(site, status, input, 'INFO'),
        actions:actionSet(site, { includeReview:false }),
      };
    }

    if (asksCheck || asksAll) {
      const force = /(전체\s*(즉시\s*)?점검|다시\s*점검|지금\s*점검|실시간\s*점검|run\s*check)/i.test(text) || (asksAll && /점검/.test(text));
      const overview = await fetchOverview(force);
      if (site) {
        const status = statusFor(site, overview);
        const service = status?.service;
        let content = `${site.name} · ${site.domain}\n현재 상태: ${status?.label || '확인 대기'}${status?.note ? ` · ${status.note}` : ''}`;
        if (service?.stats24h) content += `\n24시간 가용률: ${service.stats24h.availabilityPercent ?? '—'}% · 평균응답 ${service.stats24h.averageResponseTime ?? '—'}ms`;
        if (!service) content += '\n\n이 사이트는 AI Ops에는 등록되어 있지만 Control API 실시간 점검 레지스트리에는 아직 직접 연결되지 않았습니다. 상태판에서는 “연결 대기”로 표시합니다.';
        return {
          role:'assistant', classification:status?.key === 'critical' && ['admin.ekodi.kr','auth.ekodi.kr','pay.ekodi.kr'].includes(site.domain) ? 'DECISION' : status?.key === 'critical' || status?.key === 'attention' ? 'REPORT' : 'INFO',
          content,
          council:councilFor(site, status, input, status?.key === 'healthy' ? 'INFO' : 'REPORT'),
          actions:actionSet(site, { includeReview:!force, includeDecision:status?.key === 'critical' && ['admin.ekodi.kr','auth.ekodi.kr','pay.ekodi.kr'].includes(site.domain) }),
        };
      }
      const issues = overviewIssues(overview);
      return {
        role:'assistant', classification:issues.length ? 'REPORT' : 'INFO',
        content:statusSummary(overview),
        council:councilFor(null, null, input, issues.length ? 'REPORT' : 'INFO'),
        actions:[{ type:'review', label:force ? '다시 점검' : 'Council Review', primary:!force }, ...(issues.length ? [{ type:'prompt', prompt:'문제 있는 사이트를 우선순위로 정리해줘', label:'문제 우선순위' }] : [])],
      };
    }

    if (asksFix) {
      let overview = latestOverview;
      try { overview = await fetchOverview(false); } catch {}
      const status = site ? statusFor(site, overview) : null;
      if (!site) {
        const issues = overviewIssues(overview);
        return {
          role:'assistant', classification:'REPORT',
          content:issues.length
            ? `현재 먼저 다룰 후보는 ${issues.slice(0, 5).map(item => item.name).join(', ')}입니다. 한 사이트를 지정하면 해당 Site AI 기준으로 진단 순서를 좁히겠습니다.`
            : '현재 상태판에서 뚜렷한 장애는 보이지 않습니다. 수정부터 시작하기보다 증상을 특정한 뒤 재현 → 영향분석 → staging → 검증 순서로 진행하는 것이 안전합니다.',
          council:councilFor(null, null, input, 'REPORT'), actions:[{ type:'review', label:'전체 점검', primary:true }],
        };
      }
      const content = status?.key === 'healthy'
        ? `${site.name}은 현재 실측상 정상입니다. 증상이 있다면 바로 코드를 바꾸기보다 먼저 재현 조건을 확인하는 것이 안전합니다.\n\n권장 순서: ① 증상 재현 ② 최근 배포·인증·공통 API 영향 확인 ③ 필요한 경우 staging 수정 ④ CI·회귀검사 ⑤ guarded release 후 실제 도메인 검증.`
        : `${site.name}은 현재 ${status?.label || '확인 필요'} 상태입니다.\n\n권장 복구 순서: ① 즉시 재점검 ② 배포·인증·네트워크 원인 분리 ③ 되돌릴 수 있는 staging 수정 ④ 자동검증 ⑤ 운영 승격 또는 롤백. 파괴적 변경이 필요해지면 Decision Gate에서 멈춥니다.`;
      return {
        role:'assistant', classification:'REPORT', content,
        council:councilFor(site, status, input, 'REPORT'), actions:actionSet(site, { includeReview:true }),
      };
    }

    let overview = latestOverview;
    try { overview = await fetchOverview(false); } catch {}
    const status = site ? statusFor(site, overview) : null;
    if (site) {
      return {
        role:'assistant', classification:'INFO',
        content:`${site.name}을 현재 대화 대상으로 이해했습니다. 담당은 ${site.name} Site AI이고, 책임 범위는 “${site.role}”입니다.${status ? `\n현재 상태판: ${status.label} · ${status.note}` : ''}\n\n상태 확인, 문제 진단, 관리 화면 이동, Council 협업, Decision Gate 확인 중 원하는 방향을 말씀해 주세요.`,
        council:councilFor(site, status, input, 'INFO'), actions:actionSet(site, { includeReview:false }),
      };
    }
    return {
      role:'assistant', classification:'INFO',
      content:`운영 요청으로 이해했습니다. ${overview ? statusSummary(overview) : '운영 API 연결상태를 먼저 확인할 수 있습니다.'}\n\n사이트 이름과 함께 “상태 확인”, “문제 봐줘”, “관리 열어줘”, “복구 순서 알려줘”처럼 말씀하시면 해당 Site AI 문맥으로 이어서 처리합니다.`,
      council:[], actions:[{ type:'prompt', prompt:'전체 상태 점검해줘', label:'전체 상태 점검', primary:true }],
    };
  }

  async function sendPrompt(raw) {
    if (chatBusy) return;
    const input = String(raw || '').trim();
    if (!input) return;
    const textarea = document.querySelector('#aiChiefChatInput');
    if (SECRET_RE.test(input)) {
      if (textarea) textarea.value = '';
      appendMessage({ role:'assistant', classification:'DECISION', content:'비밀번호·API 키·토큰처럼 보이는 값은 운영대화에 입력하거나 저장하지 않습니다. 해당 비밀값을 제거한 뒤 요청 내용만 다시 말씀해 주세요.', council:[{ name:'Security AI', conclusion:'비밀정보를 대화기록·브라우저 저장소·URL에 남기지 않는 원칙을 적용했습니다.' }], actions:[] });
      return;
    }
    appendMessage({ role:'user', content:input, classification:'', council:[], actions:[] });
    if (textarea) textarea.value = '';
    chatBusy = true;
    renderMessages();
    const send = document.querySelector('#aiChiefChatSend');
    if (send) send.disabled = true;
    try {
      const reply = await createReply(input);
      appendMessage(reply);
    } catch (error) {
      appendMessage({ role:'assistant', classification:'REPORT', content:`운영정보를 확인하는 중 문제가 발생했습니다: ${error.message || '연결 오류'}\n\n기존 관리기능은 그대로 사용할 수 있으며, 잠시 후 다시 점검할 수 있습니다.`, council:[{ name:'Platform AI', conclusion:'Control API 연결과 관리자 인증 세션을 확인해야 합니다.' }], actions:[{ type:'review', label:'다시 점검', primary:true }] });
    } finally {
      chatBusy = false;
      if (send) send.disabled = false;
      renderMessages();
      updateContextCard();
    }
  }

  function setScope(domain) {
    state.scope = safeDomain(domain);
    if (state.scope !== 'all') state.lastDomain = state.scope;
    saveChatState();
    const select = document.querySelector('#aiChiefChatScope');
    if (select && select.value !== state.scope) select.value = state.scope;
    updateContextCard();
  }

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'prompt') return sendPrompt(action.prompt || action.label);
    if (action.type === 'scope') return setScope(action.domain);
    if (action.type === 'open' && action.domain) return window.open(`https://${action.domain}`, '_blank', 'noopener');
    if (action.type === 'decision') return document.querySelector('#aiDecisionBlock')?.scrollIntoView({ behavior:'smooth', block:'center' });
    if (action.type === 'review') return sendPrompt('전체 즉시 점검해줘');
    if (action.type === 'manage' && action.domain) {
      const selector = `.campus-site-item[data-site-domain="${action.domain}"] [data-campus-action="manage"]`;
      const manage = document.querySelector(selector);
      if (manage) return manage.click();
      const site = siteByDomain(action.domain);
      const fallback = site ? document.querySelector(`.sidebar [data-section="services"], .sidebar [data-lazy-section="services"]`) : null;
      fallback?.click();
    }
  }

  function resetChat() {
    state = { threadId:uid(), scope:'all', lastDomain:'all', messages:[greeting()] };
    latestOverview = null;
    saveChatState();
    const scope = document.querySelector('#aiChiefChatScope');
    if (scope) scope.value = 'all';
    renderMessages();
    updateContextCard();
  }

  function installChiefChat() {
    const panel = document.querySelector('#aiOpsPanel');
    if (!panel || panel.dataset.chiefChatReady === 'true') return false;
    const main = panel.querySelector('.ai-ops-main');
    const side = panel.querySelector('.ai-ops-side');
    if (!main || !side) return false;
    installChatStyles();
    ensureGreeting();

    const section = document.createElement('section');
    section.className = 'ai-chief-chat';
    section.id = 'aiChiefChat';
    section.innerHTML = `
      <div class="ai-chat-head">
        <div><small>CHIEF AI CONVERSATION</small><h3>운영 대화</h3></div>
        <div class="ai-chat-head-actions"><select class="ai-chat-scope" id="aiChiefChatScope" aria-label="대화 사이트 범위"></select><button class="ai-chat-new" id="aiChiefChatNew" type="button">+ 새 대화</button></div>
      </div>
      <div class="ai-chat-messages" id="aiChiefChatMessages" aria-live="polite"></div>
      <div class="ai-chat-quick" id="aiChiefChatQuick"></div>
      <form class="ai-chat-form" id="aiChiefChatForm"><textarea class="ai-chat-input" id="aiChiefChatInput" maxlength="${MAX_INPUT}" placeholder="예: Marketing AI 로그인 상태와 최근 문제를 확인해줘" aria-label="Chief AI에게 운영 요청"></textarea><button class="ai-chat-send" id="aiChiefChatSend" type="submit">Send</button></form>
      <div class="ai-chat-foot"><span>Enter 전송 · Shift+Enter 줄바꿈</span><span>Guarded Control · 조회/점검 자동 · 중요변경은 승인</span></div>
    `;
    main.insertBefore(section, main.firstChild);

    const context = document.createElement('section');
    context.className = 'ai-chat-context-card';
    context.id = 'aiChiefChatContext';
    side.insertBefore(context, side.firstChild);

    const select = section.querySelector('#aiChiefChatScope');
    const all = document.createElement('option'); all.value = 'all'; all.textContent = '전체 EKODI'; select.append(all);
    SITE_META.forEach(site => {
      const option = document.createElement('option'); option.value = site.domain; option.textContent = `${site.name} · ${site.domain}`; select.append(option);
    });
    select.value = state.scope;
    select.addEventListener('change', () => setScope(select.value));

    const quick = section.querySelector('#aiChiefChatQuick');
    [
      ['전체 상태','전체 상태 점검해줘'],
      ['문제 사이트','문제 있는 사이트 알려줘'],
      ['Marketing AI','Marketing AI 상태 확인해줘'],
      ['결정 대기','결정 대기사항 보여줘'],
    ].forEach(([label, prompt]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => sendPrompt(prompt)); quick.append(button);
    });

    section.querySelector('#aiChiefChatForm').addEventListener('submit', event => {
      event.preventDefault();
      sendPrompt(section.querySelector('#aiChiefChatInput').value);
    });
    section.querySelector('#aiChiefChatInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); section.querySelector('#aiChiefChatForm').requestSubmit(); }
    });
    section.querySelector('#aiChiefChatNew').addEventListener('click', resetChat);

    const headActions = panel.querySelector('.ai-ops-head-actions');
    if (headActions && !headActions.querySelector('[data-chief-chat-focus]')) {
      const focus = document.createElement('button');
      focus.type = 'button'; focus.className = 'secondary'; focus.dataset.chiefChatFocus = 'true'; focus.textContent = 'Chat';
      focus.addEventListener('click', () => section.scrollIntoView({ behavior:'smooth', block:'start' }));
      headActions.prepend(focus);
    }

    panel.dataset.chiefChatReady = 'true';
    renderMessages();
    updateContextCard();
    fetchOverview(false).catch(() => updateContextCard());
    return true;
  }

  async function loadFeatures() {
    styles.forEach(loadStyle);
    for (const src of scripts) await loadScript(src);
    installChiefChat();
    document.documentElement.dataset.ekodiAdminFeatures = 'ready';
  }

  function schedule() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadFeatures(), { timeout:1800 });
    } else {
      window.setTimeout(loadFeatures, 250);
    }
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('#aiOpsPanel')) installChiefChat();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once:true });
})();
