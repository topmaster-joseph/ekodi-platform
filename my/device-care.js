import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.EKODI_MY_CONFIG || {};
const enabled = Boolean(cfg.dataEnabled && cfg.supabaseUrl && cfg.supabasePublishableKey);
const sb = enabled
  ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { detectSessionInUrl: true, persistSession: true } })
  : null;

const $ = selector => document.querySelector(selector);
const HISTORY_KEY = 'ekodi_device_care_history_v1';
const TYPE_KEY = 'ekodi_device_care_type_v1';
const CACHE_ALLOWLIST = /^(ekodi|my-ekodi|ekodi-my)([-_:].*)?$/i;
const DEVICE_TYPES = Object.freeze({
  pc: Object.freeze({
    label: 'PC', icon: '⊞', scope: '현재 PC의 브라우저와 EKODI 웹 환경을 진단합니다.',
    next: '더 깊은 Windows 진단·복구가 필요하면 검증된 EKODI Device Agent를 사용자 승인으로 연결할 수 있습니다.',
  }),
  pos: Object.freeze({
    label: 'POS', icon: '▤', scope: '현재 POS에서 열린 브라우저 상태만 확인합니다. 결제 단말·카드리더·금전함은 읽지 않습니다.',
    next: 'Windows POS는 관리자가 제한관리 유형으로 Agent를 연결할 수 있습니다. 결제업무 보호를 위해 관찰성 명령만 기본 허용됩니다.',
  }),
  kiosk: Object.freeze({
    label: '키오스크', icon: '▣', scope: '현재 키오스크 브라우저의 연결·저장공간·EKODI 캐시만 확인합니다.',
    next: 'Windows 키오스크는 제한관리로 연결할 수 있으며 고객 이용을 방해하는 유지보수·전원 작업은 기본 차단됩니다.',
  }),
  tablet: Object.freeze({
    label: '태블릿', icon: '▯', scope: '현재 태블릿 브라우저 범위만 확인합니다. 앱·OS 설정이나 다른 앱 데이터에는 접근하지 않습니다.',
    next: '태블릿은 휴대형 기기로 취급되어 EKODI 자동 작업 노드에서 제외됩니다. 지원되는 Agent가 있을 때도 관찰 진단부터 시작합니다.',
  }),
  sensor: Object.freeze({
    label: '센서', icon: '⌁', scope: '이 화면을 연 브라우저만 진단합니다. 실제 에너지·환경 센서의 측정값이나 설정을 추정하지 않습니다.',
    next: '센서는 관리자 통합 기기관리에서 관찰 인벤토리로 먼저 등록합니다. 전용 어댑터가 검증된 뒤에만 실제 측정값 연결을 추가합니다.',
  }),
  robot: Object.freeze({
    label: '서비스로봇', icon: '◇', scope: '이 화면을 연 브라우저만 진단합니다. 로봇의 위치·모터·배터리·센서 상태를 브라우저 정보로 추정하지 않습니다.',
    next: '서비스로봇은 관찰 인벤토리부터 등록합니다. 이동·구동 등 물리 행동은 전용 안전 어댑터와 별도 승인이 마련되기 전에는 실행하지 않습니다.',
  }),
  other: Object.freeze({
    label: '기타', icon: '○', scope: '현재 브라우저에서 확인 가능한 최소 정보만 진단합니다.',
    next: '기기 종류와 안전 경계를 확인한 뒤 적합한 Agent나 관찰 어댑터를 선택하는 것이 다음 단계입니다.',
  }),
});
let session = null;
let lastReport = null;
let deviceType = readDeviceType();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function readDeviceType() {
  try {
    const value = localStorage.getItem(TYPE_KEY) || 'pc';
    return DEVICE_TYPES[value] ? value : 'pc';
  } catch {
    return 'pc';
  }
}

function rememberDeviceType(value) {
  deviceType = DEVICE_TYPES[value] ? value : 'pc';
  try { localStorage.setItem(TYPE_KEY, deviceType); } catch {}
  renderDeviceTypeUi();
  if (lastReport) {
    lastReport.deviceType = deviceType;
    renderReport(lastReport);
  }
}

function currentType() {
  return DEVICE_TYPES[deviceType] || DEVICE_TYPES.pc;
}

