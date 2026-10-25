// EKODI Growth OS v0.1 — a tenant-scoped, read-only orchestration contract.
// Existing Marketing Growth auth resolves the caller's subject BEFORE invoking this module.
import { d1SchemaReady } from './d1-schema-readiness.js';
import { channelCatalogSnapshot } from './channel-publishing-catalog.js';
import { mallGrowthDashboardSnapshot } from './mall-growth-dashboard.js';

export const GROWTH_OS_VERSION = '0.1.0';
export const GROWTH_OS_PILLARS = Object.freeze([
  'discovery', 'content', 'commerce', 'relationship', 'intelligence', 'governance',
]);
const toCount = value => Math.max(0, Number(value) || 0);
const plain = value => String(value ?? '').trim();
const KNOWN_TYPES = new Set(['person', 'tenant', 'store']);

export function deriveGrowthOs({ subject, campaigns = {}, connections = [], catalog = [], mall = null, at = new Date().toISOString() }) {
  const total = toCount(campaigns.total);
  const awaitingApproval = toCount(campaigns.awaiting_approval);
  const failed = toCount(campaigns.failed);
  const active = connections.filter(row => row.status === 'active').reduce((sum, row) => sum + toCount(row.total), 0);
  const degradedConnections = connections.filter(row => row.status !== 'active').reduce((sum, row) => sum + toCount(row.total), 0);
  const mallReady = mall?.ok === true && mall?.schemaReady === true;
  const performance = mallReady ? {
    source: 'affiliate_product_performance_daily',
    observedOrders30d: toCount(mall.performance30d?.orders),
    observedCommission30dKrw: toCount(mall.performance30d?.observedCommissionKrw),
    campaignVisits30d: toCount(mall.performance30d?.campaignVisits),
    outboundAffiliateClicks30d: toCount(mall.performance30d?.outboundAffiliateClicks),
    latestMetricDate: mall.performance30d?.latestMetricDate || null,
    attribution: 'No causal attribution: channel value estimates are excluded',
  } : null;
  const pillars = {
    discovery: { status: 'telemetry_not_connected', evidence: 'SEO/AEO/GEO search impressions and AI citations are not integrated into this contract' },
    content: { status: total ? 'campaigns_tracked' : 'no_campaigns', campaigns: total, awaitingApproval, failed },
    commerce: { status: mallReady ? 'observed_mall_metrics' : 'not_connected', performance },
    relationship: { status: 'crm_not_connected', evidence: 'No CRM retention or customer PII is included' },
    intelligence: { status: mallReady && mall.performance30d?.reportReady ? 'observed_data' : 'metrics_not_ready',
      latestMetricDate: performance?.latestMetricDate || null },
    governance: { status: 'enforced', readOnly: true, paidActivation: false, autonomousExternalPublishing: false,
      requiresHumanApproval: ['external_posting', 'ad_spend', 'customer_contact', 'personal_data_processing'] },
  };
  const nextActions = [];
  if (!active) nextActions.push({ id: 'connect_channels', priority: 'high', action: 'Verify a subject-owned OAuth connection before publication', mode: 'human_approval' });
  if (degradedConnections) nextActions.push({ id: 'repair_connections', priority: 'high', action: 'Review expired/paused/error connections', mode: 'manual_review' });
  if (awaitingApproval) nextActions.push({ id: 'review_campaigns', priority: 'high', action: 'Review campaign drafts awaiting approval', mode: 'human_approval' });
  if (failed) nextActions.push({ id: 'inspect_failures', priority: 'high', action: 'Inspect failed campaigns before retry', mode: 'manual_review' });
  if (!mallReady && subject.type === 'tenant' && subject.key === 'ekodimall') nextActions.push({ id: 'repair_mall_metrics', priority: 'high', action: 'Verify mall reporting schema and source freshness', mode: 'manual_review' });
  nextActions.push({ id: 'integrate_discovery', priority: 'planned', action: 'Connect verified search/AI citation telemetry per authorized site', mode: 'read_only_integration' });
  nextActions.push({ id: 'integrate_relationship', priority: 'planned', action: 'Define aggregate CRM retention contract without raw customer PII', mode: 'human_review' });
  return {
    ok: true, service: 'EKODI Growth OS', version: GROWTH_OS_VERSION, generatedAt: at,
    subject: { type: subject.type, key: subject.key },
    capabilities: GROWTH_OS_PILLARS, pillars,
    campaigns: { total, active: toCount(campaigns.active), awaitingApproval, failed,
      organic: toCount(campaigns.organic), paid: toCount(campaigns.paid), latestUpdatedAt: campaigns.latest_updated_at || null },
    channels: { activeConnections: active, degradedConnections,
      providers: connections.map(row => ({ provider: plain(row.provider).slice(0, 40), status: plain(row.status).slice(0, 20), count: toCount(row.total) })),
      catalog: catalog.map(item => ({ id: item.id, label: item.label, state: item.state,
        automaticPublishing: Boolean(item.automationAdapter && item.automaticPublishing) })) },
    nextActions, execution: { mode: 'read_only', changesExecuted: 0, requiresOrchestrator: true,
      approvalBoundary: 'No spending, posting, messaging or changes from overview endpoint' },
    dataQuality: { allSitesIntegrated: false, searchAI: 'not_connected', crm: 'not_connected',
      commerce: mallReady ? 'mall_only' : 'not_connected', unknownIsNotZero: true },
  };
}

export async function growthOsSnapshot(env, subject, { platform = {}, mallDashboard = mallGrowthDashboardSnapshot } = {}) {
  if (!env?.DB || !KNOWN_TYPES.has(subject?.type) || !plain(subject?.key) || plain(subject.key).length > 160) {
    return { ok: false, error: 'SUBJECT_INVALID', status: 400 };
  }
  if (!(await d1SchemaReady(env.DB, ['marketing_growth_campaigns', 'marketing_oauth_connections']))) {
    return { ok: false, error: 'SCHEMA_NOT_READY', status: 503 };
  }
  const [campaigns, connectionRows, mall] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN approval_state='draft' THEN 1 ELSE 0 END) AS awaiting_approval,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN mode='organic' THEN 1 ELSE 0 END) AS organic,
      SUM(CASE WHEN mode='paid' THEN 1 ELSE 0 END) AS paid,
      MAX(updated_at) AS latest_updated_at
      FROM marketing_growth_campaigns WHERE subject_type=? AND subject_key=?`)
      .bind(subject.type, subject.key).first(),
    env.DB.prepare(`SELECT provider, status, COUNT(*) AS total
      FROM marketing_oauth_connections WHERE subject_type=? AND subject_key=?
      GROUP BY provider, status ORDER BY provider, status`)
      .bind(subject.type, subject.key).all(),
    subject.type === 'tenant' && subject.key === 'ekodimall' ? mallDashboard(env) : Promise.resolve(null),
  ]);
  return deriveGrowthOs({
    subject, campaigns: campaigns || {}, connections: connectionRows?.results || [],
    mall, catalog: channelCatalogSnapshot(platform),
  });
}
