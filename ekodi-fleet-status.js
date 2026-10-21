// EKODI Fleet Status Aggregator — read-only operator read-model.
//
// Purpose: join the existing control-plane signals (D1 service health
// read-model + the autonomic digital-twin rollup) into ONE "one-glance"
// fleet view. It unifies what already exists; it does not probe, deploy,
// mutate, or re-implement the self-healing / guarded-rollback machinery.
//
// Design contract:
//   - Pure functions only. No network, no D1, no env, no mutation.
//   - All inputs are plain rows/objects the caller already holds.
//   - Safe to bundle in any worker and to unit-test in isolation.
//
// The caller (a read-only GET route) supplies:
//   latestChecks[]      rows from D1 `service_check_latest`
//   environmentChecks[] rows from D1 `cloudflare_environment_checks`
//   twin                the control-plane digital-twin rollup (optional)
//   registryServices[]  canonical service registry entries (optional)
//   now                 ISO timestamp (optional; defaults to Date.now)
//   freshnessMs         staleness threshold (optional; default 2h)

export const EKODI_FLEET_STATUS = Object.freeze({
  moduleId: 'EKODI-FLEET-STATUS-001',
  version: '1.0.0',
  role: 'read-model-aggregator',
  mutation: false,
  probesNetwork: false,
});

const DEFAULT_FRESHNESS_MS = 2 * 60 * 60 * 1000; // 2h

// Normalize the many status spellings into four operator-facing states.
const STATUS_ALIASES = Object.freeze({
  online: 'online', ok: 'online', healthy: 'online', up: 'online', live: 'online', pass: 'online', green: 'online',
  degraded: 'degraded', warn: 'degraded', warning: 'degraded', slow: 'degraded', partial: 'degraded', yellow: 'degraded',
  offline: 'offline', down: 'offline', fail: 'offline', error: 'offline', critical: 'offline', red: 'offline',
});

// Worse status wins when rolling several checks into one service row.
const STATUS_SEVERITY = Object.freeze({ online: 0, unknown: 1, degraded: 2, offline: 3 });

function normalizeStatus(raw) {
  const key = String(raw == null ? '' : raw).trim().toLowerCase();
  return STATUS_ALIASES[key] || (key ? 'unknown' : 'unknown');
}

function worse(a, b) {
  return (STATUS_SEVERITY[b] ?? 1) > (STATUS_SEVERITY[a] ?? 1) ? b : a;
}