function renderDeviceTypeUi() {
  const grid = $('#deviceCareTypeGrid');
  const note = $('#deviceCareTypeNote');
  const next = $('#deviceCareNextStep');
  if (grid) {
    grid.innerHTML = Object.entries(DEVICE_TYPES).map(([id, item]) => `
      <button type="button" class="device-care-type${id === deviceType ? ' active' : ''}" data-device-care-type="${esc(id)}" aria-pressed="${id === deviceType ? 'true' : 'false'}">
        <span aria-hidden="true">${esc(item.icon)}</span><strong>${esc(item.label)}</strong>
      </button>`).join('');
    grid.querySelectorAll('[data-device-care-type]').forEach(button => button.addEventListener('click', () => rememberDeviceType(button.dataset.deviceCareType)));
  }
  if (note) note.innerHTML = `<strong>${esc(currentType().label)} 진단 범위</strong><span>${esc(currentType().scope)}</span>`;
  if (next) next.innerHTML = `<span class="device-care-next-icon" aria-hidden="true">${esc(currentType().icon)}</span><div><strong>${esc(currentType().label)}의 다음 연결</strong><p>${esc(currentType().next)}</p></div>`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '확인 불가';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function platformLabel() {
  return navigator.userAgentData?.platform || navigator.platform || '알 수 없음';
}

function browserLabel() {
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Chrome\//.test(ua)) return 'Google Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return '웹 브라우저';
}

async function measureLatency(samples = 3) {
  const values = [];
  for (let i = 0; i < samples; i += 1) {
    const started = performance.now();
    try {
      const response = await fetch(`/config.js?device-care=${Date.now()}-${i}`, { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok) values.push(performance.now() - started);
    } catch {}
  }
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function storageInfo() {
  if (!navigator.storage?.estimate) return { usage: null, quota: null, percent: null };
  try {
    const estimate = await navigator.storage.estimate();
    const usage = Number(estimate.usage);
    const quota = Number(estimate.quota);
    return {
      usage: Number.isFinite(usage) ? usage : null,
      quota: Number.isFinite(quota) ? quota : null,
      percent: Number.isFinite(usage) && Number.isFinite(quota) && quota > 0 ? Math.round((usage / quota) * 100) : null,
    };
  } catch {
    return { usage: null, quota: null, percent: null };
  }
}

async function webAppState() {
  const state = { serviceWorkers: null, cacheCount: null, ekodiCacheCount: null };
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      state.serviceWorkers = registrations.length;
    }
  } catch {}
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      state.cacheCount = names.length;
      state.ekodiCacheCount = names.filter(name => CACHE_ALLOWLIST.test(name)).length;
    }
  } catch {}
  return state;
}

function navigationInfo() {
  const entry = performance.getEntriesByType?.('navigation')?.[0];
  if (!entry) return { loadMs: null, domMs: null };
  return {
    loadMs: Number.isFinite(entry.loadEventEnd) ? Math.round(entry.loadEventEnd) : null,
    domMs: Number.isFinite(entry.domContentLoadedEventEnd) ? Math.round(entry.domContentLoadedEventEnd) : null,
  };
}

function networkInfo() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine !== false,
    effectiveType: connection?.effectiveType || null,
    downlink: Number.isFinite(connection?.downlink) ? connection.downlink : null,
    saveData: Boolean(connection?.saveData),
  };
}

