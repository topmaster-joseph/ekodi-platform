import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servicesPath = path.join(root, 'config', 'ecosystem-services.json');
const lifecyclePath = path.join(root, 'config', 'site-lifecycle-registry.json');
const outputPath = path.join(root, 'discovery-registry.generated.js');

const PUBLIC_STATUSES = new Set(['live', 'beta']);
const PRIVATE_PREFIXES = ['/admin', '/api/', '/auth/', '/oauth/', '/my', '/member', '/workspace-admin', '/preview/dev'];
const ORGANIZATION_SERVICE_IDS = new Set(['church', 'biz', 'lab']);
const BASE_ROUTES = Object.freeze([
  { path: '/', asset: 'index.html', changefreq: 'weekly', priority: '1.0', label: 'EKODI Ecosystem', title: 'EKODI | 에코디 생태계 · EKODI Ecosystem', description: '지금 사용할 수 있는 EKODI 플랫폼을 한눈에 만나는 연결 생태계.' },
  { path: '/history', asset: 'history.html', changefreq: 'monthly', priority: '0.5', label: 'EKODI History', title: 'EKODI History | 에코디 연혁', description: 'EKODI 생태계의 주요 흐름과 발전 과정을 확인합니다.' },
  { path: '/privacy', asset: 'privacy.html', changefreq: 'yearly', priority: '0.3', label: 'Privacy Policy', title: '개인정보처리방침 | EKODI', description: 'EKODI 서비스의 개인정보 처리 원칙과 정책을 안내합니다.' },
  { path: '/terms', asset: 'terms.html', changefreq: 'yearly', priority: '0.3', label: 'Terms of Service', title: '이용약관 | EKODI', description: 'EKODI 서비스 이용약관을 안내합니다.' },
  { path: '/cmpmyi', asset: null, changefreq: 'weekly', priority: '0.8', label: 'Mokpo Store Gateway', title: '목포대점 통합 게이트 | EKODI', description: '자담치킨, 피자마루, 요거트퍼플 목포대점을 한 화면에서 선택합니다.' },
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizePathname(value) {
  const pathValue = String(value || '/').split('?')[0].split('#')[0] || '/';
  const withSlash = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
}

function parsePublicUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw || '').trim()); } catch { return null; }
  if (parsed.protocol !== 'https:') return null;
  const pathname = normalizePathname(parsed.pathname);
  if (PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) return null;
  return { url: `${parsed.origin}${pathname === '/' ? '' : pathname}`, origin: parsed.origin, hostname: parsed.hostname, pathname };
}

function serviceIsDiscoverable(service) {
  return Boolean(
    service
    && service.discoveryPublic !== false
    && service.userVisible !== false
    && service.productionVerified === true
    && PUBLIC_STATUSES.has(String(service.status || '').trim().toLowerCase())
    && parsePublicUrl(service.url)
  );
}

function siteIsDiscoverable(site) {
  const state = String(site?.migrationState || '').toLowerCase();
  return Boolean(
    site
    && site.discoveryPublic !== false
    && site.class === 'workspace_user_site'
    && site.canonicalUrl
    && !/(preparing|planned|hold)/.test(state)
    && parsePublicUrl(site.canonicalUrl)
  );
}

function serviceRoute(service, parsed) {
  const name = String(service.name || service.nameEn || service.id).trim();
  return {
    path: parsed.pathname,
    asset: null,
    changefreq: 'weekly',
    priority: service.homepage === true ? '0.8' : '0.7',
    label: String(service.nameEn || name).trim(),
    title: `${name} | EKODI`,
    description: String(service.descriptionKo || service.descriptionEn || `${name} EKODI 서비스`).trim(),
    schemaType: ORGANIZATION_SERVICE_IDS.has(service.id) ? 'Organization' : 'Service',
    source: `service:${service.id}`,
  };
}

function workspaceSchemaType(ownerKind) {
  if (ownerKind === 'store') return 'LocalBusiness';
  if (['organization', 'church', 'business', 'region'].includes(ownerKind)) return 'Organization';
  return 'WebPage';
}