function parseTime(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Build the unified fleet-status read-model.
 * Returns a frozen plain object; never throws on partial/empty input.
 */
export function buildFleetStatus(input = {}) {
  const now = parseTime(input.now) || Date.now();
  const nowIso = new Date(now).toISOString();
  const freshnessMs = Number.isFinite(input.freshnessMs) && input.freshnessMs > 0
    ? input.freshnessMs
    : DEFAULT_FRESHNESS_MS;

  const latestChecks = asArray(input.latestChecks);
  const environmentChecks = asArray(input.environmentChecks);
  const registryServices = asArray(input.registryServices);
  const twin = input.twin && typeof input.twin === 'object' ? input.twin : null;

  // service_id -> aggregated service record
  const services = new Map();

  const ensure = (id, seed = {}) => {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!services.has(key)) {
      services.set(key, {
        id: key,
        name: key,
        inRegistry: false,
        registryStatus: null,
        url: null,
        latest: null,
        environments: [],
        monitored: false,
        worstStatus: 'unknown',
        stale: false,
      });
    }
    const rec = services.get(key);
    if (seed.name && rec.name === rec.id) rec.name = String(seed.name);
    if (seed.url && !rec.url) rec.url = String(seed.url);
    return rec;
  };

  // 1) Canonical registry — the "what should exist" universe.
  for (const svc of registryServices) {
    if (!svc || !svc.id) continue;
    const rec = ensure(svc.id, { name: svc.name || svc.nameEn, url: svc.url });
    rec.inRegistry = true;
    rec.registryStatus = svc.status || (svc.productionVerified ? 'live' : null);
  }

  // 2) Per-service latest health (service_check_latest).
  for (const row of latestChecks) {
    if (!row || !row.service_id) continue;
    const rec = ensure(row.service_id);
    if (!rec) continue;
    const status = normalizeStatus(row.status);
    const checkedAtMs = parseTime(row.checked_at);
    const stale = checkedAtMs != null && now - checkedAtMs > freshnessMs;
    rec.latest = {
      status,
      httpStatus: toInt(row.http_status),
      responseMs: toInt(row.response_ms),
      detail: String(row.detail || '').slice(0, 300),
      checkedAt: row.checked_at || null,
      stale,
    };
    rec.monitored = true;
  }

  // 3) Per-environment health (cloudflare_environment_checks).
  for (const row of environmentChecks) {
    if (!row || !row.service_id) continue;
    const rec = ensure(row.service_id, { name: row.service_name });
    if (!rec) continue;
    const status = normalizeStatus(row.status);
    const checkedAtMs = parseTime(row.checked_at);
    const stale = checkedAtMs != null && now - checkedAtMs > freshnessMs;
    rec.environments.push({
      environment: String(row.environment || 'unknown'),
      host: row.host ? String(row.host) : null,
      status,
      httpStatus: toInt(row.http_status),
      responseMs: toInt(row.response_ms),
      checkedAt: row.checked_at || null,
      stale,
    });
    rec.monitored = true;
  }

  // Roll each service to a single worst status + staleness.
  const rows = [];
  for (const rec of services.values()) {
    let worst = null;
    let anyStale = false;
    const fold = (status) => { worst = worst == null ? status : worse(worst, status); };
    if (rec.latest) {
      fold(rec.latest.status);
      anyStale = anyStale || rec.latest.stale;
    }
    for (const env of rec.environments) {
      fold(env.status);
      anyStale = anyStale || env.stale;
    }
    // A service with no health signal at all is a blind spot → unknown.
    if (worst == null) worst = 'unknown';
    rec.worstStatus = worst;
    rec.stale = anyStale;
    rec.environments.sort((a, b) => a.environment.localeCompare(b.environment));
    rows.push(rec);
  }

  rows.sort((a, b) => {
    const s = (STATUS_SEVERITY[b.worstStatus] ?? 1) - (STATUS_SEVERITY[a.worstStatus] ?? 1);
    return s !== 0 ? s : a.id.localeCompare(b.id);
  });

  // Counts.
  const counts = { online: 0, degraded: 0, offline: 0, unknown: 0, stale: 0, total: rows.length };
  for (const rec of rows) {
    counts[rec.worstStatus] = (counts[rec.worstStatus] || 0) + 1;
    if (rec.stale) counts.stale += 1;
  }

  // Blind spots: in the registry but never health-checked, or checked but
  // not in the registry (running-but-uncatalogued).
  const unmonitored = rows.filter(r => r.inRegistry && !r.monitored).map(r => r.id);
  const uncatalogued = rows.filter(r => r.monitored && !r.inRegistry).map(r => r.id);

  // Overall health, folding in the twin rollup when present.
  let overall = 'healthy';
  if (counts.offline > 0) overall = 'critical';
  else if (counts.degraded > 0 || counts.stale > 0) overall = 'degraded';
  else if (counts.unknown > 0) overall = 'partial';
  const twinHealth = twin && typeof twin.health === 'string' ? twin.health : null;
  if (twinHealth === 'drift' && overall === 'healthy') overall = 'degraded';
  if (twinHealth === 'partially_observed' && overall === 'healthy') overall = 'partial';

  const OVERALL_LABEL = {
    healthy: '정상', partial: '부분 관측', degraded: '주의', critical: '위험',
  };

  return Object.freeze({
    schemaVersion: 1,
    moduleId: EKODI_FLEET_STATUS.moduleId,
    generatedAt: nowIso,
    freshnessMs,
    mutation: false,
    overall: Object.freeze({
      health: overall,
      label: OVERALL_LABEL[overall] || overall,
      counts: Object.freeze(counts),
    }),
    twin: twin ? Object.freeze({
      health: twinHealth,
      summary: twin.summary && typeof twin.summary === 'object' ? twin.summary : null,
      generatedAt: twin.generatedAt || null,
    }) : null,
    blindSpots: Object.freeze({
      unmonitoredCount: unmonitored.length,
      unmonitored,
      uncataloguedCount: uncatalogued.length,
      uncatalogued,
    }),
    services: Object.freeze(rows.map(r => Object.freeze({
      ...r,
      environments: Object.freeze(r.environments.map(e => Object.freeze(e))),
      latest: r.latest ? Object.freeze(r.latest) : null,
    }))),
    sources: Object.freeze({
      latestChecks: latestChecks.length,
      environmentChecks: environmentChecks.length,
      registryServices: registryServices.length,
      twin: Boolean(twin),
    }),
  });
}

const STATUS_COLOR = Object.freeze({
  online: '#1f9d55', degraded: '#d97706', offline: '#dc2626', unknown: '#6b7280',
});
const STATUS_TEXT = Object.freeze({
  online: '정상', degraded: '주의', offline: '중단', unknown: '미관측',
});

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the read-model as a self-contained, mobile-friendly HTML page.
 * No external scripts or styles; safe to return directly from a worker.
 */
