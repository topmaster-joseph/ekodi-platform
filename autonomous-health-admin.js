(() => {
  'use strict';
  const MODULE_ID = 'ekodiAutonomousHealthPanel';
  const INDEXES = [
    ['EHI', 'Health', '전체 건강'],
    ['ESI', 'Scalability', '확장성'],
    ['ERI', 'Reliability', '신뢰성'],
    ['EAI', 'Autonomy', '자율성'],
    ['E2I', 'Experience', '경험·학습'],
    ['ECRI', 'Crisis Resilience', '위기복원력']
  ];

  function score(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n.toFixed(1).replace(/\.0$/, '') : '—';
  }

  function mount() {
    const health = document.getElementById('ekodiSystemHealth');
    if (!health || document.getElementById(MODULE_ID)) return false;
    const panel = document.createElement('div');
    panel.id = MODULE_ID;
    panel.className = 'autonomous-health-panel';
    panel.innerHTML = `
      <div class="system-health-divider"><span>GENERATION 10 · AUTONOMOUS SELF-CHECK</span></div>
      <div class="autonomous-health-head">
        <div><small>OBSERVE → ASSESS → PREDICT → ACT → VERIFY → LEARN</small><strong>자율 건강 · 확장 · 복원 지표</strong><span data-autonomous-health-state>실측 근거를 기다리는 중입니다. 근거 없는 점수는 표시하지 않습니다.</span></div>
        <div class="autonomous-health-coverage"><small>근거 커버리지</small><strong data-autonomous-health-coverage>—</strong></div>
      </div>
      <div class="autonomous-health-grid">
        ${INDEXES.map(([id, en, ko]) => `<article data-autonomous-index="${id}"><small>${id} · ${en}</small><strong>—</strong><span>${ko}</span></article>`).join('')}
      </div>
      <div class="autonomous-health-policy">
        <span>Core 최소화</span><span>AI 선택 호출</span><span>가역적 자동조치</span><span>중·고위험 승인</span><span>트래픽 탄력성</span><span>Graceful Degradation</span><span>모든 조치 감사</span>
      </div>
      <div class="autonomous-health-actions" data-autonomous-health-actions>현재 제안된 보호 조치가 없습니다.</div>
    `;
    const firstDivider = health.querySelector('.system-health-divider');
    if (firstDivider) firstDivider.insertAdjacentElement('beforebegin', panel);
    else health.append(panel);
    return true;
  }

  function render(report = {}) {
    if (!mount()) {
      const panel = document.getElementById(MODULE_ID);
      if (!panel) return;
    }
    const panel = document.getElementById(MODULE_ID);
    const coverage = Number(report.coveragePct);
    panel.querySelector('[data-autonomous-health-coverage]').textContent = Number.isFinite(coverage) ? `${Math.max(0, Math.min(100, coverage)).toFixed(0)}%` : '—';
    const state = String(report.state || 'UNKNOWN');
    const stateEl = panel.querySelector('[data-autonomous-health-state]');
    stateEl.textContent = state === 'UNKNOWN'
      ? '실측 근거를 기다리는 중입니다. 근거 없는 점수는 표시하지 않습니다.'
      : `상태 ${state} · ${report.observedAt ? new Date(report.observedAt).toLocaleString('ko-KR') : '관측시각 미상'}`;
    panel.dataset.state = state.toLowerCase();
    for (const [id] of INDEXES) {
      const card = panel.querySelector(`[data-autonomous-index="${id}"]`);
      if (card) card.querySelector('strong').textContent = score(report.indices?.[id]);
    }
    const allowed = (report.guardrailDecisions || []).filter(item => item.decision === 'AUTO_ALLOWED');
    const blocked = (report.guardrailDecisions || []).filter(item => item.decision !== 'AUTO_ALLOWED');
    const actionEl = panel.querySelector('[data-autonomous-health-actions]');
    if (!allowed.length && !blocked.length) actionEl.textContent = '현재 제안된 보호 조치가 없습니다.';
    else actionEl.textContent = `자동 허용 ${allowed.length} · 승인 필요 ${blocked.length} · 모든 변경은 전후 검증과 감사기록 대상`;
  }

  window.EKODIAutonomousHealth = Object.freeze({ render });
  window.addEventListener('ekodi:autonomous-health', event => render(event.detail || {}));
  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
