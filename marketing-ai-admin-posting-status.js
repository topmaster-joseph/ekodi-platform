(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TAB_KEY = 'publications';
  const POSTING_ACTION_RE = /(post|posting|publish|publication|social|channel|콘텐츠|게시|포스팅)/i;
  const CACHE_MS = 15_000;
  const STYLE = `
    .marketing-ai-posting-panel{min-height:220px}.marketing-ai-posting-provider{display:flex;flex-direction:column;align-items:flex-end;gap:2px;padding:8px 10px;border:1px solid #633f42;border-radius:9px;background:#24181d;white-space:nowrap}.marketing-ai-posting-provider span,.marketing-ai-posting-provider small{color:#9b777d;font-size:6px}.marketing-ai-posting-provider strong{color:#ffafb5;font-size:9px}.marketing-ai-posting-provider.connected{border-color:#2d6255;background:#102b26}.marketing-ai-posting-provider.connected strong{color:#8cd3b8}.marketing-ai-posting-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:9px 0}.marketing-ai-posting-kpis article{padding:9px;border:1px solid #193852;border-radius:9px;background:#081827}.marketing-ai-posting-kpis small{display:block;color:#6d88a0;font-size:6.3px}.marketing-ai-posting-kpis strong{display:block;margin-top:4px;color:#e2f1fc;font-size:13px}.marketing-ai-posting-warning{display:flex;align-items:flex-start;gap:8px;margin:8px 0 10px;padding:9px;border:1px solid #654a32;border-radius:8px;background:#211a13}.marketing-ai-posting-warning b{flex:0 0 auto;color:#f0bd79;font-size:6.5px}.marketing-ai-posting-warning span{color:#a98b67;font-size:6.8px;line-height:1.45}.marketing-ai-posting-head,.marketing-ai-posting-row{display:grid;grid-template-columns:minmax(190px,1.55fr) 90px 92px 76px 74px 54px 58px 66px;align-items:center;gap:7px}.marketing-ai-posting-head{padding:0 8px 5px;color:#5c7f9c;font-size:5.8px;font-weight:900;letter-spacing:.05em}.marketing-ai-posting-list{display:grid;gap:4px}.marketing-ai-posting-row{padding:8px;border:1px solid #193650;border-radius:8px;background:#081827;color:#7890a5;font-size:6.5px}.marketing-ai-posting-content{min-width:0}.marketing-ai-posting-content small{display:block;color:#5d7f9b;font-size:5.6px}.marketing-ai-posting-content strong{display:block;margin-top:2px;color:#d1e5f5;font-size:7.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.marketing-ai-posting-content span{display:block;margin-top:2px;color:#6f879c;font-size:6.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.marketing-ai-posting-channel{color:#a7c5dc;font-weight:800}.marketing-ai-posting-row time{color:#658099}.marketing-ai-posting-status{display:inline-flex;justify-content:center;padding:3px 5px;border:1px solid #2a4d68;border-radius:999px;background:#0d2940;color:#91b6d4;font-size:5.8px;font-weight:900;white-space:nowrap}.marketing-ai-posting-status.published{border-color:#2e6658;background:#12352d;color:#8ed2b9}.marketing-ai-posting-status.scheduled,.marketing-ai-posting-status.queued,.marketing-ai-posting-status.publishing{border-color:#435d7a;background:#172b42;color:#a7c9e8}.marketing-ai-posting-status.failed{border-color:#713c46;background:#351d25;color:#ff9fa8}.marketing-ai-posting-status.retrying,.marketing-ai-posting-status.review,.marketing-ai-posting-status.credentials_required{border-color:#735038;background:#352616;color:#f3c27f}.marketing-ai-posting-status.cancelled{border-color:#47515a;background:#202831;color:#9aabb8}.marketing-ai-posting-link a{color:#8ec8f8;text-decoration:none}.marketing-ai-posting-link a:hover{text-decoration:underline}.marketing-ai-console-tabs button[data-marketing-tab="publications"][data-live-count]:after{content:attr(data-live-count);display:inline-grid;place-items:center;min-width:14px;height:14px;margin-left:4px;padding:0 3px;border-radius:999px;background:#163a57;color:#8ec8f8;font-size:5.5px;vertical-align:middle}
    @media(max-width:1080px){.marketing-ai-posting-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.marketing-ai-posting-head{display:none}.marketing-ai-posting-row{grid-template-columns:minmax(170px,1.4fr) 80px 88px 72px}.marketing-ai-posting-row>span:nth-of-type(n+4){display:none}}
    @media(max-width:700px){.marketing-ai-posting-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.marketing-ai-posting-panel .marketing-ai-card-head{align-items:flex-start}.marketing-ai-posting-provider{align-items:flex-start}.marketing-ai-posting-row{grid-template-columns:minmax(0,1fr) auto;gap:5px}.marketing-ai-posting-content{grid-column:1}.marketing-ai-posting-channel{grid-column:2;grid-row:1}.marketing-ai-posting-row time{grid-column:1;grid-row:2}.marketing-ai-posting-status{grid-column:2;grid-row:2}.marketing-ai-posting-row>span:nth-of-type(n+3){display:none}}
  `;
  let cache = null;
  let cacheAt = 0;
  let request = null;

  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const won = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;

  function ensureStyles() {
    if (document.querySelector('#marketingAiPostingStatusStyle')) return;
    const style = document.createElement('style');
    style.id = 'marketingAiPostingStatusStyle';
    style.textContent = STYLE;
    document.head.append(style);
  }

  async function overview(force = false) {
    if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
    if (request) return request;
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    request = fetch(`${API}/api/marketing/admin/overview`, { headers, cache:'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `포스팅 현황 요청 실패 (${response.status})`);
        cache = data;
        cacheAt = Date.now();
        return data;
      })
      .finally(() => { request = null; });
    return request;
  }

  function inferChannel(row) {
    const source = `${row?.area || ''} ${row?.actionType || ''} ${row?.target || ''} ${row?.channel || ''}`.toLowerCase();
    const providers = [
      ['instagram','Instagram'],['facebook','Facebook'],['youtube','YouTube'],['tiktok','TikTok'],
      ['threads','Threads'],['linkedin','LinkedIn'],['kakao','Kakao'],['naver','Naver'],['blog','Blog'],['x.com','X'],['twitter','X'],
    ];
    return providers.find(([key]) => source.includes(key))?.[1] || String(row?.channel || '').trim() || '채널 미지정';
  }

  function normalizeStatus(value, actionType = '') {
    const status = String(value || '').toLowerCase();
    const action = String(actionType || '').toLowerCase();
    if (['failed','blocked','rejected'].includes(status)) return 'failed';
    if (['executing'].includes(status)) return 'retrying';
    if (['verified','completed','done','published'].includes(status)) return 'published';
    if (['scheduled'].includes(status) || /schedule|예약/.test(action)) return 'scheduled';
    if (['ready_for_executor','approved_pending_executor'].includes(status)) return 'scheduled';
    if (['awaiting_human','review','approved'].includes(status)) return 'review';
    return 'draft';
  }

  function statusLabel(status) {
    return ({
      draft:'작성중', review:'승인/검수', scheduled:'예약', queued:'게시 대기', publishing:'게시중',
      published:'게시완료', failed:'실패', retrying:'재시도', credentials_required:'인증 필요', cancelled:'취소',
    })[status] || '확인중';
  }

  function actualPublicationRows(data) {
    if (!Array.isArray(data?.publicationJobs)) return null;
    return data.publicationJobs.map(job => {
      const provider = String(job.provider || '').trim();
      const channelName = String(job.channelName || job.channelType || '').trim();
      const channel = [provider, channelName].filter(Boolean).join(' · ') || '채널 미지정';
      const detailParts = [job.subjectLabel, job.captionExcerpt];
      if (job.lastError && ['failed','retrying','credentials_required'].includes(job.status)) detailParts.push(`오류: ${job.lastError}`);
      return {
        id:`job:${job.id}`,
        source:'Publishing',
        title:String(job.title || job.contentType || '게시 콘텐츠'),
        detail:detailParts.filter(Boolean).join(' · '),
        channel,
        status:String(job.status || 'unknown'),
        scheduledAt:job.scheduledAt || job.nextAttemptAt || null,
        publishedAt:job.publishedAt || null,
        updatedAt:job.updatedAt || job.createdAt || null,
        postUrl:String(job.externalPostUrl || ''),
        clicks:null,
        conversions:null,
        revenueKrw:null,
      };
    }).sort((a,b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  }

  function fallbackPublicationRows(data) {
    const rows = [];
    const actions = Array.isArray(data?.automationActions) ? data.automationActions : [];
    for (const action of actions) {
      const scope = `${action.actionType || ''} ${action.area || ''} ${action.target || ''}`;
      if (!POSTING_ACTION_RE.test(scope)) continue;
      const status = normalizeStatus(action.status, action.actionType);
      rows.push({
        id:`action:${action.id}`, source:'AI action', title:String(action.actionType || '포스팅 작업'),
        detail:String(action.target || action.area || '대상 정보 없음'), channel:inferChannel(action), status,
        scheduledAt:status === 'scheduled' ? (action.decidedAt || action.createdAt) : null,
        publishedAt:status === 'published' ? (action.verifiedAt || action.decidedAt || action.createdAt) : null,
        updatedAt:action.verifiedAt || action.decidedAt || action.createdAt,
        postUrl:'', clicks:null, conversions:null, revenueKrw:null,
      });
    }
    const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
    for (const campaign of campaigns) {
      if (!['scheduled','running','completed'].includes(String(campaign.status || '').toLowerCase())) continue;
      const status = campaign.status === 'completed' ? 'published' : 'scheduled';
      rows.push({
        id:`campaign:${campaign.id}`, source:'Campaign', title:String(campaign.name || '캠페인'),
        detail:String(campaign.offerSummary || campaign.objective || ''), channel:inferChannel(campaign), status,
        scheduledAt:campaign.scheduledAt || campaign.startedAt || null,
        publishedAt:status === 'published' ? campaign.completedAt || null : null,
        updatedAt:campaign.completedAt || campaign.startedAt || campaign.scheduledAt || campaign.updatedAt || campaign.createdAt,
        postUrl:'', clicks:null, conversions:null, revenueKrw:null,
      });
    }
    return rows.sort((a,b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  }

  function publicationRows(data) {
    const actual = actualPublicationRows(data);
    return actual === null ? fallbackPublicationRows(data) : actual;
  }

  function metric(value, fallback = '수집 전') {
    return value === null || value === undefined ? fallback : Number(value || 0).toLocaleString('ko-KR');
  }

  function rowHtml(row) {
    const when = row.publishedAt || row.scheduledAt || row.updatedAt;
    return `<article class="marketing-ai-posting-row">
      <div class="marketing-ai-posting-content"><small>${esc(row.source)}</small><strong>${esc(row.title)}</strong><span>${esc(row.detail || '—')}</span></div>
      <span class="marketing-ai-posting-channel">${esc(row.channel)}</span>
      <time>${esc(dateText(when))}</time>
      <span class="marketing-ai-posting-status ${esc(row.status)}">${esc(statusLabel(row.status))}</span>
      <span class="marketing-ai-posting-link">${row.postUrl ? `<a href="${esc(row.postUrl)}" target="_blank" rel="noopener noreferrer">게시물 ↗</a>` : '수집 전'}</span>
      <span>${esc(metric(row.clicks))}</span>
      <span>${esc(row.conversions == null ? '수집 전' : `${metric(row.conversions)}건`)}</span>
      <span>${esc(row.revenueKrw == null ? '수집 전' : won(row.revenueKrw))}</span>
    </article>`;
  }

  function render(view, data) {
    const rows = publicationRows(data);
    const summary = data?.summary || {};
    const actualQueue = Array.isArray(data?.publicationJobs);
    const counts = actualQueue ? {
      scheduled:Number(summary.scheduledPublications || 0),
      published:Number(summary.publishedPublications || 0),
      failed:Number(summary.failedPublications || 0),
      retrying:Number(summary.retryingPublications || 0),
    } : {
      scheduled:rows.filter(row => ['scheduled','queued','publishing'].includes(row.status)).length,
      published:rows.filter(row => row.status === 'published').length,
      failed:rows.filter(row => row.status === 'failed').length,
      retrying:rows.filter(row => row.status === 'retrying').length,
    };
    const engineConnected = Boolean(data?.postingEngine?.connected);
    const activeChannels = Number(data?.postingEngine?.activeChannelCount ?? summary.activePublishChannels ?? 0);
    const totalChannels = Number(data?.postingEngine?.channelCount ?? summary.publishChannels ?? 0);
    const engineWarning = !engineConnected
      ? '<div class="marketing-ai-posting-warning"><b>게시 원장 연결 대기</b><span>게시 엔진 원장을 현재 읽을 수 없습니다. 이 경우에만 기존 캠페인·AI 감사원장을 보조 정보로 표시하며 게시 성공 여부를 추정하지 않습니다.</span></div>'
      : activeChannels < 1
        ? '<div class="marketing-ai-posting-warning"><b>활성 게시 채널 없음</b><span>게시 엔진과 예약 원장은 연결되어 있지만 활성 게시 채널이 없습니다. 채널 인증이 완료되면 실제 예약·게시 결과와 게시 URL이 이 화면에 자동 반영됩니다.</span></div>'
        : '';
    view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-posting-panel">
      <div class="marketing-ai-card-head">
        <div><small>POSTING LEDGER</small><h3>포스팅 현황</h3><p>실제 게시 큐를 기준으로 예약·게시중·완료·재시도·실패를 보여줍니다. 게시 성공 후 저장된 외부 게시 URL만 노출하며 클릭·전환·매출은 측정 데이터가 연결될 때까지 ‘수집 전’으로 표시합니다.</p></div>
        <div class="marketing-ai-posting-provider ${engineConnected ? 'connected' : 'disconnected'}"><span>게시 실행 엔진</span><strong>${engineConnected ? '연결됨' : '확인 필요'}</strong><small>${engineConnected ? `활성 채널 ${activeChannels}/${totalChannels}` : 'publication ledger unavailable'}</small></div>
      </div>
      <div class="marketing-ai-posting-kpis">
        <article><small>게시 작업</small><strong>${rows.length.toLocaleString('ko-KR')}</strong></article>
        <article><small>예약/대기</small><strong>${counts.scheduled.toLocaleString('ko-KR')}</strong></article>
        <article><small>게시완료</small><strong>${counts.published.toLocaleString('ko-KR')}</strong></article>
        <article><small>실패</small><strong>${counts.failed.toLocaleString('ko-KR')}</strong></article>
        <article><small>재시도</small><strong>${counts.retrying.toLocaleString('ko-KR')}</strong></article>
        <article><small>활성 채널</small><strong>${activeChannels.toLocaleString('ko-KR')}</strong></article>
      </div>
      ${engineWarning}
      <div class="marketing-ai-posting-head"><span>콘텐츠/상품</span><span>채널</span><span>예약/게시시각</span><span>상태</span><span>게시URL</span><span>클릭</span><span>전환</span><span>매출</span></div>
      <div class="marketing-ai-posting-list">${rows.length ? rows.slice(0,100).map(rowHtml).join('') : `<div class="marketing-ai-live-empty"><strong>아직 포스팅 작업이 없습니다.</strong><span>실제 예약 또는 게시 작업이 생성되면 이 원장에 바로 표시됩니다.</span></div>`}</div>
      <div class="marketing-ai-live-boundary"><b>데이터 원칙</b><span>실제 publication job 원장을 우선 사용합니다. 외부 게시 성공을 확인하지 못한 항목을 임의로 ‘게시완료’ 처리하지 않으며 인증키·토큰은 이 화면으로 전달하지 않습니다.</span></div>
    </section>`;
  }

  function ensureTab(panel) {
    const nav = panel.querySelector('.marketing-ai-console-tabs');
    if (!nav || nav.querySelector(`[data-marketing-tab="${TAB_KEY}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.marketingTab = TAB_KEY;
    button.textContent = '포스팅 현황';
    const channels = nav.querySelector('[data-marketing-tab="channels"]');
    if (channels) channels.insertAdjacentElement('beforebegin', button); else nav.append(button);
  }

  async function renderPosting(panel, force = false) {
    const view = panel.querySelector('#marketingAiConsoleView');
    const button = panel.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    if (!view || !button?.classList.contains('active')) return;
    view.innerHTML = '<div class="marketing-ai-live-loading"><span></span><strong>포스팅 원장 확인 중</strong><small>실제 예약·게시 큐와 게시 채널 상태를 읽고 있습니다.</small></div>';
    try {
      const data = await overview(force);
      if (!button.classList.contains('active')) return;
      render(view, data);
      button.dataset.liveCount = String(publicationRows(data).length);
    } catch (error) {
      view.innerHTML = `<div class="marketing-ai-live-empty error"><strong>포스팅 현황을 불러오지 못했습니다.</strong><span>${esc(error.message || 'unknown error')}</span></div>`;
    }
  }

  function install() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    if (!panel || panel.dataset.postingStatusInstalled === 'true') return false;
    panel.dataset.postingStatusInstalled = 'true';
    ensureStyles();
    ensureTab(panel);
    panel.addEventListener('click', event => {
      const tab = event.target.closest('[data-marketing-tab]');
      if (tab?.dataset.marketingTab === TAB_KEY) {
        panel.querySelectorAll('[data-marketing-tab]').forEach(item => item.classList.toggle('active', item === tab));
        setTimeout(() => renderPosting(panel), 0);
        return;
      }
      if (tab) panel.querySelector(`[data-marketing-tab="${TAB_KEY}"]`)?.classList.remove('active');
      if (event.target.closest('[data-marketing-refresh]') && panel.querySelector(`[data-marketing-tab="${TAB_KEY}"]`)?.classList.contains('active')) {
        cache = null; cacheAt = 0;
        setTimeout(() => renderPosting(panel, true), 80);
      }
    });
    return true;
  }

  function start() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 20_000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

// Shared deterministic route bridge for every Marketing AI submenu. Kept in this
// demand-loaded bundle so the global admin shell remains thin.
(() => {
  'use strict';

  const PARAM = 'marketing_tab';
  const ROOT_HASH = '#marketing-ai';
  const DEFAULT_TAB = 'overview';
  let suppressWrite = false;
  let installedPanel = null;
  let navObserver = null;

  const panel = () => document.querySelector('#marketingAiAdminPanel');
  const tabButtons = () => [...(panel()?.querySelectorAll('[data-marketing-tab]') || [])];
  const tabButton = tab => tabButtons().find(button => button.dataset.marketingTab === tab) || null;

  function requestedTab() {
    try {
      return new URL(location.href).searchParams.get(PARAM) || DEFAULT_TAB;
    } catch {
      return DEFAULT_TAB;
    }
  }

  function routeFor(tab) {
    const url = new URL(location.href);
    if (tab === DEFAULT_TAB) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, tab);
    url.hash = ROOT_HASH;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function writeRoute(tab, replace = false) {
    if (suppressWrite) return;
    const next = routeFor(tab);
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (next === current) return;
    history[replace ? 'replaceState' : 'pushState']({ marketingTab:tab }, '', next);
  }

  function annotateRoutes() {
    for (const button of tabButtons()) {
      const tab = button.dataset.marketingTab || DEFAULT_TAB;
      button.dataset.marketingRoute = routeFor(tab);
      button.setAttribute('aria-controls', 'marketingAiConsoleView');
      button.setAttribute('aria-current', button.classList.contains('active') ? 'page' : 'false');
    }
  }

  function activateFromLocation({ normalize = true } = {}) {
    if (location.hash !== ROOT_HASH) return false;
    const requested = requestedTab();
    const target = tabButton(requested) || tabButton(DEFAULT_TAB);
    if (!target) return false;
    const resolved = target.dataset.marketingTab || DEFAULT_TAB;
    if (!target.classList.contains('active')) {
      suppressWrite = true;
      try { target.click(); }
      finally { suppressWrite = false; }
    }
    if (normalize && requested !== resolved) writeRoute(resolved, true);
    annotateRoutes();
    return true;
  }

  function install() {
    const host = panel();
    if (!host || installedPanel === host) return Boolean(host);
    installedPanel = host;
    host.dataset.submenuRoutes = 'deterministic-v1';
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-marketing-tab]');
      if (!button || !host.contains(button)) return;
      const tab = button.dataset.marketingTab || DEFAULT_TAB;
      writeRoute(tab);
      queueMicrotask(annotateRoutes);
    });
    const nav = host.querySelector('.marketing-ai-console-tabs');
    if (nav) {
      navObserver?.disconnect();
      navObserver = new MutationObserver(() => {
        annotateRoutes();
        if (location.hash === ROOT_HASH && requestedTab() !== DEFAULT_TAB) queueMicrotask(() => activateFromLocation());
      });
      navObserver.observe(nav, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    }
    annotateRoutes();
    setTimeout(() => activateFromLocation(), 0);
    return true;
  }

  function start() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 20_000);
  }

  window.addEventListener('popstate', () => {
    if (location.hash === ROOT_HASH) queueMicrotask(() => activateFromLocation());
  });
  window.addEventListener('ekodi-admin-section-changed', event => {
    if (event.detail?.section === 'marketing-ai') setTimeout(() => activateFromLocation(), 0);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();