export function renderFleetStatusHtml(model) {
  const m = model && typeof model === 'object' ? model : buildFleetStatus({});
  const c = m.overall.counts;
  const pill = (status) => `<span class="pill" style="background:${STATUS_COLOR[status] || STATUS_COLOR.unknown}">${esc(STATUS_TEXT[status] || status)}</span>`;
  const headColor = STATUS_COLOR[({ healthy: 'online', partial: 'unknown', degraded: 'degraded', critical: 'offline' }[m.overall.health]) || 'unknown'];

  const serviceRows = m.services.map((s) => {
    const envs = s.environments.length
      ? s.environments.map(e => `${esc(e.environment)}${e.responseMs != null ? ` ${e.responseMs}ms` : ''}`).join(' · ')
      : (s.monitored ? '' : '<em style="color:#9ca3af">관측 없음</em>');
    const last = s.latest?.checkedAt || (s.environments[0] && s.environments[0].checkedAt) || '';
    const flags = [
      s.stale ? '<span class="tag">오래됨</span>' : '',
      s.inRegistry ? '' : '<span class="tag tag-warn">미등록</span>',
      (s.inRegistry && !s.monitored) ? '<span class="tag tag-warn">미관측</span>' : '',
    ].join('');
    return `<tr>
      <td>${pill(s.worstStatus)}</td>
      <td><strong>${esc(s.name)}</strong><br><span class="mono">${esc(s.id)}</span> ${flags}</td>
      <td class="mono small">${envs}</td>
      <td class="mono small">${esc(String(last).replace('T', ' ').replace(/\.\d+Z$/, 'Z'))}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EKODI 함대 상태</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;
    background:#0d1117;color:#e6edf3;line-height:1.5;padding:20px 14px 60px}
  .wrap{max-width:940px;margin:0 auto}
  h1{font-size:19px;font-weight:800;letter-spacing:-.01em}
  .sub{color:#8b949e;font-size:12px;margin-top:4px}
  .banner{display:flex;align-items:center;gap:12px;margin:18px 0;padding:14px 16px;
    border-radius:12px;background:#161b22;border-left:5px solid ${headColor}}
  .banner .h{font-size:22px;font-weight:800}
  .counts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
  .count{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:8px 12px;font-size:13px}
  .count b{font-size:17px;display:block}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th{text-align:left;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;
    border-bottom:1px solid #21262d;padding:8px 8px}
  td{border-bottom:1px solid #161b22;padding:9px 8px;vertical-align:top}
  .pill{display:inline-block;color:#fff;font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .small{font-size:11.5px;color:#8b949e}
  .tag{display:inline-block;background:#21262d;color:#8b949e;font-size:10px;padding:1px 6px;border-radius:5px;margin-left:4px}
  .tag-warn{background:#3b2a12;color:#f0a35e}
  .blind{margin-top:22px;background:#161b22;border:1px solid #21262d;border-radius:12px;padding:14px 16px;font-size:13px}
  .blind h2{font-size:13px;color:#f0a35e;margin-bottom:6px}
  footer{margin-top:24px;color:#6b7280;font-size:11px;border-top:1px solid #21262d;padding-top:12px}
</style></head><body><div class="wrap">
  <h1>EKODI 함대 상태 <span class="small">Fleet Status</span></h1>
  <div class="sub">읽기 전용 통합 관제 · ${esc(m.generatedAt)}</div>
  <div class="banner"><div class="h">${esc(m.overall.label)}</div>
    <div class="small">전체 ${c.total}개 서비스 · 정상 ${c.online} · 주의 ${c.degraded} · 중단 ${c.offline} · 미관측 ${c.unknown}${c.stale ? ` · 오래됨 ${c.stale}` : ''}</div></div>
  <div class="counts">
    <div class="count"><b style="color:${STATUS_COLOR.online}">${c.online}</b>정상</div>
    <div class="count"><b style="color:${STATUS_COLOR.degraded}">${c.degraded}</b>주의</div>
    <div class="count"><b style="color:${STATUS_COLOR.offline}">${c.offline}</b>중단</div>
    <div class="count"><b style="color:${STATUS_COLOR.unknown}">${c.unknown}</b>미관측</div>
    ${m.twin ? `<div class="count"><b>${esc(m.twin.health || '—')}</b>digital twin</div>` : ''}
  </div>
  <table><thead><tr><th>상태</th><th>서비스</th><th>환경 · 응답</th><th>최근 점검</th></tr></thead>
    <tbody>${serviceRows || '<tr><td colspan="4" class="small">관측 데이터가 아직 없습니다.</td></tr>'}</tbody></table>
  ${(m.blindSpots.unmonitoredCount || m.blindSpots.uncataloguedCount) ? `<div class="blind">
    <h2>사각지대 (Blind spots)</h2>
    ${m.blindSpots.unmonitoredCount ? `<div>등록됐지만 관측 없음 (${m.blindSpots.unmonitoredCount}): <span class="mono small">${esc(m.blindSpots.unmonitored.join(', '))}</span></div>` : ''}
    ${m.blindSpots.uncataloguedCount ? `<div style="margin-top:6px">실행 중이나 미등록 (${m.blindSpots.uncataloguedCount}): <span class="mono small">${esc(m.blindSpots.uncatalogued.join(', '))}</span></div>` : ''}
  </div>` : ''}
  <footer>읽기 전용 집계 · 변경·배포 없음 · 자동 롤백은 기존 guarded-release가 담당 · ${EKODI_FLEET_STATUS.moduleId} v${EKODI_FLEET_STATUS.version}</footer>
</div></body></html>`;
}
