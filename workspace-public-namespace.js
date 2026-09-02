const TOKEN_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const RESERVED_PUBLIC_NAMESPACES = Object.freeze([
  'admin','api','auth','my','status','www','privacy','terms','history',
  'support','help','system','root','official','ekodi','mall','shop','pay',
  'personal','org','group','project','people','biz',
  'marketing','books','publish','publishing','community','work','education','cafe',
  'bible','life','money','social','energy','business','trade','live','delivery',
  'ai','tax','messenger','invest','cloud','author','finance','storage','domains','membership','campus','creator',
]);

const RESERVED = new Set(RESERVED_PUBLIC_NAMESPACES);

export const PUBLIC_WORKSPACES = Object.freeze({
  ekodibiz: Object.freeze({
    workspaceId:'ws_org_ekodi_biz', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'에코디비즈', legacyTenantSlug:'ekodi-biz', upstreamHost:'biz.ekodi.kr',
  }),
  ekodichurch: Object.freeze({
    workspaceId:'ws_org_ekodi_church', workspaceType:'organization', workspaceSubtype:'church',
    displayName:'에코디교회', legacyTenantSlug:'ekodi-church', upstreamHost:'church.ekodi.kr',
  }),
  ekodilab: Object.freeze({
    workspaceId:'ws_org_ekodi_lab', workspaceType:'organization', workspaceSubtype:'institution',
    displayName:'에코디연구소', legacyTenantSlug:'ekodi-lab', upstreamHost:'lab.ekodi.kr',
  }),
  ekoditrade: Object.freeze({
    workspaceId:'ws_org_ekodi_trade', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'EKODI Global Trading', legacyTenantSlug:'ekodi-trade', upstreamHost:'trade.biz.ekodi.kr',
  }),
  ekodicafe: Object.freeze({
    workspaceId:'ws_org_ekodi_cafe', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'에코디 카페', legacyTenantSlug:'ekodi-cafe', upstreamHost:'cafe.ekodi.kr',
  }),
  cgma: Object.freeze({
    workspaceId:'ws_org_cgma', workspaceType:'organization', workspaceSubtype:'association',
    displayName:'청계면상인회', legacyTenantSlug:'cgma', upstreamHost:'cgma.ekodi.kr',
  }),
  jadam: Object.freeze({
    workspaceId:'ws_org_jadam', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'자담치킨 목포대점', legacyTenantSlug:'jadam', upstreamHost:'jadam.ekodi.kr',
  }),
  pizzamaru: Object.freeze({
    workspaceId:'ws_org_pizzamaru', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'피자마루 목포대점', legacyTenantSlug:'pizzamaru', upstreamHost:'pizzamaru.ekodi.kr',
  }),  yogurt: Object.freeze({
    workspaceId:'ws_org_yogurt', workspaceType:'organization', workspaceSubtype:'business',
    displayName:'요거트퍼플 목포대점', legacyTenantSlug:'yogurt', upstreamHost:'yogurt.ekodi.kr',
  }),
});

export function normalizePublicNamespace(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function isValidPublicNamespace(value) {
  const token = normalizePublicNamespace(value);
  return token.length >= 2 && TOKEN_RE.test(token) && !RESERVED.has(token);
}

export function isReservedPublicNamespace(value) {
  return RESERVED.has(normalizePublicNamespace(value));
}

export function workspaceForPublicNamespace(value) {
  return PUBLIC_WORKSPACES[normalizePublicNamespace(value)] || null;
}export function canonicalWorkspacePath(namespace, suffix = '') {
  const token = normalizePublicNamespace(namespace);
  if (!token) return '/';
  const rest = String(suffix || '').replace(/^\/+/, '');
  return `/${token}${rest ? `/${rest}` : ''}`;
}

export function suggestPublicNamespaces(requested, taken = [], hints = {}) {
  const base = normalizePublicNamespace(requested) || 'workspace';
  const unavailable = new Set([...RESERVED, ...taken.map(normalizePublicNamespace).filter(Boolean)]);
  const seeds = [
    base,
    hints.region ? `${base}-${normalizePublicNamespace(hints.region)}` : '',
    hints.brand ? `${base}-${normalizePublicNamespace(hints.brand)}` : '',
    hints.subtype ? `${base}-${normalizePublicNamespace(hints.subtype)}` : '',
  ].filter(Boolean);
  const choices = [];
  for (const seed of seeds) {
    if (choices.length >= 5) break;
    if (isValidPublicNamespace(seed) && !unavailable.has(seed) && !choices.includes(seed)) choices.push(seed);
  }
  for (let index = 2; choices.length < 5 && index < 100; index += 1) {
    const candidate = `${base}-${index}`.slice(0, 64).replace(/-+$/g, '');
    if (isValidPublicNamespace(candidate) && !unavailable.has(candidate) && !choices.includes(candidate)) choices.push(candidate);
  }
  return choices;
}

export function workspaceForLegacyTenantSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return Object.entries(PUBLIC_WORKSPACES).find(([, workspace]) => workspace.legacyTenantSlug === slug)?.[1] || null;
}

export function namespaceRecord(value) {
  const namespace = normalizePublicNamespace(value);
  const workspace = workspaceForPublicNamespace(namespace);
  return workspace ? {
    publicNamespace: namespace,
    canonicalPath: canonicalWorkspacePath(namespace),
    canonicalUrl: `https://ekodi.kr${canonicalWorkspacePath(namespace)}`,
    ...workspace,
  } : null;
}

export function publicNamespaceForLegacyTenantSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return Object.entries(PUBLIC_WORKSPACES).find(([, workspace]) => workspace.legacyTenantSlug === slug)?.[0] || '';
}
