(() => {
  'use strict';

  const CACHE_ALLOWLIST = /^(ekodi|admin-ekodi|ekodi-admin)([-_:].*)?$/i;
  const PANEL_ID = 'adminDeviceBrowserDiagnostics';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[char]);
  }

  function browserLabel() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Microsoft Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua)) return 'Google Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return '웹 브라우저';
  }

  function platformLabel() {
    return navigator.userAgentData?.platform || navigator.platform || '확인 불가';
  }

  function connectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      online: navigator.onLine !== false,
      effectiveType: connection?.effectiveType || null,
      downlink: Number.isFinite(connection?.downlink) ? connection.downlink : null,
      saveData: Boolean(connection?.saveData),
    };
  }

  async function measureLatency(samples = 3) {
    const values = [];
    for (let i = 0; i < samples; i += 1) {
      const started = performance.now();
      try {
        const response = await fetch(`/compact-control-center.js?device-self-check=${Date.now()}-${i}`, {
          cache:'no-store', credentials:'same-origin',
        });
        if (response.ok) values.push(performance.now() - started);
      } catch {}
    }
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  async function storageInfo() {
    if (!navigator.storage?.estimate) return { usage:null, quota:null, percent:null };
    try {
      const estimate = await navigator.storage.estimate();
      const usage = Number(estimate.usage), quota = Number(estimate.quota);
      return {
        usage: Number.isFinite(usage) ? usage : null,
        quota: Number.isFinite(quota) ? quota : null,
        percent: Number.isFinite(usage) && Number.isFinite(quota) && quota > 0
          ? Math.round((usage / quota) * 100) : null,
      };
    } catch {
      return { usage:null, quota:null, percent:null };
    }
  }

  async function webState() {
    const state = { serviceWorkers:null, cacheCount:null, ekodiCacheCount:null };
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
    if (!entry) return { loadMs:null, domMs:null };
    return {
      loadMs: Number.isFinite(entry.loadEventEnd) ? Math.round(entry.loadEventEnd) : null,
      domMs: Number.isFinite(entry.domContentLoadedEventEnd) ? Math.round(entry.domContentLoadedEventEnd) : null,
    };
  }

  function scoreReport(report) {
    let score = 100;
    const recommendations = [];
    if (!report.network.online) {
      score -= 35;
      recommendations.push('인터넷 연결을 확인하세요.');
    }
    if (report.latencyMs != null && report.latencyMs > 1200) {
      score -= 18;
      recommendations.push(`관리자 페이지 응답이 평균 ${report.latencyMs}ms로 느립니다.`);
    } else if (report.latencyMs != null && report.latencyMs > 500) {
      score -= 8;
      recommendations.push(`관리자 페이지 응답이 평균 ${report.latencyMs}ms입니다.`);
    }
    if (report.storage.percent != null && report.storage.percent >= 90) {
      score -= 18;
      recommendations.push(`브라우저 저장공간 사용률이 약 ${report.storage.percent}%입니다.`);
    }
    if (report.web.ekodiCacheCount > 2) {
      score -= 4;
      recommendations.push('EKODI 관리자 전용 캐시를 안전 최적화로 정리할 수 있습니다.');
    }
    if (report.navigation.loadMs != null && report.navigation.loadMs > 4000) {
      score -= 8;
      recommendations.push(`현재 관리자 화면 전체 로딩에 약 ${report.navigation.loadMs}ms가 걸렸습니다.`);
    }
    if (!recommendations.length) recommendations.push('현재 관리자 브라우저에서 즉시 처리할 문제를 찾지 못했습니다.');
    score = Math.max(0, Math.min(100, score));
    return { score, label:score >= 90 ? '좋음' : score >= 75 ? '관찰' : score >= 55 ? '주의' : '점검 필요', recommendations };
  }

  async function collectReport() {
    const [latencyMs, storage, web] = await Promise.all([measureLatency(), storageInfo(), webState()]);
    const report = {
      checkedAt:new Date().toISOString(), browser:browserLabel(), platform:platformLabel(),
      cpuThreads:Number(navigator.hardwareConcurrency) || null,
      memoryGb:Number(navigator.deviceMemory) || null,
      network:connectionInfo(), latencyMs, storage, web, navigation:navigationInfo(),
    };
    report.health = scoreReport(report);
    return report;
  }

  function renderReport(host, report) {
    const result = host.querySelector('[data-browser-diagnostic-result]');
    const network = report.network.online
      ? `${report.network.effectiveType || '온라인'}${report.network.downlink ? ` · ${report.network.downlink}Mbps` : ''}`
      : '오프라인';
    result.innerHTML = `
      <div class="admin-browser-score"><strong>${report.health.score}</strong><span>/100 · ${esc(report.health.label)}</span></div>
      <div class="admin-browser-stats">
        <span><small>브라우저</small><b>${esc(report.browser)}</b></span>
        <span><small>플랫폼</small><b>${esc(report.platform)}</b></span>
        <span><small>CPU 스레드</small><b>${report.cpuThreads ?? '—'}</b></span>
        <span><small>메모리 힌트</small><b>${report.memoryGb ? `${report.memoryGb}GB` : '—'}</b></span>
        <span><small>네트워크</small><b>${esc(network)}</b></span>
        <span><small>응답시간</small><b>${report.latencyMs != null ? `${report.latencyMs}ms` : '—'}</b></span>
        <span><small>웹 저장공간</small><b>${report.storage.percent != null ? `${report.storage.percent}%` : '—'}</b></span>
        <span><small>EKODI 캐시</small><b>${report.web.ekodiCacheCount ?? '—'}</b></span>
      </div>
      <div class="admin-browser-recommendations">${report.health.recommendations.map(item => `<p>${esc(item)}</p>`).join('')}</div>`;
    result.hidden = false;
    const stamp = host.querySelector('[data-browser-diagnostic-stamp]');
    stamp.textContent = `최근 진단 ${new Date(report.checkedAt).toLocaleString('ko-KR')}`;
  }

  async function safeOptimize(host) {
    if (!window.confirm('admin.ekodi.kr의 EKODI 전용 캐시와 Service Worker 업데이트만 진행합니다. 로그인 정보, 다른 사이트 데이터, 개인 파일은 건드리지 않습니다. 계속할까요?')) return;
    const button = host.querySelector('[data-browser-safe-optimize]');
    button.disabled = true;
    const messages = [];
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        const targets = names.filter(name => CACHE_ALLOWLIST.test(name));
        await Promise.all(targets.map(name => caches.delete(name)));
        messages.push(`EKODI 캐시 ${targets.length}개 정리`);
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.update()));
        messages.push(`Service Worker ${registrations.length}개 업데이트 확인`);
      }
      performance.clearResourceTimings?.();
      host.querySelector('[data-browser-diagnostic-status]').textContent = messages.length ? `${messages.join(' · ')} 완료` : '정리할 항목이 없었습니다.';
      const report = await collectReport();
      renderReport(host, report);
    } catch (error) {
      host.querySelector('[data-browser-diagnostic-status]').textContent = `안전 최적화 실패: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function install() {
    const panel = document.querySelector('#deviceControlPanel');
    if (!panel || document.getElementById(PANEL_ID)) return;
    const section = document.createElement('section');
    section.id = PANEL_ID;
    section.className = 'admin-browser-diagnostic';
    section.innerHTML = `
      <div class="admin-browser-diagnostic-head">
        <div><p class="kicker">CURRENT ADMIN BROWSER</p><h3>현재 관리자 브라우저 진단</h3><p>이 브라우저와 admin.ekodi.kr 웹 환경만 확인합니다. Windows 설정, 다른 사이트 데이터, 개인 파일에는 접근하지 않습니다.</p></div>
        <span data-browser-diagnostic-stamp>아직 진단하지 않음</span>
      </div>
      <div class="admin-browser-diagnostic-actions">
        <button type="button" class="primary" data-browser-diagnose>현재 브라우저 진단</button>
        <button type="button" class="secondary" data-browser-safe-optimize>안전 최적화</button>
        <small data-browser-diagnostic-status>결과는 현재 브라우저에만 표시하며 서버로 업로드하지 않습니다.</small>
      </div>
      <div class="admin-browser-diagnostic-result" data-browser-diagnostic-result hidden></div>`;
    const metrics = panel.querySelector('.device-metrics');
    if (metrics) metrics.insertAdjacentElement('afterend', section); else panel.prepend(section);

    section.querySelector('[data-browser-diagnose]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      section.querySelector('[data-browser-diagnostic-status]').textContent = '현재 브라우저를 진단하고 있습니다…';
      try {
        const report = await collectReport();
        renderReport(section, report);
        section.querySelector('[data-browser-diagnostic-status]').textContent = '진단 완료 · 서버 업로드 없음';
      } catch (error) {
        section.querySelector('[data-browser-diagnostic-status]').textContent = `진단 실패: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
    section.querySelector('[data-browser-safe-optimize]').addEventListener('click', () => safeOptimize(section));
  }

  install();
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-nav-changed', install);
})();
