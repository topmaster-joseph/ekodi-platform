import capabilityRegistry from './config/capability-registry.json' with { type: 'json' };
import policy from './config/ai-entitlement-policy.json' with { type: 'json' };
import { listExecutionServices } from './ai-commons.js';

const LEVEL_RANK = Object.freeze(Object.fromEntries((policy.accessLevels || []).map((item) => [item.id, Number(item.rank) || 0])));
const LEVEL_LABEL = Object.freeze(Object.fromEntries((policy.accessLevels || []).map((item) => [item.id, String(item.label || item.id)])));
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'metered', 'grace']);

function clean(value) { return String(value ?? '').trim(); }
function levelRank(value) { return LEVEL_RANK[clean(value).toLowerCase()] || 0; }
function maxLevel(left, right) { return levelRank(right) > levelRank(left) ? right : left; }
function subscriptionIsActive(row = {}) {
  const planId = clean(row.plan_id || row.planId || 'free').toLowerCase();
  const status = clean(row.status || '').toLowerCase();
  return planId !== 'free' && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}
function commercialLevel(site, planId) {
  const map = policy.paidPlanLevels?.[clean(site).toLowerCase()] || {};
  return clean(map[clean(planId).toLowerCase()] || '').toLowerCase();
}
function capabilityKey(service = {}) {
  if (service.capabilityId) return clean(service.capabilityId);
  const specialist = clean(service.specialistServiceId);
  return specialist ? `service.${specialist}` : `service.${clean(service.id)}`;
}
function subscriptionSite(service = {}) {
  const site = clean(service.membershipSite).toLowerCase();
  return site && site !== 'ai' && site !== 'portal' ? site : '';
}
function owningService(service = {}) {
  return clean(service.specialistServiceId || service.membershipSite || service.category || 'ai').toLowerCase();
}
function targetSurface(service = {}) {
  const target = clean(service.targetUrl);
  const launch = clean(service.launchUrl);
  const surfaces = [{ id:'everyone-ai', label:'모두의 AI', url:launch }];
  if (target && target !== launch) surfaces.push({ id:'owning-service', label:'전문·개별 사이트', url:target });
  return surfaces;
}

export const AI_ENTITLEMENT_POLICY = Object.freeze(policy);

export function aiEntitlementDefinitions() {
  const rows = [];
  for (const category of listExecutionServices(capabilityRegistry)) {
    for (const service of category.services || []) {
      const key = capabilityKey(service);
      if (!key) continue;
      rows.push(Object.freeze({
        key,
        serviceId: clean(service.id),
        name: clean(service.label || key),
        description: clean(service.description),
        categoryId: clean(category.id),
        categoryLabel: clean(category.label),
        sourceKind: clean(service.sourceKind || 'common'),
        owningService: owningService(service),
        subscriptionSite: subscriptionSite(service),
        usableNow: service.usableNow === true,
        availability: clean(service.availability || 'integration-pending'),
        accessMode: clean(service.access?.advanced || 'member'),
        paidAvailable: service.access?.paidAvailable === true,
        scope: key.startsWith('site.') ? 'site-addon' : 'shared-capability',
        surfaces: Object.freeze(targetSurface(service)),
      }));
    }
  }
  return Object.freeze(rows);
}

export function effectiveAiEntitlement(definition, subscriptions = new Map(), { authenticated = true } = {}) {
  if (!definition?.usableNow) {
    return Object.freeze({
      level: 'basic',
      label: LEVEL_LABEL.basic || '기본',
      state: 'preview',
      source: 'service-preview',
      planId: null,
      subscriptionSite: definition?.subscriptionSite || '',
    });
  }

  let level = 'basic';
  let source = 'universal-free';
  let planId = null;
  const site = clean(definition.subscriptionSite).toLowerCase();

  if (authenticated && definition.accessMode === 'member') {
    level = maxLevel(level, clean(policy.authenticatedMemberDefaultLevel || 'additional').toLowerCase());
    source = 'authenticated-member';
  }

  if (site) {
    const row = subscriptions.get(site) || null;
    planId = row ? clean(row.plan_id || row.planId || 'free').toLowerCase() : 'free';
    if (row && subscriptionIsActive(row)) {
      const mapped = commercialLevel(site, planId);
      if (mapped) {
        level = maxLevel(level, mapped);
        source = 'service-subscription';
      }
    }
  }

  return Object.freeze({
    level,
    label: LEVEL_LABEL[level] || level,
    state: 'allowed',
    source,
    planId,
    subscriptionSite: site,
  });
}

export function buildAiEntitlementSnapshot({ subject, subscriptions = new Map(), authenticated = true } = {}) {
  const capabilities = aiEntitlementDefinitions().map((definition) => Object.freeze({
    key: definition.key,
    name: definition.name,
    description: definition.description,
    categoryId: definition.categoryId,
    categoryLabel: definition.categoryLabel,
    sourceKind: definition.sourceKind,
    owningService: definition.owningService,
    scope: definition.scope,
    usableNow: definition.usableNow,
    availability: definition.availability,
    surfaces: definition.surfaces,
    access: effectiveAiEntitlement(definition, subscriptions, { authenticated }),
  }));

  const ready = capabilities.filter((item) => item.usableNow);
  const counts = Object.fromEntries((policy.accessLevels || []).map((item) => [
    item.id,
    ready.filter((capability) => capability.access.level === item.id).length,
  ]));

  return Object.freeze({
    policyId: policy.policyId,
    managerUrl: policy.managerUrl,
    subject: subject || null,
    capabilitySharing: policy.capabilitySharing,
    accessLevels: Object.freeze((policy.accessLevels || []).map((item) => Object.freeze({ ...item }))),
    summary: Object.freeze({
      total: capabilities.length,
      ready: ready.length,
      preview: capabilities.length - ready.length,
      byEffectiveLevel: Object.freeze(counts),
    }),
    capabilities: Object.freeze(capabilities),
  });
}

export function authorizeAiCapability(snapshot, capabilityKeyValue, requiredLevel = 'basic') {
  const key = clean(capabilityKeyValue);
  const required = clean(requiredLevel).toLowerCase() || 'basic';
  const capability = snapshot?.capabilities?.find((item) => item.key === key) || null;
  if (!capability || !capability.usableNow) return Object.freeze({ allowed:false, reason:'CAPABILITY_NOT_READY', capability });
  if (levelRank(capability.access?.level) < levelRank(required)) {
    return Object.freeze({ allowed:false, reason:'ENTITLEMENT_LEVEL_REQUIRED', capability, requiredLevel:required });
  }
  return Object.freeze({ allowed:true, reason:'ENTITLED', capability, requiredLevel:required });
}
