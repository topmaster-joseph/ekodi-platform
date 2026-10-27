// EKODI Search Visibility Center — first-party, read-only discovery operations.
// Policy: verified public inventory only; no indexing/ranking claims without provider data.
// All external ownership/API actions require authorized provider connection.
(() => {
  'use strict';
  const SECTION = 'search-visibility';
  if (document.getElementById('ekodiSearchVisibility')) return;
  const content = document.querySelector('#app .content');
  if (!content) return;
  const root = document.createElement('section');
  root.id = 'ekodiSearchVisibility';
  root.className = 'section search-visibility hidden-panel';
  root.dataset.panel = SECTION;
  root.hidden = true;
  root.innerHTML = `
    <style>
    .search-visibility{color:#172033}.search-visibility .sv-intro{max-width:820px;color:#526176;line-height:1.7}
    .search-visibility .sv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
    .search-visibility .sv-cards article{background:#f5f8fc;border:1px solid #dbe4ef;border-radius:12px;padding:14px}
    .search-visibility .sv-cards strong{font-size:22px;display:block;color:#123d6b}.search-visibility .sv-cards small{color:#63728a}
    .search-visibility .sv-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:20px 0 12px}
    .search-visibility button,.search-visibility select{min-height:38px}.search-visibility button{cursor:pointer}
    .search-visibility .sv-status{color:#485b72;font-size:13px;line-height:1.6;min-height:22px}
    .search-visibility .sv-status[data-error="true"]{color:#a82424}
    .search-visibility .sv-table{width:100%;border-collapse:collapse;font-size:13px}
    .search-visibility .sv-table th,.search-visibility .sv-table td{padding:10px;border-bottom:1px solid #e4eaf0;text-align:left;vertical-align:middle}
    .search-visibility .sv-table th{background:#f6f8fb;font-weight:750}
    .search-visibility .sv-table a{word-break:break-all}
    .search-visibility .sv-scroll{overflow-x:auto}
    .search-visibility .sv-chip{display:inline-block;border-radius:6px;background:#edf2f8;color:#41556d;padding:3px 7px}
    .search-visibility .sv-channels{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
    .search-visibility .sv-channels article{border:1px solid #dbe4ef;border-radius:12px;padding:14px}
    .search-visibility .sv-channels article p{color:#5a6b81;font-size:13px;line-height:1.65}
    .search-visibility .sv-channels a{display:inline-block;margin-top:8px;font-size:13px}
    .search-visibility .sv-guide{padding:15px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;line-height:1.7}
    @media(max-width:760px){.search-visibility .sv-table{min-width:680px}.search-visibility .sv-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style>
    <header class="section-head"><div><p class="kicker">EKODI GROWTH OS · SEARCH DISCOVERY</p>
      <h2>통합 검색노출·홍보 관리</h2>
      <p class="sv-intro">SEO(검색) · AEO(답변) · GEO(생성형 AI 발견)를 공개된 사이트별로 관리합니다. 자동 점검은 검색 노출·등록 확정이 아닌 기술적 준비 상태만 보여줍니다.</p></div></header>
    <div class="sv-cards" aria-label="공개 사이트 현황">
      <article><small>공개 사이트</small><strong data-sv-sites>—</strong></article>
      <article><small>공개 URL</small><strong data-sv-pages>—</strong></article>
      <article><small>이번 화면에서 점검됨</small><strong data-sv-audited>0</strong></article>
      <article><small>발견 인프라 상태</small><strong data-sv-infra>확인 전</strong></article>
    </div>
    <h3>운영 사이트별 통합 점검</h3>
    <div class="sv-toolbar">
      <button class="secondary" type="button" data-sv-reload>공개 사이트 목록 갱신</button>
      <button class="secondary" type="button" data-sv-audit-all>전체 사이트 기술점검</button>
      <label for="sv-search">사이트 검색</label><input id="sv-search" type="search" placeholder="사이트명 또는 주소">
    </div>
    <div class="sv-status" data-sv-status role="status" aria-live="polite">관리자 인증 후 공개 사이트 목록을 불러옵니다.</div>
    <div class="sv-scroll"><table class="sv-table"><thead><tr>
      <th>운영 사이트</th><th>주소</th><th>SEO 기본</th><th>AEO·GEO 준비</th><th>점검</th>
    </tr></thead><tbody data-sv-rows><tr><td colspan="5">목록 조회 전</td></tr></tbody></table></div>
    <h3>검색엔진 등록 · 인증 · 제출</h3>
    <p class="sv-intro">외부 업체의 소유권 승인 결과는 실제 공급자 API 연결로만 확정합니다. 현재 화면의 \"연동 확인 필요\"는 미등록을 뜻하지 않습니다.</p>
    <div class="sv-channels" data-sv-channels></div>
    <h3>사이트별 검색엔진·IndexNow·AI 검색 검토</h3>
    <p class="sv-intro">공개 사이트별 검색 공급자 상태를 확인합니다. 실제 공급자 계정·보고서 증거가 없는 상태는 미등록이나 등록완료가 아닌 '미확인'으로 표시합니다.</p>
    <div class="sv-toolbar"><label for="sv-provider-site">검토할 사이트</label><select id="sv-provider-site" aria-label="검색 서비스 검토 사이트"><option value="">목록 조회 전</option></select>
      <a href="/robots.txt" target="_blank" rel="noopener noreferrer">robots.txt</a><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">사이트맵</a>
    </div>
    <div class="sv-status" data-sv-provider-note role="status">공개 사이트 목록을 먼저 불러오세요.</div>
    <div class="sv-scroll"><table class="sv-table"><thead><tr><th>구분</th><th>서비스</th><th>등록/연동</th><th>소유권·접근</th><th>제출·인용</th><th>확인</th></tr></thead>
    <tbody data-sv-provider-rows><tr><td colspan="6">사이트를 선택하세요.</td></tr></tbody></table></div>
    <h3>최적화 운영 원칙</h3>
    <div class="sv-guide">① 공개 상태와 canonical·robots·사이트맵을 검증합니다. ② 제목·설명·구조화 데이터와 질문에 대한 직접 답변을 강화합니다.
      ③ 기관·사업자·저자·출처 표기와 최신성, 인용 가능한 근거를 정비합니다. ④ 변경된 공개 URL만 기존 IndexNow 자동 제출에 연계합니다.
      ⑤ Search Console·서치어드바이저·Bing 등 공식 근거로 실제 수집·색인·노출·유입을 확인합니다.
      <p><strong>중요:</strong> 광고 구매·유료 API 사용·검색엔진 계정 생성 및 소유권 인증은 자동 실행하지 않습니다. 비공개·회원·관리자 페이지는 검색 등록에서 제외합니다.</p>
    </div>`;
  content.append(root);
  const $ = selector => root.querySelector(selector);
  const status = (message, error = false) => {
    const node = $('[data-sv-status]');
    node.textContent = message;
    node.dataset.error = String(error);
  };
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const card = (title, description, url, label = '관리 도구 열기') => {
    const article = document.createElement('article');
    const h = document.createElement('strong'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = description;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = label;
    article.append(h, p, a); return article;
  };
  const channels = [
    ['Google Search Console','소유권 확인 · 사이트맵 제출 · 검색 성능 · 색인 조회 (연동 확인 필요)','https://search.google.com/search-console'],
    ['네이버 서치어드바이저','소유권 확인 · RSS/사이트맵 제출 · 수집 상태 (연동 확인 필요)','https://searchadvisor.naver.com/'],
    ['Daum 웹마스터도구','소유권 확인 · 검색 수집 정보 확인 (연동 확인 필요)','https://webmaster.daum.net/'],
    ['Bing Webmaster Tools','사이트 추가 · 사이트맵 · IndexNow 수신 통계 (연동 확인 필요)','https://www.bing.com/webmasters/'],
    ['추가 검색엔진','IndexNow 참여사에 변경 알림. 별도 소유권·색인 상태 확인 필요','https://www.indexnow.org/']
  ];
  for (const c of channels) $('[data-sv-channels]').append(card(...c));

  // Do not infer provider ownership, search indexing or AI citations from page accessibility.
  const SEARCH_PROVIDERS = Object.freeze([["검색엔진","네이버","https://searchadvisor.naver.com/","console","호스트 단위"],["검색엔진","구글","https://search.google.com/search-console","console","도메인/URL 속성"],["검색엔진","다음","https://register.search.daum.net/","daum","사이트 검색등록·웹마스터"],["검색엔진","빙","https://www.bing.com/webmasters/","console","웹마스터 소유권"],["IndexNow","Bing","https://www.bing.com/indexnow","indexnow","참여사"],["IndexNow","Naver","https://searchadvisor.naver.com/indexnow","indexnow","참여사"],["IndexNow","Yandex","https://yandex.com/indexnow","indexnow","참여사"],["IndexNow","Seznam.cz","https://search.seznam.cz/indexnow","indexnow","참여사"],["IndexNow","Yep","https://indexnow.yep.com/indexnow","indexnow","참여사"],["IndexNow","Amazon","https://indexnow.amazonbot.amazon/indexnow","indexnow","참여사"],["AI 검색","ChatGPT Search","https://developers.openai.com/api/docs/bots","ai","OAI-SearchBot"],["AI 검색","Google AI Overviews/AI Mode","https://search.google.com/search-console","ai","Search Console 생성형 검색 설정"],["AI 검색","Microsoft Copilot","https://www.bing.com/webmasters/","ai","Bing AI Performance"],["AI 검색","Perplexity","https://docs.perplexity.ai/","ai","검색 크롤러·인용"],["AI 검색","Claude Search","https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler","ai","Claude-SearchBot"]]);
  const state = { resources:[], sites:[], audited:new Map(), discovery:null, busy:false, selectedSite:'' };
  function renderProviderMatrix(){
    const site=state.sites.find(item=>item.url===state.selectedSite);
    const target=$('[data-sv-provider-rows]');target.replaceChildren();
    if(!site){$('[data-sv-provider-note]').textContent='사이트를 선택하세요.';return;}
    const host=new URL(site.url).hostname;
    $('[data-sv-provider-note]').textContent=(site.name||'사이트')+' · '+host+' — 하위 경로별 기술 진단과 호스트 단위 소유권 인증은 구분합니다. 외부 등록·수집·AI 인용 여부는 실제 공급자 자료가 있어야 확정됩니다.';
    for(const [group,name,url,kind,scope] of SEARCH_PROVIDERS){
      const row=document.createElement('tr');
      const texts=kind==='indexnow'
        ? [group,name,'공통 제출 연동 확인 필요','호스트 키·검증 확인 필요','제출 응답·시각 미연결']
        : kind==='ai'
          ? [group,name,'독립 사이트 등록으로 간주하지 않음',scope+' 접근 점검 필요','실제 인용 근거 미확인']
          : [group,name,'등록 여부 미확인',scope+' 확인 미연결',kind==='daum'?'신청·심사 결과 미확인':'사이트맵·색인 실적 미연결'];
      for(const str of texts){const cell=document.createElement('td');cell.textContent=str;row.append(cell);}
      const action=document.createElement('td');const link=document.createElement('a');
      link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='공식 확인';
      action.append(link);row.append(action);target.append(row);
    }
  }
  function renderProviderChoices(){
    const select=$('#sv-provider-site'), prior=state.selectedSite;select.replaceChildren();
    for(const site of state.sites){const option=document.createElement('option');option.value=site.url;option.textContent=(site.name||site.path||'사이트')+' · '+new URL(site.url).hostname;select.append(option);}
    state.selectedSite=state.sites.some(site=>site.url===prior)?prior:(state.sites[0]?.url||'');
    select.value=state.selectedSite;renderProviderMatrix();
  }

  const normalize = item => {
    try {
      const u = new URL(item.url);
      if(u.origin !== location.origin || !/^https:$/.test(u.protocol))return null;
      if(u.pathname.split('/').some(segment => ['admin','auth','api','my','preview'].includes(segment)))return null;
      return {...item, url:u.href};
    } catch {return null;}
  };
  const fetchBounded = async (url, { parse = 'text', timeout = 6500 } = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {cache:'no-store', credentials:'same-origin', signal:controller.signal});
      if (!response.ok)throw new Error('HTTP '+response.status);
      const limit = Number(response.headers.get('content-length') || 0);
      if (limit > 1_500_000)throw new Error('응답 크기 초과');
      const text = await response.text();
      if (text.length > 1_500_000)throw new Error('응답 크기 초과');
      return parse==='json'?JSON.parse(text):text;
    } finally {window.clearTimeout(timer);}
  };
  const checkDocument = html => {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const meta = name => dom.querySelector('meta[name="'+name+'"]')?.getAttribute('content')?.trim() || '';
    const title = Boolean(dom.querySelector('title')?.textContent?.trim());
    const description = Boolean(meta('description'));
    const canonical = dom.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(meta('robots'));
    const headings = Boolean(dom.querySelector('h1')?.textContent?.trim());
    const schema = Boolean(dom.querySelector('script[type="application/ld+json"]')?.textContent?.trim());
    return {title, description, canonical, noindex, headings, schema};
  };
  const siteResult = site => state.audited.get(site.url);
  function render() {
    $('[data-sv-sites]').textContent = String(state.sites.length);
    $('[data-sv-pages]').textContent = String(state.resources.length);
    $('[data-sv-audited]').textContent = String(state.audited.size);
    const target = $('[data-sv-rows]'); target.replaceChildren();
    const q = $('#sv-search').value.trim().toLowerCase();
    const sites = state.sites.filter(s => (s.name+' '+s.url).toLowerCase().includes(q));
    for(const site of sites){
      const row = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = site.name || site.path || '사이트';
      const link = document.createElement('a');link.href=site.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=site.url;
      const locationCell = document.createElement('td');locationCell.append(link);
      const result=siteResult(site);
      const basic = document.createElement('td');basic.textContent=result ? result.basic : '미점검';
      const ai = document.createElement('td');ai.textContent=result ? result.ai : '미점검';
      const action = document.createElement('td');
      const button=document.createElement('button');button.type='button';button.className='secondary';
      button.textContent='기술 점검';button.disabled=state.busy;
      button.addEventListener('click',()=>auditOne(site));
      const review=document.createElement('button');review.type='button';review.className='secondary';
      review.textContent='서비스 검토';review.addEventListener('click',()=>{
        state.selectedSite=site.url;$('#sv-provider-site').value=site.url;renderProviderMatrix();$('#sv-provider-site').scrollIntoView({block:'nearest'});
      });
      action.append(button,review);row.append(name,locationCell,basic,ai,action);target.append(row);
    }
    if(!sites.length){const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=5;cell.textContent='검색 결과가 없습니다.';row.append(cell);target.append(row);}
  }
  async function load() {
    if(!token())return status('최고관리자 로그인이 필요합니다.',true);
    status('공개 사이트 원장을 조회하고 있습니다.');
    try{
      const data = await fetchBounded('/public-registry.json', {parse:'json'});
      if(data?.policy!=='EKODI-PUBLIC-DISCOVERY-002'||!Array.isArray(data.resources))throw new Error('공개 레지스트리 형식 확인 필요');
      state.discovery=data;
      state.resources=data.resources.map(normalize).filter(Boolean);
      const byUrl=new Map();
      for(const resource of state.resources.filter(x=>x.type==='site'))byUrl.set(resource.url,resource);
      // A route-only installation still deserves visibility in the inventory.
      if(!byUrl.size)for(const resource of state.resources.filter(x=>x.type==='page'&&/^\/[^/]+\/?$/.test(x.path||'')))byUrl.set(resource.url,resource);
      state.sites=[...byUrl.values()];
      renderProviderChoices();
      const [robots,sitemap]=await Promise.allSettled([fetchBounded('/robots.txt'),fetchBounded('/sitemap.xml')]);
      const ok=robots.status==='fulfilled' && sitemap.status==='fulfilled' && sitemap.value.includes('<urlset');
      $('[data-sv-infra]').textContent=ok?'기술파일 응답':'확인 필요';
      status('공개 레지스트리 '+state.sites.length+'개 사이트 / '+state.resources.length+'개 URL. 검색엔진 등록 또는 색인 완료를 의미하지 않습니다.');
      render();
    }catch(error){status('공개 사이트 원장을 불러오지 못했습니다: '+error.message,true);$('[data-sv-infra]').textContent='확인 실패';}
  }
  async function auditOne(site,{quiet=false}={}) {
    try{
      const html=await fetchBounded(site.url);
      const result=checkDocument(html);
      const correctCanonical=Boolean(result.canonical)&&new URL(result.canonical,site.url).href.replace(/\/$/,'')===site.url.replace(/\/$/,'');
      const basic=[result.title,result.description,correctCanonical,!result.noindex].filter(Boolean).length;
      const ai=[result.headings,result.schema,result.description].filter(Boolean).length;
      state.audited.set(site.url,{basic:basic+'/4 기술항목',ai:ai+'/3 발견항목',raw:result});
      if(!quiet)status(site.name+' 기술 점검 완료. 이는 등록·검색순위·AI 인용 검증이 아닙니다.');
    }catch(error){state.audited.set(site.url,{basic:'점검 실패',ai:'근거 없음',error:error.message});if(!quiet)status(site.name+': '+error.message,true);}
    render();
  }
  async function auditAll(){
    if(state.busy||!state.sites.length)return;
    state.busy=true;render();$('[data-sv-audit-all]').disabled=true;
    let completed=0;
    // Sequential bounded requests avoid overloading EKODI or the browser.
    try{
      for(const site of state.sites) {
        if(!token())throw new Error('최고관리자 세션 종료');
        await auditOne(site,{quiet:true});
        completed++;status('전체 기술 점검: '+completed+' / '+state.sites.length);
      }
      status('전체 사이트 기술 점검 종료: '+completed+'개. 검색엔진 인증·색인·실제 홍보 성과는 각 공급자의 데이터가 필요합니다.');
    }catch(error){status('점검 중단: '+error.message,true);}
    finally{state.busy=false;$('[data-sv-audit-all]').disabled=false;render();}
  }
  $('[data-sv-reload]').addEventListener('click',load);
  $('[data-sv-audit-all]').addEventListener('click',auditAll);
  $('#sv-search').addEventListener('input',render);
  $('#sv-provider-site').addEventListener('change',event=>{state.selectedSite=event.target.value;renderProviderMatrix();});
  window.addEventListener('ekodi-admin-section-changed',event=>{
    if(event.detail?.section===SECTION&&!state.discovery)load();
  });
  window.addEventListener('ekodi-admin-ready',()=>{
    if(window.EKODIAdminPanels?.current?.()===SECTION&&!state.discovery)load();
  });
  if(window.EKODIAdminPanels?.current?.()===SECTION)queueMicrotask(load);
})();
