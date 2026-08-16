(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const LIVE_TABS = new Set(['channels','automation','approvals']);
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
  const stateLabel = value => String(value || 'unknown').replaceAll('_',' ').toUpperCase();

  async function overview(force = false) {
    if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
    if (request) return request;
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    request = fetch(`${API}/api/marketing/admin/overview`, { headers, cache:'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `운영 데이터 요청 실패 (${response.status})`);
        cache = data;
        cacheAt = Date.now();
        return data;
      })
      .finally(() => { request = null; });
    return request;
  }

  function loading(view, title) {
    view.innerHTML = `<div class="marketing-ai-live-loading"><span></span><strong>${esc(title)}</strong><small>기존 운영 원장에서 실데이터를 읽고 있습니다.</small></div>`;
  }

  function empty(title, detail) {
    return `<div class="marketing-ai-live-empty"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`;
  }

  function providerIcon(provider) {
    const map = { youtube:'YT', instagram:'IG', facebook:'FB', kakao:'KA', blog:'BL', threads:'TH', live:'LV', tiktok:'TK', linkedin:'IN' };
    return map[String(provider || '').toLowerCase()] || 'CH';
  }

  function renderChannels(view, data) {
    const rows = Array.isArray(data.channels) ? data.channels : [];
    const byOrg = new Map();
    for (const row of rows) {
      const key = `${row.organizationId || 'other'}:${row.organizationName || '기타'}`;
      if (!byOrg.has(key)) byOrg.set(key, []);
      byOrg.get(key).push(row);
    }
    view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-live-panel">
      <div class="marketing-ai-card-head">
        <div><small>CHANNEL REGISTRY</small><h3>연결 채널 현황</h3><p>현재 중앙 Social Registry에 등록된 활성 채널입니다. 고객별 OAuth·게시 권한은 별도 연결 계약으로 확장합니다.</p></div>
        <div class="marketing-ai-live-head-stat"><strong>${rows.length.toLocaleString('ko-KR')}</strong><span>active channels</span></div>
      </div>
      <div class="marketing-ai-live-source"><span>DATA SOURCE</span><strong>EKODI Social Registry</strong><em>rev ${Number(data.channelRegistry?.revision || 0)} · ${esc(dateText(data.channelRegistry?.updatedAt))}</em></div>
      ${rows.length ? `<div class="marketing-ai-channel-groups">${[...byOrg.entries()].map(([key, channels]) => {
        const first = channels[0] || {};
        return `<article class="marketing-ai-channel-group">
          <div class="marketing-ai-channel-org"><div><strong>${esc(first.organizationName || key)}</strong><span>${esc(first.website || '')}</span></div><b>${channels.length}</b></div>
          <div class="marketing-ai-channel-list">${channels.map(channel => `<a href="${esc(channel.url)}" target="_blank" rel="noopener" class="marketing-ai-channel-row">
            <i>${esc(providerIcon(channel.provider))}</i><div><strong>${esc(channel.label)}</strong><span>${esc(channel.handle || channel.description || channel.provider)}</span></div><em>ACTIVE</em><b>↗</b>
          </a>`).join('')}</div>
        </article>`;
      }).join('')}</div>` : empty('등록된 활성 채널이 없습니다.','Social Registry에 채널이 추가되면 실제 등록값이 이곳에 나타납니다.')}
      <div class="marketing-ai-live-boundary"><b>현재 경계</b><span>이 탭은 등록·상태 조회만 합니다. 고객 채널에 게시하거나 자격정보를 변경하지 않습니다.</span></div>
    </section>`;
  }

  function actionRow(row) {
    return `<article class="marketing-ai-action-row">
      <div class="marketing-ai-action-agent"><span>${esc(row.agentName || row.agentId || 'AI')}</span><small>${esc(row.area || '—')}</small></div>
      <div class="marketing-ai-action-copy"><strong>${esc(row.actionType || 'action')}</strong><span>${esc(row.target || row.rationale || '대상 없음')}</span></div>
      <span class="marketing-ai-action-tier ${esc(row.decisionTier)}">${esc(stateLabel(row.decisionTier))}</span>
      <span class="marketing-ai-action-status ${esc(row.status)}">${esc(stateLabel(row.status))}</span>
      <time>${esc(dateText(row.createdAt))}</time>
    </article>`;
  }

  function renderAutomation(view, data) {
    const rows = Array.isArray(data.automationActions) ? data.automationActions : [];
    const active = rows.filter(row => ['executing','ready_for_executor','awaiting_human','approved_pending_executor'].includes(row.status)).length;
    const verified = rows.filter(row => row.status === 'verified').length;
    const failed = rows.filter(row => row.status === 'failed' || row.status === 'blocked').length;
    view.innerHTML = `<section class="marketing-ai-console-card marketing-ai-live-panel">
      <div class="marketing-ai-card-head"><div><small>AI AUTOMATION</small><h3>Marketing AI 에이전트 활동</h3><p>공용 AI Mission Control 감사 원장에서 마케팅·캠페인·채널 관련 action만 추려 보여줍니다.</p></div></div>
      <div class="marketing-ai-live-kpis"><article><small>관련 Action</small><strong>${rows.length.toLocaleString('ko-KR')}</strong></article><article><small>진행/대기</small><strong>${active.toLocaleString('ko-KR')}</strong></article><article><small>검증 완료</small><strong>${verified.toLocaleString('ko-KR')}</strong></article><article><small>차단/실패</small><strong>${failed.toLocaleString('ko-KR')}</strong></article></div>
      <div class="marketing-ai-action-head"><span>AGENT / AREA</span><span>ACTION / TARGET</span><span>POLICY</span><span>STATUS</span><span>TIME</span></div>
      <div class="marketing-ai-action-list">${rows.length ? rows.slice(0,40).map(actionRow).join('') : empty('아직 기록된 Marketing AI action이 없습니다.','에이전트가 마케팅 관련 작업을 평가·제안·검증하면 이 감사 원장에 기록됩니다.')}</div>
      <div class="marketing-ai-live-boundary"><b>실행 경계</b><span>이 화면은 감사·관찰용입니다. 실행 가능 여부는 AI Mission Governance와 별도 인간 승인 게이트가 결정합니다.</span></div>
    </section>`;
  }

  function approvalRow(row) {
    const waiting = row.status === 'awaiting_human';
    return `<article class="marketing-ai-approval-row ${waiting ? 'waiting' : ''}">
      <div class="marketing-ai-approval-signal">${waiting ? '!' : '✓'}</div>
      <div class="marketing-ai-approval-copy"><small>${esc(row.agentName || row.agentId || 'AI')} · ${esc(row.area || '—')}</small><strong>${esc(row.actionType || 'action')}</strong><p>${esc(row.target || row.rationale || '대상 정보 없음')}</p><span>${esc(row.decisionReason || '')}</span></div>
      <div class="marketing-ai-approval-state"><b class="${esc(row.status)}">${esc(stateLabel(row.status))}</b><time>${esc(dateText(row.decidedAt || row.createdAt))}</time>${row.decidedBy ? `<small>${esc(row.decidedBy)}</small>` : ''}</div>
    </article>`;
  }

  function renderApprovals(view, data) {
    const rows = Array.isArray(data.approvals) ? data.approvals : [];
    const waiting = rows.filter(row => row.status === 'awaiting_human');
    const decided = rows.filter(row => row.status !== 'awaiting_human');
    view.innerHTML = `<div class="marketing-ai-approval-layout">
      <section class="marketing-ai-console-card marketing-ai-live-panel">
        <div class="marketing-ai-card-head"><div><small>HUMAN GATE</small><h3>사람의 결정 대기</h3><p>Marketing AI 관련 고영향 action 가운데 사람의 판단이 필요한 항목입니다.</p></div><div class="marketing-ai-live-head-stat urgent"><strong>${waiting.length.toLocaleString('ko-KR')}</strong><span>waiting</span></div></div>
        <div class="marketing-ai-approval-list">${waiting.length ? waiting.map(approvalRow).join('') : empty('현재 결정 대기 항목이 없습니다.','사람의 결정을 요구하는 Marketing AI action이 생기면 이곳에 나타납니다.')}</div>
        <div class="marketing-ai-live-boundary"><b>중요</b><span>MarketingAI 운영센터는 승인 현황만 보여줍니다. 승인·거절 결정은 전체 AI Ops의 명시적 인간 결정 흐름에서 처리합니다.</span></div>
      </section>
      <section class="marketing-ai-console-card marketing-ai-live-panel marketing-ai-decision-history">
        <div class="marketing-ai-card-head"><div><small>DECISION HISTORY</small><h3>최근 인간 결정</h3></div><b>${decided.length.toLocaleString('ko-KR')}</b></div>
        <div class="marketing-ai-approval-list compact">${decided.length ? decided.slice(0,20).map(approvalRow).join('') : empty('아직 결정 이력이 없습니다.','승인 또는 거절된 Marketing AI action이 기록되면 표시됩니다.')}</div>
      </section>
    </div>`;
  }

  async function renderLive(tab, force = false) {
    const panel = document.querySelector('#marketingAiAdminPanel');
    const view = panel?.querySelector('#marketingAiConsoleView');
    const active = panel?.querySelector(`[data-marketing-tab="${tab}"]`)?.classList.contains('active');
    if (!panel || !view || !active) return;
    loading(view, tab === 'channels' ? '채널 원장 확인 중' : tab === 'automation' ? 'AI action 원장 확인 중' : '승인 원장 확인 중');
    try {
      const data = await overview(force);
      if (!panel.querySelector(`[data-marketing-tab="${tab}"]`)?.classList.contains('active')) return;
      if (tab === 'channels') renderChannels(view, data);
      if (tab === 'automation') renderAutomation(view, data);
      if (tab === 'approvals') renderApprovals(view, data);
      for (const key of LIVE_TABS) {
        const button = panel.querySelector(`[data-marketing-tab="${key}"]`);
        if (!button) continue;
        const count = key === 'channels' ? Number(data.summary?.channels || 0)
          : key === 'automation' ? Number(data.summary?.automationActions || 0)
          : Number(data.summary?.pendingApprovals || 0);
        button.dataset.liveCount = String(count);
      }
    } catch (error) {
      view.innerHTML = `<div class="marketing-ai-live-empty error"><strong>실시간 운영 원장을 불러오지 못했습니다.</strong><span>${esc(error.message || 'unknown error')}</span></div>`;
    }
  }

  function install() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    if (!panel || panel.dataset.liveOpsInstalled === 'true') return false;
    panel.dataset.liveOpsInstalled = 'true';
    panel.addEventListener('click', event => {
      const tabButton = event.target.closest('[data-marketing-tab]');
      if (tabButton && LIVE_TABS.has(tabButton.dataset.marketingTab)) {
        setTimeout(() => renderLive(tabButton.dataset.marketingTab), 0);
      }
      if (event.target.closest('[data-marketing-refresh]')) {
        cache = null; cacheAt = 0;
        const active = panel.querySelector('[data-marketing-tab].active')?.dataset.marketingTab;
        if (LIVE_TABS.has(active)) setTimeout(() => renderLive(active, true), 80);
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
