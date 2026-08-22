(() => {
  'use strict';

  const MODULE_ID = 'ekodiCapacityEvidence';
  if (document.getElementById(MODULE_ID)) return;

  const health = document.querySelector('#ekodiSystemHealth');
  if (!health) return;

  const EVIDENCE = Object.freeze({
    verifiedAt: '2026-08-22T09:49:20+09:00',
    maxVerifiedConcurrency: 20,
    stages: [1, 5, 10, 20],
    requestsPerStage: 40,
    method: 'GET-only',
    p95TargetMs: 1500,
    incidentMs: 2500,
    errorBudgetPct: 1,
    peakP95Ms: 98.8,
    peakErrorPct: 0,
    passedTargets: 7,
    totalTargets: 7,
    runUrl: 'https://github.com/topmaster-joseph/ekodi-platform/actions/runs/32541529236',
    sourceUrl: 'https://github.com/topmaster-joseph/ekodi-platform/blob/main/scripts/ecosystem-load-test.mjs',
    targets: [
      { name: 'EKODI', host: 'ekodi.kr', rps: 326.64, p95: 83.9, error: 0 },
      { name: 'Admin', host: 'admin.ekodi.kr', rps: 396.94, p95: 66.8, error: 0 },
      { name: 'API', host: 'api.ekodi.kr/health', rps: 620.26, p95: 43.4, error: 0 },
      { name: 'Biz', host: 'biz.ekodi.kr', rps: 690.79, p95: 40.7, error: 0 },
      { name: 'Marketing', host: 'marketing.ekodi.kr', rps: 204.40, p95: 98.8, error: 0 },
      { name: 'Church', host: 'church.ekodi.kr', rps: 403.55, p95: 61.9, error: 0 },
      { name: 'Lab', host: 'lab.ekodi.kr', rps: 471.48, p95: 57.2, error: 0 },
    ],
  });

  const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
  const verified = new Date(EVIDENCE.verifiedAt).toLocaleString('ko-KR');
  const thresholdUse = Math.min(100, (EVIDENCE.peakP95Ms / EVIDENCE.p95TargetMs) * 100);

  const divider = document.createElement('div');
  divider.className = 'system-health-divider';
  divider.innerHTML = '<span>CAPACITY EVIDENCE</span>';

  const panel = document.createElement('section');
  panel.id = MODULE_ID;
  panel.className = 'health-capacity-evidence';
  panel.setAttribute('aria-label', '멀티접속 검증 용량과 근거');
  panel.innerHTML = `
    <div class="health-capacity-head">
      <div>
        <small>BOUNDED LOAD TEST</small>
        <strong>멀티접속 검증 용량</strong>
        <p>동시 사용자 수의 추정치가 아니라 실제 운영 URL에 동시에 보낸 HTTP 요청 기준입니다.</p>
      </div>
      <div class="health-capacity-links">
        <a href="${EVIDENCE.runUrl}" target="_blank" rel="noopener">근거 보기 ↗</a>
        <a href="${EVIDENCE.sourceUrl}" target="_blank" rel="noopener">테스트 코드 ↗</a>
      </div>
    </div>

    <div class="health-capacity-summary">
      <article><small>현재 검증 완료</small><strong>${EVIDENCE.maxVerifiedConcurrency}</strong><span>동시 HTTP 요청</span></article>
      <article><small>검증 대상</small><strong>${EVIDENCE.passedTargets}/${EVIDENCE.totalTargets}</strong><span>운영 서비스 통과</span></article>
      <article><small>최악 p95</small><strong>${EVIDENCE.peakP95Ms} ms</strong><span>경고 ${format.format(EVIDENCE.p95TargetMs)} ms</span></article>
      <article><small>오류율</small><strong>${EVIDENCE.peakErrorPct.toFixed(2)}%</strong><span>허용 ${EVIDENCE.errorBudgetPct.toFixed(2)}%</span></article>
    </div>

    <div class="health-capacity-stage-card">
      <div class="health-capacity-stage-head"><strong>검증 단계</strong><span>다음 단계 50+는 아직 미검증</span></div>
      <div class="health-capacity-stages" aria-label="부하테스트 검증 단계">
        ${EVIDENCE.stages.map(stage => `<div data-state="ok"><i>✓</i><strong>${stage}</strong><span>동시 요청</span></div>`).join('')}
        <div data-state="pending"><i>?</i><strong>50+</strong><span>미검증</span></div>
      </div>
      <div class="health-capacity-budget">
        <div><span>p95 경고기준 사용률</span><strong>${thresholdUse.toFixed(1)}%</strong></div>
        <div class="health-capacity-budget-track"><span style="width:${thresholdUse.toFixed(1)}%"></span></div>
        <p>응답시간 기준 여유를 보여주는 값이며 최대 동시접속 한계를 의미하지 않습니다.</p>
      </div>
    </div>

    <div class="health-capacity-table-wrap">
      <table class="health-capacity-table">
        <thead><tr><th>대상</th><th>동시요청</th><th>처리량</th><th>p95</th><th>오류</th></tr></thead>
        <tbody>
          ${EVIDENCE.targets.map(row => `<tr><td><strong>${row.name}</strong><small>${row.host}</small></td><td>${EVIDENCE.maxVerifiedConcurrency}</td><td>${format.format(row.rps)} req/s</td><td>${format.format(row.p95)} ms</td><td>${row.error.toFixed(2)}%</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="health-capacity-proof">
      <div><small>마지막 검증</small><strong>${verified}</strong></div>
      <div><small>시험 방식</small><strong>${EVIDENCE.method} · ${EVIDENCE.requestsPerStage} requests/stage</strong></div>
      <div><small>판정 기준</small><strong>p95 ${format.format(EVIDENCE.p95TargetMs)} ms · incident ${format.format(EVIDENCE.incidentMs)} ms · error ${EVIDENCE.errorBudgetPct.toFixed(2)}%</strong></div>
    </div>
    <p class="health-capacity-note">※ “20 동시 요청 검증 완료”는 최대 20명이라는 뜻이 아닙니다. 실제 사용자 한 명은 여러 요청을 만들 수 있고, 정적·API·DB·AI 작업별 병목도 서로 다릅니다.</p>`;

  const anchor = health.querySelector('.health-diagram-grid') || health.querySelector('.core-health-columns');
  if (anchor) anchor.insertAdjacentElement('afterend', divider);
  else health.append(divider);
  divider.insertAdjacentElement('afterend', panel);
})();
