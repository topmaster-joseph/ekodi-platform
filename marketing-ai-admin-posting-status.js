(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TAB_KEY = 'publications';
  const POSTING_ACTION_RE = /(post|posting|publish|publication|social|channel|콘텐츠|게시|포스팅)/i;
  const CACHE_MS = 15_000;
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
    return ({draft:'작성중',review:'승인/검수',scheduled:'예약',published:'게시완료',failed:'실패',retrying:'재시도'})[status] || '확인중';
  }

  function publicationRows(data) {
    const rows = [];
    const actions = Array.isArray(data?.automationActions) ? data.automationActions : [];
    for (const action of actions) {
      const scope = `${action.actionType || ''} ${action.area || ''} ${action.target || ''}`;
      if (!POSTING_ACTION_RE.test(scope)) continue;
      const status = normalizeStatus(action.status, action.actionType);
      rows.push({
        id:`action:${action.id}`,
        source:'AI action',
        title:String(action.actionType || '포스팅 작업'),
        detail:String(action.target || action.area || '대상 정보 없음'),
        channel:inferChannel(action),
        status,
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
        id:`campaign:${campaign.id}`,
        source:'Campaign',
        title:String(campaign.name || '캠페인'),
        detail:String(campaign.offerSummary || campaign.objective || ''),
        channel:inferChannel(campaign),
        status,
        scheduledAt:campaign.scheduledAt || campaign.startedAt || null,
        publishedAt:status === 'published' ? (campaign.completedAt || null) : null,
        updatedAt:campaign.completedAt || campaign.startedAt || campaign.scheduledAt || campaign.updatedAt || campaign.createdAt,
        postUrl:'', clicks:null, conversions:null, revenueKrw:null,
      });
    }

    const seen = new Set();
    return rows
      .filter(row => {
        const key = `${row.source}:${row.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a,b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
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
    const counts = {
      scheduled:rows.filter(row => row.status === 'scheduled').length,
      published:rows.filter(row => row.status === 'published').length,
      failed:rows.filter(row => row.status === 'failed').length,
      retrying:rows.filter(row => row.status === 'retrying').length,
    };
    const publisherConnected = Boolean(data?.safety?.externalExecution);
    const activeChannels = Number(data?.summary?.channels || 0);
    view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-posting-panel">
      <div class="marketing-ai-card-head">
        <div><small>POSTING LEDGER</small><h3>포스팅 현황</h3><p>캠페인 원장과 AI 감사 원장에서 실제 게시 관련 작업만 모아 보여줍니다. 없는 게시URL·클릭·전환은 0으로 꾸미지 않고 ‘수집 전’으로 표시합니다.</p></div>
        <div class="marketing-ai-posting-provider ${publisherConnected ? 'connected' : 'disconnected'}"><span>게시 실행자</span><strong>${publisherConnected ? '연결됨' : '미연결'}</strong><small>${publisherConnected ? '외부 실행 가능' : '외부 자동실행 OFF'}</small></div>
      </div>
      <div class="marketing-ai-posting-kpis">
        <article><small>게시 관련 이력</small><strong>${rows.length.toLocaleString('ko-KR')}</strong></article>
        <article><small>예약</small><strong>${counts.scheduled.toLocaleString('ko-KR')}</strong></article>
        <article><small>게시완료</small><strong>${counts.published.toLocaleString('ko-KR')}</strong></article>
        <article><small>실패</small><strong>${counts.failed.toLocaleString('ko-KR')}</strong></article>
        <article><small>재시도</small><strong>${counts.retrying.toLocaleString('ko-KR')}</strong></article>
        <article><small>등록 채널</small><strong>${activeChannels.toLocaleString('ko-KR')}</strong></article>
      </div>
      ${publisherConnected ? '' : `<div class="marketing-ai-posting-warning"><b>게시 채널 연결 대기</b><span>현재 EKODI 런타임의 외부 자동실행이 꺼져 있습니다. Metricool 또는 채널 게시 어댑터가 연결되면 예약·게시 URL·성과 수집을 이 원장에 이어 붙일 수 있습니다.</span></div>`}
      <div class="marketing-ai-posting-head"><span>콘텐츠/상품</span><span>채널</span><span>예약/게시시각</span><span>상태</span><span>게시URL</span><span>클릭</span><span>전환</span><span>매출</span></div>
      <div class="marketing-ai-posting-list">${rows.length ? rows.slice(0,80).map(rowHtml).join('') : `<div class="marketing-ai-live-empty"><strong>아직 포스팅 이력이 없습니다.</strong><span>현재 예약 게시 0건입니다. 게시 어댑터 연결 후 실제 예약·게시 이력이 이곳에 누적됩니다.</span></div>`}</div>
      <div class="marketing-ai-live-boundary"><b>데이터 원칙</b><span>이 화면은 저장된 캠페인·AI 감사 원장만 사용합니다. 외부 게시 성공을 확인하지 못한 항목을 임의로 ‘게시완료’ 처리하지 않습니다.</span></div>
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
    view.innerHTML = '<div class="marketing-ai-live-loading"><span></span><strong>포스팅 원장 확인 중</strong><small>캠페인·AI 감사 원장의 실제 게시 관련 이력을 읽고 있습니다.</small></div>';
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
