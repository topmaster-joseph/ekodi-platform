function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))];
}

function stableHash(seed = '') {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function serviceSignals(overview = {}) {
  const services = Array.isArray(overview.services) ? overview.services : [];
  const active = services.filter(service => service?.state === 'active' && service?.monitorEnabled !== false);
  const offline = active.filter(service => service?.latest?.status === 'offline');
  const degraded = active.filter(service => service?.latest?.status === 'degraded');
  const slow = active.filter(service => {
    if (['offline', 'degraded'].includes(String(service?.latest?.status || ''))) return false;
    const response = Number(service?.latest?.responseTime ?? service?.stats24h?.averageResponseTime ?? 0);
    return Number.isFinite(response) && response >= 2500;
  });
  return {
    activeCount: active.length,
    offline: offline.map(service => text(service.name || service.domain || service.id, 120)),
    degraded: degraded.map(service => text(service.name || service.domain || service.id, 120)),
    slow: slow.map(service => text(service.name || service.domain || service.id, 120)),
  };
}

function evolutionSignals(evolution = {}) {
  const items = Array.isArray(evolution.recommendations)
    ? evolution.recommendations
    : Array.isArray(evolution?.live?.recommendations)
      ? evolution.live.recommendations
      : [];
  const visible = items.filter(item => item?.publishable !== false);
  const decisions = visible.filter(item => item?.approval?.required === true);
  const material = visible.filter(item => Number(item?.score || 0) >= 90 && Number(item?.confidence || 0) >= 80);
  return {
    decisions: decisions.map(item => ({
      id: text(item.id || item.target || item.title, 160),
      title: text(item.title || item.summary || '중요 진화 결정', 180),
    })),
    material: material.map(item => ({
      id: text(item.id || item.target || item.title, 160),
      title: text(item.title || item.summary || '중요 진화 제안', 180),
      approvalRequired: item?.approval?.required === true,
    })),
  };
}

function previousIncident(previous = null) {
  return ['attention-required', 'owner-decision-required'].includes(String(previous?.category || ''));
}

export function buildEkodiOwnerReport(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const previous = input.previous || null;
  const service = serviceSignals(input.overview || {});
  const evolution = evolutionSignals(input.evolution || {});

  const offline = unique(service.offline);
  const degraded = unique([...service.degraded, ...service.slow]);
  const decisions = evolution.decisions;
  const material = evolution.material.filter(item => !item.approvalRequired);

  let category = 'operating-well';
  let importance = 'info';
  let title = '중요 보고 없음';
  let summary = 'EKODI가 승인된 범위에서 자율운영 중이며 현재 대표가 알아야 할 새로운 중요 변화는 없습니다.';
  let requiredAction = '없음';
  let decisionRequired = false;
  let reason = 'routine_healthy_state_suppressed';

  if (decisions.length) {
    category = 'owner-decision-required';
    importance = 'critical';
    decisionRequired = true;
    title = `대표 결정 필요 · ${decisions[0].title}`;
    summary = decisions.length === 1
      ? 'EKODI가 자율 처리할 수 없는 중요 결정 1건을 분리했습니다.'
      : `EKODI가 자율 처리할 수 없는 중요 결정 ${decisions.length}건을 분리했습니다.`;
    requiredAction = 'AI Ops의 Decision Gate에서 선택지·영향·권고안을 확인해 결정해 주세요.';
    reason = 'sovereign_human_decision_required';
  } else if (offline.length || degraded.length) {
    category = 'attention-required';
    importance = offline.length ? 'high' : 'medium';
    title = offline.length ? `운영 주의 · ${offline[0]} 장애` : `운영 주의 · ${degraded[0]} 상태 저하`;
    const parts = [];
    if (offline.length) parts.push(`오프라인 ${offline.length}개`);
    if (degraded.length) parts.push(`저하/지연 ${degraded.length}개`);
    summary = `EKODI가 ${parts.join(' · ')}를 감지했습니다. 승인 범위의 자동 진단·복구를 계속합니다.`;
    requiredAction = '현재 대표 조치 없음. 권한·비용·비가역 변경이 필요해질 때만 별도 결정 요청합니다.';
    reason = 'material_operational_attention';
  } else if (previousIncident(previous)) {
    category = 'verified-completion';
    importance = 'medium';
    title = '운영 복구 확인';
    summary = '이전 중요 운영 신호가 해소되어 현재 모니터링 대상에서 장애·저하 상태가 확인되지 않습니다.';
    requiredAction = '없음';
    reason = 'previous_material_state_verified_recovered';
  } else if (material.length) {
    category = 'attention-required';
    importance = 'medium';
    title = `중요 개선 후보 · ${material[0].title}`;
    summary = material.length === 1
      ? '검증 근거가 높은 개선 후보 1건을 발견했습니다. 저위험·가역 범위의 검증을 우선합니다.'
      : `검증 근거가 높은 개선 후보 ${material.length}건을 발견했습니다. 저위험·가역 범위의 검증을 우선합니다.`;
    requiredAction = '현재 대표 조치 없음. 유료·권한확대·비가역 단계에서만 결정 요청합니다.';
    reason = 'material_evolution_candidate';
  }

  const signal = {
    category,
    offline,
    degraded,
    decisions: decisions.map(item => item.id),
    material: material.map(item => item.id),
  };
  const signature = stableHash(JSON.stringify(signal));
  const duplicateOfPrevious = Boolean(previous?.signature && previous.signature === signature);
  const shouldPersist = category !== 'operating-well' && !duplicateOfPrevious;
  const id = `owner_report_${Date.parse(generatedAt) || Date.now()}_${signature}`;

  return freeze({
    schemaVersion: 1,
    id,
    reportAuthor: 'EKODI Orchestrator',
    reportOwner: 'ekodi-orchestrator',
    triggerOwner: 'ekodi-internal-scheduler',
    chatgptTriggerRequired: false,
    generatedAt,
    category,
    importance,
    title,
    summary,
    requiredAction,
    decisionRequired,
    reason,
    signature,
    shouldPersist,
    duplicateOfPrevious,
    evidence: {
      activeMonitoredServices: service.activeCount,
      offline,
      degraded,
      decisionIds: decisions.map(item => item.id),
      materialEvolutionIds: material.map(item => item.id),
    },
  });
}

function db(input) {
  const value = input?.DB || input;
  if (!value?.prepare) throw new Error('EKODI_OWNER_REPORT_DB_REQUIRED');
  return value;
}

function parseEvidence(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function rowToReport(row = {}) {
  return freeze({
    id: row.id,
    reportAuthor: row.report_author,
    reportOwner: row.report_owner,
    category: row.category,
    importance: row.importance,
    title: row.title,
    summary: row.summary,
    requiredAction: row.required_action,
    decisionRequired: Number(row.decision_required || 0) === 1,
    reason: row.reason,
    signature: row.signature,
    generatedAt: row.generated_at,
    evidence: parseEvidence(row.evidence_json),
  });
}

export async function latestEkodiOwnerReport(input) {
  const database = db(input);
  const row = await database.prepare(`SELECT id, report_author, report_owner, category, importance, title, summary,
      required_action, decision_required, reason, signature, evidence_json, generated_at
    FROM ekodi_owner_reports ORDER BY generated_at DESC, created_at DESC LIMIT 1`).first();
  return row ? rowToReport(row) : null;
}

export async function listEkodiOwnerReports(input, options = {}) {
  const database = db(input);
  const limit = Math.max(1, Math.min(50, Number(options.limit || 10) || 10));
  const rows = await database.prepare(`SELECT id, report_author, report_owner, category, importance, title, summary,
      required_action, decision_required, reason, signature, evidence_json, generated_at
    FROM ekodi_owner_reports ORDER BY generated_at DESC, created_at DESC LIMIT ?`).bind(limit).all();
  return freeze((rows?.results || []).map(rowToReport));
}

export async function persistEkodiOwnerReport(input, report = {}) {
  const database = db(input);
  if (report.shouldPersist !== true) return freeze({ persisted:false, reason:report.duplicateOfPrevious ? 'duplicate_suppressed' : 'routine_suppressed' });
  await database.prepare(`INSERT INTO ekodi_owner_reports
    (id, report_author, report_owner, category, importance, title, summary, required_action,
     decision_required, reason, signature, evidence_json, generated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      text(report.id, 160),
      text(report.reportAuthor || 'EKODI Orchestrator', 80),
      text(report.reportOwner || 'ekodi-orchestrator', 80),
      text(report.category, 60),
      text(report.importance, 30),
      text(report.title, 220),
      text(report.summary, 700),
      text(report.requiredAction, 500),
      report.decisionRequired === true ? 1 : 0,
      text(report.reason, 100),
      text(report.signature, 100),
      JSON.stringify(report.evidence || {}),
      report.generatedAt || new Date().toISOString(),
      new Date().toISOString(),
    ).run();
  return freeze({ persisted:true, id:report.id });
}