function workspaceRoute(site, parsed) {
  const name = String(site.name || site.id).trim();
  return {
    path: parsed.pathname,
    asset: null,
    changefreq: 'weekly',
    priority: '0.7',
    label: name,
    title: `${name} | EKODI`,
    description: `${name}의 공식 EKODI 공개 공간입니다.`,
    schemaType: workspaceSchemaType(site.ownerKind),
    source: `workspace:${site.id}`,
  };
}

export function buildDiscoveryRegistry(servicesConfig = readJson(servicesPath), lifecycleConfig = readJson(lifecyclePath)) {
  const rootRoutes = new Map(BASE_ROUTES.map(route => [route.path, { ...route }]));
  const externalResources = new Map();

  for (const site of lifecycleConfig.existingWorkspaceSites || []) {
    if (!siteIsDiscoverable(site)) continue;
    const parsed = parsePublicUrl(site.canonicalUrl);
    if (!parsed) continue;
    if (parsed.hostname === 'ekodi.kr') rootRoutes.set(parsed.pathname, workspaceRoute(site, parsed));
  }

  for (const service of servicesConfig.services || []) {
    if (!serviceIsDiscoverable(service)) continue;
    const parsed = parsePublicUrl(service.url);
    if (!parsed) continue;
    if (parsed.hostname === 'ekodi.kr') {
      rootRoutes.set(parsed.pathname, serviceRoute(service, parsed));
      continue;
    }
    const name = String(service.name || service.nameEn || service.id).trim();
    externalResources.set(parsed.url, {
      id: String(service.id || '').trim(),
      label: String(service.nameEn || name).trim(),
      title: `${name} | EKODI`,
      description: String(service.descriptionKo || service.descriptionEn || `${name} EKODI 서비스`).trim(),
      url: parsed.url,
      origin: parsed.origin,
      schemaType: ORGANIZATION_SERVICE_IDS.has(service.id) ? 'Organization' : 'Service',
      source: `service:${service.id}`,
    });
  }

  const routes = [...rootRoutes.values()];
  const externals = [...externalResources.values()].sort((a, b) => a.url.localeCompare(b.url));
  const officialOrigins = [...new Set(['https://ekodi.kr', ...externals.map(item => item.origin)])].sort();

  for (const route of routes) {
    if (!route.path.startsWith('/')) throw new Error(`Discovery route must be absolute: ${route.path}`);
    if (PRIVATE_PREFIXES.some(prefix => route.path === prefix || route.path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) {
      throw new Error(`Private route leaked into discovery registry: ${route.path}`);
    }
  }

  return Object.freeze({
    version: 3,
    routes: Object.freeze(routes),
    externalResources: Object.freeze(externals),
    officialOrigins: Object.freeze(officialOrigins),
  });
}

export function renderGeneratedDiscoveryRegistry(registry = buildDiscoveryRegistry()) {
  const banner = '// GENERATED from config/ecosystem-services.json + config/site-lifecycle-registry.json. Do not edit by hand.\n';
  return `${banner}export const DISCOVERY_REGISTRY_VERSION = ${registry.version};\nexport const GENERATED_DISCOVERY_PUBLIC_ROUTES = Object.freeze(${JSON.stringify(registry.routes, null, 2)});\nexport const GENERATED_DISCOVERY_EXTERNAL_RESOURCES = Object.freeze(${JSON.stringify(registry.externalResources, null, 2)});\nexport const GENERATED_DISCOVERY_OFFICIAL_ORIGINS = Object.freeze(${JSON.stringify(registry.officialOrigins, null, 2)});\n`;
}

export function generateDiscoveryRegistry({ check = false } = {}) {
  const expected = renderGeneratedDiscoveryRegistry();
  if (check) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== expected) throw new Error('discovery-registry.generated.js is stale; run npm run generate:discovery');
    return expected;
  }
  fs.writeFileSync(outputPath, expected);
  const registry = buildDiscoveryRegistry();
  console.log(`Generated EKODI discovery registry: ${registry.routes.length} apex routes, ${registry.externalResources.length} external public resources.`);
  return expected;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateDiscoveryRegistry({ check: process.argv.includes('--check') });
}