function scoreReport(report) {
  let score = 100;
  const recommendations = [];
  const storage = report.storage;
  const network = report.network;

  if (!network.online) {
    score -= 35;
    recommendations.push({ level: 'high', title: '인터넷 연결 확인', detail: '브라우저가 오프라인 상태로 보고하고 있습니다.' });
  }
  if (report.latencyMs != null && report.latencyMs > 1200) {
    score -= 18;
    recommendations.push({ level: 'high', title: '연결 속도 점검', detail: `My EKODI 응답이 평균 ${report.latencyMs}ms로 느립니다. Wi-Fi 또는 네트워크 상태를 확인해 주세요.` });
  } else if (report.latencyMs != null && report.latencyMs > 500) {
    score -= 8;
    recommendations.push({ level: 'medium', title: '네트워크가 다소 느립니다', detail: `현재 평균 응답시간은 ${report.latencyMs}ms입니다.` });
  }
  if (storage.percent != null && storage.percent >= 90) {
    score -= 18;
    recommendations.push({ level: 'high', title: '브라우저 저장공간 점검', detail: `이 사이트가 사용할 수 있는 저장공간의 약 ${storage.percent}%가 사용 중입니다.` });
  } else if (storage.percent != null && storage.percent >= 75) {
    score -= 7;
    recommendations.push({ level: 'medium', title: '저장공간 여유 확인', detail: `브라우저 저장공간 사용률이 약 ${storage.percent}%입니다.` });
  }
  if (report.webApp.ekodiCacheCount > 2) {
    score -= 4;
    recommendations.push({ level: 'low', title: 'EKODI 캐시 정리 가능', detail: '오래된 EKODI 전용 캐시가 여러 개 감지되었습니다. 안전 최적화로 정리할 수 있습니다.' });
  }
  if (report.navigation.loadMs != null && report.navigation.loadMs > 4000) {
    score -= 8;
    recommendations.push({ level: 'medium', title: '페이지 로딩 점검', detail: `현재 페이지 전체 로딩에 약 ${report.navigation.loadMs}ms가 걸렸습니다.` });
  }
  if (Number(navigator.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 2) {
    recommendations.push({ level: 'info', title: '가벼운 화면 사용 권장', detail: '현재 기기는 동시에 처리할 수 있는 작업 수가 적게 보고됩니다. 여러 무거운 탭을 함께 열지 않는 편이 좋습니다.' });
  }
  if (!['pc', 'pos', 'kiosk', 'tablet'].includes(report.deviceType)) {
    recommendations.push({ level: 'info', title: `${currentType().label} 하드웨어는 추정하지 않습니다`, detail: '이 점수는 현재 브라우저와 EKODI 웹 연결 상태에 대한 점수이며 실제 물리 기기의 건강점수가 아닙니다.' });
  }
  if (!recommendations.length) {
    recommendations.push({ level: 'good', title: '현재 브라우저 상태가 좋습니다', detail: '즉시 정리해야 할 EKODI 웹 환경 문제를 찾지 못했습니다.' });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    label: score >= 90 ? '좋음' : score >= 75 ? '관찰' : score >= 55 ? '주의' : '점검 필요',
    recommendations,
  };
}

async function collectReport() {
  const [storage, webApp, latencyMs] = await Promise.all([storageInfo(), webAppState(), measureLatency()]);
  const report = {
    version: 2,
    checkedAt: new Date().toISOString(),
    deviceType,
    browser: browserLabel(),
    platform: platformLabel(),
    cpuThreads: Number(navigator.hardwareConcurrency) || null,
    memoryGb: Number(navigator.deviceMemory) || null,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    pixelRatio: Number(window.devicePixelRatio) || 1,
    network: networkInfo(),
    latencyMs,
    storage,
    webApp,
    navigation: navigationInfo(),
  };
  report.health = scoreReport(report);
  return report;
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(report) {
  try {
    const history = [
      { checkedAt: report.checkedAt, score: report.health.score, label: report.health.label, deviceType: report.deviceType },
      ...readHistory(),
    ].slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function renderHistory() {
  const host = $('#deviceCareHistory');
  if (!host) return;
  const history = readHistory();
  host.innerHTML = history.length
    ? history.map(item => `<span><strong>${esc(item.score)}</strong><small>${esc(DEVICE_TYPES[item.deviceType]?.label || 'PC')} · ${esc(new Date(item.checkedAt).toLocaleString('ko-KR'))}</small></span>`).join('')
    : '<p>아직 이 브라우저에서 실행한 진단 기록이 없습니다.</p>';
}

function metric(label, value, note = '') {
  return `<article><small>${esc(label)}</small><strong>${esc(value)}</strong>${note ? `<span>${esc(note)}</span>` : ''}</article>`;
}

function renderReport(report) {
  const score = $('#deviceCareScore');
  const scoreLabel = $('#deviceCareScoreLabel');
  const metrics = $('#deviceCareMetrics');
  const recommendations = $('#deviceCareRecommendations');
  const updated = $('#deviceCareUpdated');
  if (!score || !metrics || !recommendations) return;

  score.textContent = String(report.health.score);
  scoreLabel.textContent = report.health.label;
  score.closest('.device-care-score')?.setAttribute('data-health', report.health.label);
  updated.textContent = `마지막 진단 ${new Date(report.checkedAt).toLocaleString('ko-KR')}`;

  const storageValue = report.storage.percent == null ? '확인 불가' : `${report.storage.percent}%`;
  const storageNote = report.storage.usage == null ? '' : `${formatBytes(report.storage.usage)} 사용`;
  metrics.innerHTML = [
    metric('선택 기기', DEVICE_TYPES[report.deviceType]?.label || '기타', '점수는 현재 브라우저 범위'),
    metric('브라우저', report.browser, report.platform),
    metric('My EKODI 응답', report.latencyMs == null ? '확인 불가' : `${report.latencyMs}ms`, report.network.effectiveType || (report.network.online ? '온라인' : '오프라인')),
    metric('브라우저 저장공간', storageValue, storageNote),
    metric('처리 스레드', report.cpuThreads == null ? '확인 불가' : `${report.cpuThreads}개`, report.memoryGb == null ? '' : `메모리 힌트 ${report.memoryGb}GB`),
    metric('EKODI 캐시', report.webApp.ekodiCacheCount == null ? '확인 불가' : `${report.webApp.ekodiCacheCount}개`, '현재 EKODI 출처만 대상'),
  ].join('');

  recommendations.innerHTML = report.health.recommendations.map(item => `
    <article data-level="${esc(item.level)}">
      <span aria-hidden="true">${item.level === 'high' ? '!' : item.level === 'good' ? '✓' : '•'}</span>
      <div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div>
    </article>`).join('');
}

function setBusy(busy, message = '') {
  const diagnose = $('#deviceCareDiagnose');
  const optimize = $('#deviceCareOptimize');
  const status = $('#deviceCareStatus');
  if (diagnose) diagnose.disabled = busy || !session;
  if (optimize) optimize.disabled = busy || !session;
  if (status && message) status.textContent = message;
}

async function diagnose() {
  if (!session) return;
  setBusy(true, `${currentType().label}에서 열린 이 브라우저의 EKODI 웹 환경을 확인하고 있습니다…`);
  try {
    lastReport = await collectReport();
    saveHistory(lastReport);
    renderReport(lastReport);
    renderHistory();
    setBusy(false, `진단 완료. ${currentType().label} 전체가 아니라 현재 브라우저 범위의 결과이며 이 브라우저에만 저장됩니다.`);
  } catch (error) {
    console.warn('[EKODI Device Care] diagnosis failed', error);
    setBusy(false, '진단을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

async function safeOptimize() {
  if (!session) return;
  const confirmed = window.confirm(`현재 ${currentType().label}의 EKODI 웹 환경에서 EKODI 전용 캐시 갱신과 서비스워커 업데이트만 실행합니다. 다른 사이트 데이터, 개인 파일, OS·POS·센서·로봇 설정은 변경하지 않습니다. 진행할까요?`);
  if (!confirmed) return;
  setBusy(true, 'EKODI 웹 환경만 안전하게 갱신하고 있습니다…');
  let removed = 0;
  let updated = 0;
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) {
        if (!CACHE_ALLOWLIST.test(name)) continue;
        if (await caches.delete(name)) removed += 1;
      }
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        try {
          await registration.update();
          updated += 1;
        } catch {}
      }
    }
    performance.clearResourceTimings?.();
    lastReport = await collectReport();
    saveHistory(lastReport);
    renderReport(lastReport);
    renderHistory();
    setBusy(false, `안전 최적화 완료. EKODI 캐시 ${removed}개 정리, 서비스워커 ${updated}개 갱신. ${currentType().label} 자체 설정은 변경하지 않았습니다.`);
  } catch (error) {
    console.warn('[EKODI Device Care] safe optimization failed', error);
    setBusy(false, '안전 최적화를 완료하지 못했습니다. 기기 설정은 임의로 변경하지 않았습니다.');
  }
}

function authUi() {
  const gate = $('#deviceCareGate');
  const panel = $('#deviceCarePanel');
  const status = $('#deviceCareStatus');
  if (!enabled) {
    if (gate) gate.hidden = false;
    if (panel) panel.hidden = true;
    if (gate) gate.innerHTML = '<strong>현재 개인 데이터 연결이 비활성화되어 있습니다.</strong><p>실서비스 환경에서 EKODI 로그인 후 사용할 수 있습니다.</p>';
    return;
  }
  const signedIn = Boolean(session);
  if (gate) gate.hidden = signedIn;
  if (panel) panel.hidden = !signedIn;
  if (status && signedIn && !lastReport) status.textContent = `진단 시작을 누르면 ${currentType().label}의 현재 브라우저 범위만 확인합니다.`;
  setBusy(false);
}

async function init() {
  renderDeviceTypeUi();
  renderHistory();
  $('#deviceCareDiagnose')?.addEventListener('click', diagnose);
  $('#deviceCareOptimize')?.addEventListener('click', safeOptimize);
  $('#deviceCareLogin')?.addEventListener('click', () => {
    const target = encodeURIComponent(`${location.origin}${location.pathname}#device-care`);
    location.assign(`https://auth.ekodi.kr/?site=my&return_to=${target}`);
  });

  if (!sb) {
    authUi();
    return;
  }

  try {
    const { data } = await sb.auth.getSession();
    session = data.session || null;
  } catch {
    session = null;
  }
  authUi();
  sb.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession || null;
    authUi();
  });
}

init();
