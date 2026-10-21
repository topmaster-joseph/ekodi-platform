import { analyzeSnapshot } from './policy-engine.mjs';

const form = document.querySelector('#energyForm');
const results = document.querySelector('#results');
const count = document.querySelector('#recommendationCount');
const telemetryStatus = document.querySelector('#telemetryStatus');
const clearButton = document.querySelector('#clearButton');

function readNumber(id) {
  const value = document.querySelector(`#${id}`).value.trim();
  return value === '' ? undefined : Number(value);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function render(report) {
  count.textContent = String(report.recommendationCount);
  telemetryStatus.textContent = report.telemetryReady ? '수동 데이터 수신' : '연결 대기';
  if (!report.recommendations.length) {
    results.className = 'results empty';
    results.textContent = '현재 입력값에서는 별도 제안이 없습니다.';
    return;
  }
  results.className = 'results';
  results.innerHTML = report.recommendations.map((item) => {
    const savings = item.estimatedMonthlySavingsWon == null
      ? ''
      : `<small>예상 월 절감액 약 ${item.estimatedMonthlySavingsWon.toLocaleString('ko-KR')}원</small>`;
    const gate = item.humanGate ? '<span class="gate">승인 필요</span>' : '';
    return `<article class="recommendation ${escapeHtml(item.severity)}">
      <div><strong>${escapeHtml(item.title)}</strong>${gate}</div>
      <p>${escapeHtml(item.detail)}</p>${savings}
    </article>`;
  }).join('');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  let devices = [];
  const rawDevices = document.querySelector('#devices').value.trim();
  try {
    devices = rawDevices ? JSON.parse(rawDevices) : [];
    if (!Array.isArray(devices)) throw new Error('array required');
  } catch {
    results.className = 'results error';
    results.textContent = '기기 데이터는 JSON 배열 형식이어야 합니다.';
    return;
  }

  render(analyzeSnapshot({
    totalPowerW: readNumber('totalPowerW'),
    baselinePowerW: readNumber('baselinePowerW'),
    pricePerKwh: readNumber('pricePerKwh'),
    devices
  }));
});

clearButton.addEventListener('click', () => {
  form.reset();
  count.textContent = '0';
  telemetryStatus.textContent = '연결 대기';
  results.className = 'results empty';
  results.textContent = '아직 분석한 실제 전력 데이터가 없습니다.';
});
