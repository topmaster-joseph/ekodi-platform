import { USER_SERVICES } from './generated/user-services.js';

const VALID_MODES = new Set(['platform', 'dev']);
const STATUS_VALUES = new Set(['online', 'degraded', 'offline']);
const MAX_LIVE_AGE_MS = 20 * 60 * 1000;

const GROUP_LABELS = Object.freeze({
  'community-ministry': '공동체 · 사역',
  'business-growth': '비즈니스 · 성장',
  'knowledge-creation': '지식 · 창작',
  'work-life': '일 · 삶',
  'communication-cloud': '소통 · 클라우드',
});

const SCOPES = Object.freeze({
  ekodi: Object.freeze({ id:'ekodi', label:'EKODI', serviceIds:null }),
  ekodibiz: Object.freeze({
    id:'ekodibiz',
    label:'EKODIBIZ',
    serviceIds:Object.freeze(['biz','business','mall','marketing','trade','invest']),
  }),
});
const PUBLIC_CONTRACTS = Object.freeze([
  Object.freeze({ id:'auth', name:'EKODI Auth', kind:'identity', url:'https://auth.ekodi.kr/' }),
  Object.freeze({ id:'api', name:'EKODI API', kind:'api', url:'https://api.ekodi.kr/' }),
  Object.freeze({ id:'mcp', name:'EKODI MCP', kind:'mcp', url:'https://api.ekodi.kr/mcp' }),
  Object.freeze({ id:'mcp-metadata', name:'OAuth Protected Resource', kind:'metadata', url:'https://api.ekodi.kr/.well-known/oauth-protected-resource' }),
  Object.freeze({ id:'shell', name:'EKODI Shell', kind:'ui-shell', url:'https://shell.ekodi.kr/' }),
]);

function normalizedMode(value) {
  const mode = String(value || 'platform').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : null;
}

function normalizedScope(value) {
  return SCOPES[String(value || 'ekodi').trim().toLowerCase()] || null;
}

function inScope(service, scope) {
  if (!scope.serviceIds) return true;
  return scope.serviceIds.includes(service.id);
}

function safeLiveState(live, now) {
  const checkedAt = String(live?.latest?.checkedAt || live?.checkedAt || '');
  const checkedMs = Date.parse(checkedAt);
  const fresh = Number.isFinite(checkedMs) && now - checkedMs <= MAX_LIVE_AGE_MS;
  const rawStatus = String(live?.latest?.status || live?.status || '').toLowerCase();
  return Object.freeze({
    status:fresh && STATUS_VALUES.has(rawStatus) ? rawStatus : 'unknown',
    checkedAt:Number.isFinite(checkedMs) ? new Date(checkedMs).toISOString() : null,
    fresh,
  });
}

function safeService(service, liveById, now) {
  const live = safeLiveState(liveById.get(service.id), now);
  return Object.freeze({
    id:String(service.id),
    name:String(service.name || service.nameEn || service.id),
    nameEn:String(service.nameEn || ''),
    label:String(service.label || service.domain || ''),
    url:String(service.url || ''),
    group:String(service.group || 'other'),
    registryStatus:String(service.status || 'planned'),
    productionVerified:service.productionVerified === true,
    live,
  });
}

function safeGroups(services) {
  return Object.freeze([...new Set(services.map(service => service.group))].map(id => Object.freeze({
    id,
    label:GROUP_LABELS[id] || id,
  })));
}
function safeSummary(services) {
  const count = status => services.filter(service => service.live.status === status).length;
  return Object.freeze({
    total:services.length,
    online:count('online'),
    degraded:count('degraded'),
    offline:count('offline'),
    unknown:count('unknown'),
  });
}

function publicContracts(mode) {
  return mode === 'dev'
    ? PUBLIC_CONTRACTS.map(contract => Object.freeze({ ...contract }))
    : [];
}

export function buildPublicPreviewProjection(overview = {}, options = {}) {
  const mode = normalizedMode(options.mode);
  const scope = normalizedScope(options.scope);
  if (!mode) throw new TypeError('Unsupported preview mode');
  if (!scope) throw new TypeError('Unsupported preview scope');

  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const liveRows = Array.isArray(overview.services) ? overview.services : [];
  const liveById = new Map(liveRows.map(row => [String(row?.id || ''), row]));
  const services = USER_SERVICES
    .filter(service => inScope(service, scope))
    .map(service => safeService(service, liveById, now));
  const generatedAt = overview.generatedAt && Number.isFinite(Date.parse(overview.generatedAt))
    ? new Date(overview.generatedAt).toISOString()
    : new Date(now).toISOString();

  return Object.freeze({
    schemaVersion:1,
    scope:Object.freeze({ id:scope.id, label:scope.label }),
    mode,
    generatedAt,
    refreshAfterSeconds:60,
    liveSource:'EKODI production service checks + public service registry',
    summary:safeSummary(services),
    groups:safeGroups(services),
    services:Object.freeze(services),
    contracts:Object.freeze(publicContracts(mode)),
    privacy:Object.freeze({
      profile:'public-safe-projection',
      personalData:false,
      secrets:false,
      rawLogs:false,
      sourcePaths:false,
      databaseIdentifiers:false,
      deploymentMetadata:false,
      internalSourceTopology:false,
    }),
  });
}

export function previewScopeIds() {
  return Object.freeze(Object.keys(SCOPES));
}
