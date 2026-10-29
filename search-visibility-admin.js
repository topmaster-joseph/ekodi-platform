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
    .search-visibility{color:#172033;width:100%;max-width:none;min-width:0;box-sizing:border-box}.search-visibility .sv-intro{max-width:820px;color:#526176;line-height:1.7}
    .search-visibility .sv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
    .search-visibility .sv-cards article{background:#f5f8fc;border:1px solid #dbe4ef;border-radius:12px;padding:14px}
    .search-visibility .sv-cards strong{font-size:20px;display:block;color:#123d6b}.search-visibility .sv-cards small{color:#63728a}
    .search-visibility .sv-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:20px 0 12px}
    .search-visibility button,.search-visibility select{min-height:38px}.search-visibility button{cursor:pointer}
    .search-visibility .sv-status{color:#485b72;font-size:13px;line-height:1.6;min-height:22px}
    .search-visibility .sv-status[data-error="true"]{color:#a82424}
    .search-visibility .sv-table{width:100%;border-collapse:collapse;font-size:13px}
    .search-visibility .sv-table th,.search-visibility .sv-table td{padding:9px 10px;border-bottom:1px solid #e4eaf0;text-align:left;vertical-align:middle;white-space:nowrap}
    .search-visibility .sv-table th{background:#f6f8fb;font-weight:750}
    .search-visibility .sv-table a{word-break:normal}
    .search-visibility .sv-table .sv-site-name{max-width:190px;overflow:hidden;text-overflow:ellipsis;font-weight:650}
    .search-visibility .sv-table .sv-site-url{max-width:230px;overflow:hidden;text-overflow:ellipsis}
    .search-visibility .sv-table .sv-num{width:38px;color:#60738b}
    .search-visibility .sv-table .sv-category{color:#475569}
    .search-visibility .sv-table button{min-height:30px;padding:4px 12px;white-space:nowrap}
    .search-visibility .sv-count{color:#64748b;font-size:12px;white-space:nowrap}
    .search-visibility .sv-manage{margin-top:20px;border:1px solid #dbe4ef;border-radius:12px;padding:18px;background:#fff}
    .search-visibility .sv-manage[hidden]{display:none!important}
    .search-visibility .sv-manage-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
    .search-visibility .sv-manage-head h3{margin:2px 0 4px}
    .search-visibility .sv-manage-head p{margin:0;color:#64748b;font-size:12px;overflow-wrap:anywhere}
    .search-visibility .sv-manage-head small{color:#64748b}
    .search-visibility .sv-manage-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
    .search-visibility .sv-manage-summary div{background:#f6f8fb;border-radius:8px;padding:10px;min-width:0}
    .search-visibility .sv-manage-summary small{display:block;color:#64748b}
    .search-visibility .sv-manage-summary strong{display:block;margin-top:4px;font-size:13px;overflow-wrap:anywhere}
    .search-visibility .sv-channel-details{margin:16px 0}
    .search-visibility .sv-channel-details summary{cursor:pointer;font-weight:650}
    .search-visibility .sv-channel-details[open] summary{margin-bottom:12px}
    .search-visibility #sv-category-filter{max-width:175px}
    @media(max-width:760px){.search-visibility .sv-manage-summary{grid-template-columns:1fr}}
    .search-visibility .sv-scroll{overflow-x:auto}
    .search-visibility .sv-chip{display:inline-block;border-radius:6px;background:#edf2f8;color:#41556d;padding:3px 7px}
    .search-visibility .sv-channels{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
    .search-visibility .sv-channels article{border:1px solid #dbe4ef;border-radius:12px;padding:14px}
    .search-visibility .sv-channels article p{color:#5a6b81;font-size:13px;line-height:1.65}
    .search-visibility .sv-channels a{display:inline-block;margin-top:8px;font-size:13px}
    .search-visibility .sv-guide{padding:15px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;line-height:1.7}
    @media(max-width:760px){.search-visibility .sv-table{min-width:760px}.search-visibility .sv-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style>
    <header class="section-head"><div><p class="kicker">EKODI GROWTH OS · SEARCH DISCOVERY</p>
      <h2>통합 검색노출·홍보 관리</h2>
      <p class="sv-intro">사이트별 검색 준비도와 등록 확인 현황을 관리합니다. 기술 점검 결과는 실제 검색 노출을 뜻하지 않습니다.</p></div></header>
    <div class="sv-cards" aria-label="공개 사이트 현황">
      <article><small>공개 사이트</small><strong data-sv-sites>—</strong></article>
      <article><small>공개 URL</small><strong data-sv-pages>—</strong></article>
      <article><small>이번 화면에서 점검됨</small><strong data-sv-audited>0</strong></article>
      <article><small>발견 인프라 상태</small><strong data-sv-infra>확인 전</strong></article>
    </div>
    <h3>운영 사이트 목록</h3>
    <div class="sv-toolbar">
      <button class="secondary" type="button" data-sv-reload>공개 사이트 목록 갱신</button>
      <button class="secondary" type="button" data-sv-audit-all>전체 사이트 기술점검</button>
      <label for="sv-category-filter">분류</label><select id="sv-category-filter" aria-label="사이트 분류 필터"><option value="">전체 분류</option></select>
      <label for="sv-search">검색</label><input id="sv-search" type="search" placeholder="사이트명 또는 주소">
      <span class="sv-count" data-sv-count aria-live="polite"></span>
    </div>
    <div class="sv-status" data-sv-status role="status" aria-live="polite">관리자 인증 후 공개 사이트 목록을 불러옵니다.</div>
    <div class="sv-scroll"><table class="sv-table"><thead><tr>
      <th scope="col">번호</th><th scope="col">분류</th><th scope="col">사이트</th><th scope="col">주소</th><th scope="col">SEO</th><th scope="col">AEO·GEO</th><th scope="col">검색등록</th><th scope="col">관리</th>
    </tr></thead><tbody data-sv-rows><tr><td colspan="8">목록 조회 전</td></tr></tbody></table></div>
    <section class="sv-manage" data-sv-manage-panel hidden aria-label="선택한 사이트의 상세 관리">
      <div class="sv-manage-head"><div><small>사이트 상세 관리</small><h3 data-sv-manage-name>사이트를 선택하세요</h3><p data-sv-manage-path></p></div>
        <button type="button" class="secondary" data-sv-manage-close>닫기</button></div>
      <div class="sv-manage-summary">
        <div><small>SEO 기술 준비</small><strong data-sv-manage-basic>미점검</strong></div>
        <div><small>AEO·GEO 기술 준비</small><strong data-sv-manage-ai>미점검</strong></div>
        <div><small>개선 사항</small><strong data-sv-manage-improve>점검 후 표시</strong></div>
      </div>
      <div class="sv-toolbar"><button type="button" class="secondary" data-sv-manage-audit>이 사이트 기술점검</button>
        <a data-sv-manage-open target="_blank" rel="noopener noreferrer">사이트 열기</a></div>
      <details class="sv-channel-details"><summary>검색엔진 공식 관리도구</summary>
        <p class="sv-intro">외부 등록·소유권·색인 결과는 실제 공급자 근거로만 확정합니다.</p>
        <div class="sv-channels" data-sv-channels></div>
      </details>
    <h3>사이트별 검색엔진·IndexNow·AI 검색 검토</h3>
    <p class="sv-intro">공개 사이트별 검색 공급자 상태를 확인합니다. 실제 공급자 계정·보고서 증거가 없는 상태는 미등록이나 등록완료가 아닌 '미확인'으로 표시합니다.</p>
    <div class="sv-toolbar"><label for="sv-provider-site">검토할 사이트</label><select id="sv-provider-site" aria-label="검색 서비스 검토 사이트"><option value="">목록 조회 전</option></select>
      <a href="/robots.txt" target="_blank" rel="noopener noreferrer">robots.txt</a><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">사이트맵</a>
    </div>
    <div class="sv-status" data-sv-provider-note role="status">공개 사이트 목록을 먼저 불러오세요.</div>
    <div class="sv-scroll"><table class="sv-table"><thead><tr><th>구분</th><th>서비스</th><th>등록/연동</th><th>소유권·접근</th><th>제출·인용</th><th>확인</th></tr></thead>
    <tbody data-sv-provider-rows><tr><td colspan="6">사이트를 선택하세요.</td></tr></tbody></table></div>
    <div class="sv-status" data-sv-ledger-status role="status">외부 서비스 확인 원장을 조회하기 전입니다.</div>
    <div class="sv-guide" aria-label="검색 서비스 확인 근거 등록">
      <strong>서비스별 확인 근거 등록 (최고관리자 전용)</strong>
      <p>소유권 확인이나 색인 완료는 공식 계정에서 확인된 근거에 따라 직접 기록합니다. '수동 확인'은 공급자 API가 자동 검증한 상태가 아닙니다. 비밀번호, API 키, 인증 코드는 입력하지 마세요.</p>
      <form id="sv-evidence-form">
        <div class="sv-toolbar">
          <label for="sv-evidence-provider">서비스</label><select id="sv-evidence-provider" required></select>
          <label for="sv-evidence-check">항목</label><select id="sv-evidence-check">
            <option value="registration">사이트 등록</option><option value="ownership">소유권 확인</option>
            <option value="submission">제출·알림</option><option value="discovery">검색·크롤러 발견</option>
            <option value="citation">AI 인용</option>
          </select>
          <label for="sv-evidence-state">상태</label><select id="sv-evidence-state">
            <option value="unknown">미확인</option><option value="pending">확인 대기</option>
            <option value="confirmed_manually">수동 근거 확인</option><option value="needs_action">조치 필요</option>
            <option value="not_applicable">해당 없음</option>
          </select>
        </div>
        <div class="sv-toolbar">
          <label for="sv-evidence-link">근거 링크 (HTTPS)</label>
          <input id="sv-evidence-link" type="url" maxlength="500" placeholder="https://공식-관리-화면/..." style="min-width:260px;max-width:100%" />
          <label for="sv-evidence-detail">확인 내용</label>
          <input id="sv-evidence-detail" type="text" maxlength="700" placeholder="확인 일자·결과 (인증코드 제외)" style="min-width:260px;max-width:100%" />
          <button type="submit" data-sv-ledger-submit>근거 저장</button>
        </div>
      </form>
    </div>
    <details class="sv-channel-details"><summary>검색 최적화 운영 원칙</summary>
    <div class="sv-guide">① 공개 상태와 canonical·robots·사이트맵을 검증합니다. ② 제목·설명·구조화 데이터와 질문에 대한 직접 답변을 강화합니다.
      ③ 기관·사업자·저자·출처 표기와 최신성, 인용 가능한 근거를 정비합니다. ④ 변경된 공개 URL만 기존 IndexNow 자동 제출에 연계합니다.
      ⑤ Search Console·서치어드바이저·Bing 등 공식 근거로 실제 수집·색인·노출·유입을 확인합니다.
      <p><strong>중요:</strong> 광고 구매·유료 API 사용·검색엔진 계정 생성 및 소유권 인증은 자동 실행하지 않습니다. 비공개·회원·관리자 페이지는 검색 등록에서 제외합니다.</p>
    </div></details>
    </section>`;
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
  const PROVIDER_IDS=['naver','google','daum','bing','indexnow-bing','indexnow-naver',
    'indexnow-yandex','indexnow-seznam','indexnow-yep','indexnow-amazon',
    'ai-chatgpt','ai-google','ai-copilot','ai-perplexity','ai-claude'];
  const CHECK_LABELS={registration:'등록',ownership:'소유권',submission:'제출',discovery:'발견',citation:'인용'};
  const STATE_LABELS={unknown:'미확인',pending:'확인 대기',confirmed_manually:'수동 근거 확인',
    needs_action:'조치 필요',not_applicable:'해당 없음'};
  const state = { resources:[], sites:[], audited:new Map(), discovery:null, busy:false, selectedSite:'',
    ledger:null,ledgerBusy:false };
  const ledgerStatus=message=>{$('[data-sv-ledger-status]').textContent=message;};
  const evidenceFor=(id,check)=>state.ledger?.evidence?.find(x=>x.site_url===state.selectedSite
    && x.provider_id===id&&x.check_type===check);
  function providerSummary(id,checks,fallback){
    const items=checks.map(check=>({check,item:evidenceFor(id,check)})).filter(x=>x.item);
    if(!items.length)return fallback;
    return items.map(x=>CHECK_LABELS[x.check]+': '+(STATE_LABELS[x.item.state]||'미확인')+
      ' ('+(x.item.source==='manual'?'수동 기록':'공급자 확인')+', '+(x.item.observed_at||'').slice(0,10)+')').join(' / ');
  }
  async function loadLedger(){
    if(!token())return ledgerStatus('최고관리자 인증이 필요합니다.');
    try{
      const response=await fetch('/api/control/search-visibility',{headers:{authorization:'Bearer '+token()},
        cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(!data.ok||!Array.isArray(data.providers))throw new Error('원장 형식 오류');
      state.ledger=data;
      if(Array.isArray(data.sites)){
        const own=new Map(state.sites.map(site=>[site.url,site]));
        for(const site of data.sites){
          if(site.propertyType==='independent-domain'&&site.url?.startsWith('https://')){
            own.set(site.url,{...site,name:site.name+' (독립 도메인)',type:'domain-alias'});
          }
        }
        state.sites=[...own.values()];
        renderProviderChoices();renderCategories();render();
      }
      ledgerStatus('확인 근거 '+data.evidence.length+'건 · 최근 변경이력 '+data.audit.length+
        '건 · IndexNow: '+(data.indexNow?.status==='naver_submission_only'?'네이버 제출 이력 조회':'원장 확인 필요')+
        ' (제출 결과는 색인 증빙이 아닙니다)');
      renderProviderMatrix();
    }catch(error){
      state.ledger=null;ledgerStatus('서버 확인 원장을 사용할 수 없습니다: '+error.message+
        '. 수동 상태를 저장하거나 확인 완료로 표기할 수 없습니다.');
      renderProviderMatrix();
    }
  }
  function fillEvidenceForm(){
    const providerId=$('#sv-evidence-provider').value,check=$('#sv-evidence-check').value;
    const existing=evidenceFor(providerId,check);
    $('#sv-evidence-state').value=existing?.state||'unknown';
    $('#sv-evidence-link').value=existing?.evidence_url||'';
    $('#sv-evidence-detail').value=existing?.detail||'';
  }
  function setupEvidenceForm(){
    const select=$('#sv-evidence-provider');
    for(let i=0;i<SEARCH_PROVIDERS.length;i++){
      const option=document.createElement('option');option.value=PROVIDER_IDS[i];
      option.textContent=SEARCH_PROVIDERS[i][1];select.append(option);
    }
    select.addEventListener('change',fillEvidenceForm);
    $('#sv-evidence-check').addEventListener('change',fillEvidenceForm);
    $('#sv-evidence-form').addEventListener('submit',async event=>{
      event.preventDefault();
      if(state.ledgerBusy||!state.ledger||!state.selectedSite)return;
      const providerId=select.value,checkType=$('#sv-evidence-check').value;
      const payload={siteUrl:state.selectedSite,providerId,checkType,
        state:$('#sv-evidence-state').value,evidenceUrl:$('#sv-evidence-link').value.trim(),
        detail:$('#sv-evidence-detail').value.trim()};
      if(payload.state==='confirmed_manually'&&!payload.evidenceUrl&&!payload.detail)
        return ledgerStatus('수동 확인 상태에는 근거 링크나 확인 내용이 반드시 필요합니다.');
      state.ledgerBusy=true;$('[data-sv-ledger-submit]').disabled=true;
      try{
        const response=await fetch('/api/control/search-visibility',{method:'PATCH',
          headers:{'content-type':'application/json',authorization:'Bearer '+token()},
          body:JSON.stringify(payload),cache:'no-store',credentials:'same-origin'});
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.code||'HTTP '+response.status);
        await loadLedger();fillEvidenceForm();
      }catch(error){ledgerStatus('확인 근거 저장 실패: '+error.message);}
      finally{state.ledgerBusy=false;$('[data-sv-ledger-submit]').disabled=false;}
    });
  }
  function renderProviderMatrix(){
    const site=state.sites.find(item=>item.url===state.selectedSite);
    const target=$('[data-sv-provider-rows]');target.replaceChildren();
    if(!site){$('[data-sv-provider-note]').textContent='사이트를 선택하세요.';return;}
    const host=new URL(site.url).hostname;
    $('[data-sv-provider-note]').textContent=(site.name||'사이트')+' · '+host+' — 하위 경로별 기술 진단과 호스트 단위 소유권 인증은 구분합니다. 외부 등록·수집·AI 인용 여부는 실제 공급자 자료가 있어야 확정됩니다.';
    for(const [i,[group,name,url,kind,scope]] of SEARCH_PROVIDERS.entries()){
      const providerId=PROVIDER_IDS[i];
      const row=document.createElement('tr');
      const texts=kind==='indexnow'
        ? [group,name,'공통 제출 연동 확인 필요','호스트 키·검증 확인 필요','제출 응답·시각 미연결']
        : kind==='ai'
          ? [group,name,'독립 사이트 등록으로 간주하지 않음',scope+' 접근 점검 필요','실제 인용 근거 미확인']
          : [group,name,'등록 여부 미확인',scope+' 확인 미연결',kind==='daum'?'신청·심사 결과 미확인':'사이트맵·색인 실적 미연결'];
      for(const str of texts){const cell=document.createElement('td');cell.textContent=str;row.append(cell);}
      // Only authorized, saved evidence may override the unknown provider state.
      const cells=row.querySelectorAll('td');
      cells[2].textContent=providerSummary(providerId,['registration'],cells[2].textContent);
      cells[3].textContent=providerSummary(providerId,['ownership'],cells[3].textContent);
      cells[4].textContent=providerSummary(providerId,kind==='ai'?['discovery','citation']:['submission','discovery'],cells[4].textContent);
      if(kind==='indexnow'&&providerId==='indexnow-naver'){
        const submission=state.ledger?.indexNow?.sites?.find(x=>x.siteUrl===state.selectedSite);
        if(submission?.lastSubmittedAt)cells[4].textContent+=' / 네이버 자동제출 기록: '+submission.lastSubmittedAt.slice(0,10);
      }
      const action=document.createElement('td');const link=document.createElement('a');
      link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='공식 확인';
      const edit=document.createElement('button');edit.type='button';edit.className='secondary';
      edit.textContent='근거 관리';edit.disabled=!state.ledger;
      edit.addEventListener('click',()=>{
        $('#sv-evidence-provider').value=providerId;
        $('#sv-evidence-check').value=kind==='ai'?'discovery':'registration';
        fillEvidenceForm();$('#sv-evidence-form').scrollIntoView({block:'nearest'});
      });
      action.append(link,edit);row.append(action);target.append(row);
    }
  }
  function renderProviderChoices(){
    const select=$('#sv-provider-site'), prior=state.selectedSite;select.replaceChildren();
    for(const site of state.sites){const option=document.createElement('option');option.value=site.url;option.textContent=(site.name||site.path||'사이트')+' · '+new URL(site.url).hostname;select.append(option);}
    state.selectedSite=state.sites.some(site=>site.url===prior)?prior:(state.sites[0]?.url||'');
    select.value=state.selectedSite;renderProviderMatrix();fillEvidenceForm();
  }

  // A display-only categorization of canonical public routes; not an authority, membership or ownership grant.
  const CATEGORY_RULES = [
    ['교회·선교', /^(ekodichurch|ekodimission|mission|church|bible|jubilee|qtin|qt|prayer)$/],
    ['지역·단체', /^(cgma|cgmmrc|cheonggye|seonammedi|cooperative|open|local|region|hammoo)$/],
    ['교육·연구', /^(edu|education|research|ekodilab|pyeonggongmok|study|academy)$/],
    ['출판·콘텐츠', /^(books|publishing|journal|media|content|video)$/],
    ['사업·상거래', /^(ekodibiz|ekodimall|mall|cafe|trade|ekodipay|insurance|marketing|invest|shop|store|yogurt|pizza|jadam)$/],
  ];
  function siteCategory(site) {
    if (site.propertyType === 'independent-domain' || site.type === 'domain-alias') return '독립 도메인';
    const path = new URL(site.url).pathname.replace(/^\/+|\/+$/g, '').split('/')[0].toLowerCase();
    if (!path || path === 'ekodi') return '플랫폼';
    const known = CATEGORY_RULES.find(([,pattern]) => pattern.test(path));
    if (known) return known[0];
    const name = String(site.name || '');
    if (/교회|선교|성경|성서|묵상|예배|신학/.test(name)) return '교회·선교';
    if (/상인회|협동조합|주민|청계|의대|노회|시찰/.test(name)) return '지역·단체';
    if (/교육|연구|학교|독서|공부/.test(name)) return '교육·연구';
    if (/서점|출판|책|영상|저널/.test(name)) return '출판·콘텐츠';
    if (/몰|매장|사업|보험|투자|카페|유통|마케팅/.test(name)) return '사업·상거래';
    return '기타';
  }
  function renderCategories() {
    const select=$('#sv-category-filter'), current=select.value;
    const categories=[...new Set(state.sites.map(siteCategory))].sort((a,b)=>a.localeCompare(b,'ko'));
    select.replaceChildren();
    const all=document.createElement('option');all.value='';all.textContent='전체 분류';select.append(all);
    for(const category of categories){const option=document.createElement('option');option.value=category;option.textContent=category;select.append(option);}
    select.value=categories.includes(current)?current:'';
  }
  function refreshManage() {
    const panel=$('[data-sv-manage-panel]');
    if(panel.hidden)return;
    const site=state.sites.find(item=>item.url===state.selectedSite);
    if(!site){panel.hidden=true;return;}
    const crossOrigin=new URL(site.url).origin!==location.origin;
    const result=siteResult(site);
    $('[data-sv-manage-name]').textContent=(site.name||site.path||'사이트')+' · '+siteCategory(site);
    $('[data-sv-manage-path]').textContent=site.url;
    $('[data-sv-manage-basic]').textContent=crossOrigin?'별도 호스트':result?.basic||'미점검';
    $('[data-sv-manage-ai]').textContent=crossOrigin?'별도 호스트':result?.ai||'미점검';
    $('[data-sv-manage-improve]').textContent=result?.improvements?.join(' · ')||'점검 후 표시';
    const audit=$('[data-sv-manage-audit]');audit.disabled=state.busy||crossOrigin;
    audit.title=crossOrigin?'별도 호스트의 브라우저 점검은 지원하지 않습니다.':'';
    const open=$('[data-sv-manage-open]');open.href=site.url;
  }
  function openManage(site) {
    state.selectedSite=site.url;
    $('#sv-provider-site').value=site.url;
    const panel=$('[data-sv-manage-panel]');panel.hidden=false;
    renderProviderMatrix();fillEvidenceForm();refreshManage();
    panel.scrollIntoView({block:'start',behavior:'smooth'});
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
    $('[data-sv-sites]').textContent=String(state.sites.length);
    $('[data-sv-pages]').textContent=String(state.resources.length);
    $('[data-sv-audited]').textContent=String(state.audited.size);
    const target=$('[data-sv-rows]');target.replaceChildren();
    const q=$('#sv-search').value.trim().toLowerCase(), group=$('#sv-category-filter').value;
    const sites=state.sites.filter(site=>(!group||siteCategory(site)===group)&&
      ((site.name+' '+site.url).toLowerCase().includes(q)));
    $('[data-sv-count]').textContent=sites.length+' / '+state.sites.length+'개 표시';
    for(const [index,site] of sites.entries()){
      const row=document.createElement('tr');
      const num=document.createElement('td');num.textContent=String(index+1);num.className='sv-num';
      const category=document.createElement('td');category.textContent=siteCategory(site);category.className='sv-category';
      const name=document.createElement('td');name.textContent=site.name||site.path||'사이트';
      name.className='sv-site-name';name.title=name.textContent;
      const locationCell=document.createElement('td');locationCell.className='sv-site-url';
      const link=document.createElement('a');link.href=site.url;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent=new URL(site.url).host+new URL(site.url).pathname;
      link.title=site.url;locationCell.append(link);
      const result=siteResult(site), crossOrigin=new URL(site.url).origin!==location.origin;
      const basic=document.createElement('td');basic.textContent=crossOrigin?'별도 호스트':result?.basic?.split(' · ')[0]||'미점검';
      const ai=document.createElement('td');ai.textContent=crossOrigin?'별도 호스트':result?.ai?.split(' · ')[0]||'미점검';
      if(result?.improvements?.length){basic.title='우선 개선: '+result.improvements.join(' / ');ai.title=basic.title;}
      const providerCell=document.createElement('td');
      const confirmed=['naver','google','daum','bing'].filter(providerId=>state.ledger?.evidence?.some(x=>
        x.site_url===site.url&&x.provider_id===providerId&&x.check_type==='registration'
        &&x.state==='confirmed_manually')).length;
      providerCell.textContent=state.ledger?confirmed+'/4 수동 확인':'미확인';
      providerCell.title='공급자 API의 실제 등록·색인 확정 수치가 아니라 관리자가 저장한 수동 확인 근거입니다.';
      const action=document.createElement('td'),button=document.createElement('button');
      button.type='button';button.className='secondary';button.textContent='관리';
      button.setAttribute('aria-label',(site.name||site.path||'사이트')+' 상세 관리');
      button.addEventListener('click',()=>openManage(site));action.append(button);
      row.append(num,category,name,locationCell,basic,ai,providerCell,action);target.append(row);
    }
    if(!sites.length){const row=document.createElement('tr');const cell=document.createElement('td');
      cell.colSpan=8;cell.textContent='조건에 맞는 공개 사이트가 없습니다.';row.append(cell);target.append(row);}
    refreshManage();
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
      renderProviderChoices();renderCategories();
      const [robots,sitemap]=await Promise.allSettled([fetchBounded('/robots.txt'),fetchBounded('/sitemap.xml')]);
      const ok=robots.status==='fulfilled' && sitemap.status==='fulfilled' && sitemap.value.includes('<urlset');
      $('[data-sv-infra]').textContent=ok?'기술파일 응답':'확인 필요';
      status('공개 레지스트리 '+state.sites.length+'개 사이트 / '+state.resources.length+'개 URL. 검색엔진 등록 또는 색인 완료를 의미하지 않습니다.');
      render();
      await loadLedger();
    }catch(error){status('공개 사이트 원장을 불러오지 못했습니다: '+error.message,true);$('[data-sv-infra]').textContent='확인 실패';}
  }
  async function auditOne(site,{quiet=false}={}) {
    try{
      const html=await fetchBounded(site.url);
      const result=checkDocument(html);
      const correctCanonical=Boolean(result.canonical)&&new URL(result.canonical,site.url).href.replace(/\/$/,'')===site.url.replace(/\/$/,'');
      const basic=[result.title,result.description,correctCanonical,!result.noindex].filter(Boolean).length;
      const ai=[result.headings,result.schema,result.description].filter(Boolean).length;
      const improvements=[!result.title?'고유 페이지 제목 보완':null,
        !result.description?'검색 설명문 보완':null,
        !correctCanonical?'정규 URL(canonical) 정비':null,
        result.noindex?'공개페이지 noindex 설정 점검':null,
        !result.headings?'H1 제목 보완':null,
        !result.schema?'구조화 데이터 검토':null].filter(Boolean);
      state.audited.set(site.url,{
        basic:Math.round(basic/4*100)+'점 ('+basic+'/4) · 기술 준비도',
        ai:Math.round(ai/3*100)+'점 ('+ai+'/3) · 발견 준비도',
        improvements,raw:result
      });
      if(!quiet)status(site.name+' 기술 점검 완료. 우선 개선: '+(state.audited.get(site.url).improvements.join(', ')||'기본 항목 충족')+'. 이는 등록·검색순위·AI 인용 검증이 아닙니다.');
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
        if(new URL(site.url).origin!==location.origin)continue; // Never browser-fetch arbitrary independent hosts.
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
  $('#sv-category-filter').addEventListener('change',render);
  $('[data-sv-manage-close]').addEventListener('click',()=>{$('[data-sv-manage-panel]').hidden=true;});
  $('[data-sv-manage-audit]').addEventListener('click',()=>{const site=state.sites.find(s=>s.url===state.selectedSite);if(site&&new URL(site.url).origin===location.origin)auditOne(site);});
  $('#sv-provider-site').addEventListener('change',event=>{state.selectedSite=event.target.value;renderProviderMatrix();fillEvidenceForm();refreshManage();});
  setupEvidenceForm();
  window.addEventListener('ekodi-admin-section-changed',event=>{
    if(event.detail?.section===SECTION&&!state.discovery)load();
  });
  window.addEventListener('ekodi-admin-ready',()=>{
    if(window.EKODIAdminPanels?.current?.()===SECTION&&!state.discovery)load();
  });
  if(window.EKODIAdminPanels?.current?.()===SECTION)queueMicrotask(load);
})();
