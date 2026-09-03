import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const registryPath = fileURLToPath(new URL('../config/ecosystem-services.json', import.meta.url));

const ICONS = {
  church: '<path d="M20 5v8M16 9h8M10 35V18l10-7 10 7v17M16 35v-9h8v9M7 35h26"></path>',
  business: '<path d="M8 35V9h15v26M23 16h9v19M13 15h4M13 21h4M13 27h4M27 22h2M27 28h2M5 35h30"></path>',
  books: '<path d="M5 9c6-2 11 0 15 4v21c-4-4-9-6-15-4V9ZM35 9c-6-2-11 0-15 4v21c4-4 9-6 15-4V9Z"></path>',
  lab: '<path d="M15 5h10M18 5v11L9 33c-1 2 0 3 3 3h16c3 0 4-1 3-3l-9-17V5M13 28h14"></path>',
  mall: '<path d="M9 15h22l-2 20H11L9 15ZM15 15c0-6 2-9 5-9s5 3 5 9"></path>',
  community: '<circle cx="20" cy="20" r="14"></circle><path d="M6 20h28M20 6c5 5 7 10 7 14s-2 9-7 14M20 6c-5 5-7 10-7 14s2 9 7 14"></path>',
  work: '<path d="M7 14h26v20H7V14ZM14 14V9h12v5M7 22h26M16 22v4h8v-4"></path>',
  energy: '<circle cx="20" cy="20" r="7"></circle><path d="M20 4v5M20 31v5M4 20h5M31 20h5M9 9l4 4M27 27l4 4M31 9l-4 4M13 27l-4 4"></path><path d="m22 13-6 9h5l-3 7 7-10h-5l2-6Z"></path>',
  marketing: '<path d="M7 30V18M16 30V10M25 30V15M34 30V6M5 34h31"></path><path d="m7 14 9-7 9 4 9-8"></path>',
  trade: '<path d="M5 20h30M20 5c5 5 7 10 7 15s-2 10-7 15M20 5c-5 5-7 10-7 15s2 10 7 15"></path><path d="m28 11 7 3-7 3M12 29l-7-3 7-3"></path>',
  pay: '<rect x="5" y="9" width="30" height="22" rx="4"></rect><path d="M5 16h30M11 24h8M28 23v5M25.5 25.5h5"></path>',
  investment: '<path d="M6 32V18M14 32V13M22 32V21M30 32V8M4 35h31"></path><path d="m7 15 8-6 8 5 10-9M28 5h5v5"></path>',
  messenger: '<path d="M6 8h28v20H18l-8 7v-7H6V8Z"></path><path d="M12 15h16M12 21h11"></path>',
  education: '<path d="m4 14 16-8 16 8-16 8-16-8Z"></path><path d="M10 18v9c6 5 14 5 20 0v-9M36 14v10"></path>',
  my: '<circle cx="20" cy="13" r="6"></circle><path d="M8 34c1-8 5-12 12-12s11 4 12 12"></path><circle cx="31" cy="9" r="3"></circle>',
  insurance: '<path d="M20 5 33 10v9c0 8-5 13-13 16C12 32 7 27 7 19v-9l13-5Z"></path><path d="M20 13v13M14 19.5h12"></path>',
  mail: '<rect x="5" y="8" width="30" height="24" rx="4"></rect><path d="m7 11 13 10 13-10"></path>',
  live: '<rect x="7" y="8" width="26" height="24" rx="4"></rect><path d="m17 14 10 6-10 6V14Z"></path><path d="M3 14v12M37 14v12"></path>',
  cloud: '<path d="M12 31h17a7 7 0 0 0 1-14 11 11 0 0 0-21 4 5 5 0 0 0 3 10Z"></path><path d="M20 18v10M16 22l4-4 4 4"></path>',
  media: '<rect x="5" y="9" width="30" height="22" rx="3"></rect><path d="m17 15 9 5-9 5V15ZM10 5v4M30 5v4"></path>'
};

const CATEGORY_DEFINITIONS = [
  { id: 'community-ministry', label: '공동체 · 사역', labelEn: 'Community & Ministry' },
  { id: 'business-growth', label: '비즈니스 · 성장', labelEn: 'Business & Growth' },
  { id: 'knowledge-creation', label: '지식 · 콘텐츠', labelEn: 'Knowledge & Content' },
  { id: 'work-life', label: '일 · 생활', labelEn: 'Work & Life' },
  { id: 'communication-cloud', label: '소통 · 클라우드', labelEn: 'Communication & Cloud' }
];

const STATUS_DEFINITIONS = {
  live: { label: '운영중', labelEn: 'Live' },
  beta: { label: '테스트', labelEn: 'Beta' },
  preparing: { label: '준비중', labelEn: 'Preparing' },
  planned: { label: '오픈전', labelEn: 'Planned' }
};

const CATEGORY_IDS = new Set(CATEGORY_DEFINITIONS.map(category => category.id));
const STATUS_IDS = new Set(Object.keys(STATUS_DEFINITIONS));
const CLICKABLE_STATUSES = new Set(['live', 'beta']);
const SUPPORTED_REGISTRY_VERSIONS = new Set([2, 3]);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validateRegistry(registry) {
  if (!registry || !SUPPORTED_REGISTRY_VERSIONS.has(registry.version) || !Array.isArray(registry.services)) {
    throw new Error('Invalid EKODI ecosystem service registry');
  }

  const ids = new Set();
  const urls = new Set();
  for (const service of registry.services) {
    if (!service || typeof service !== 'object') throw new Error('Invalid service registry entry');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(service.id || '')) throw new Error(`Invalid service id: ${service.id || ''}`);
    if (ids.has(service.id)) throw new Error(`Duplicate service id: ${service.id}`);
    ids.add(service.id);

    let parsed;
    try { parsed = new URL(service.url); } catch { throw new Error(`Invalid service URL: ${service.id}`); }
    if (parsed.protocol !== 'https:') throw new Error(`Service URL must use HTTPS: ${service.id}`);
    if (/staging|preview/i.test(parsed.hostname)) throw new Error(`Staging URL cannot be published: ${service.id}`);
    if (urls.has(service.url)) throw new Error(`Duplicate service URL: ${service.url}`);
    urls.add(service.url);

    if (!service.name || !service.label) throw new Error(`Service name/label required: ${service.id}`);
    if (service.adminUrl) {
      let admin;
      try { admin = new URL(service.adminUrl); } catch { throw new Error(`Invalid service admin URL: ${service.id}`); }
      if (admin.protocol !== 'https:' || admin.pathname.replace(/\/+$/, '') !== '/admin') throw new Error(`Service admin URL must use HTTPS and canonical /admin path: ${service.id}`);
      if (admin.origin !== parsed.origin) throw new Error(`Service admin URL must stay on the service origin: ${service.id}`);
      if (['api.ekodi.kr','auth.ekodi.kr','admin.ekodi.kr'].includes(admin.hostname)) throw new Error(`Privileged core host cannot be registered as a service-local admin entry: ${service.id}`);
    }
    if (!ICONS[service.icon]) throw new Error(`Unknown service icon: ${service.id}`);
    if (!CATEGORY_IDS.has(service.category)) throw new Error(`Unknown service category: ${service.id}`);

    if (service.homepage === true) {
      if (!service.nameEn || !service.descriptionKo || !service.descriptionEn) {
        throw new Error(`Homepage bilingual copy required: ${service.id}`);
      }
      if (!STATUS_IDS.has(service.status)) throw new Error(`Unknown homepage status: ${service.id}`);
      if (CLICKABLE_STATUSES.has(service.status) && service.productionVerified !== true) {
        throw new Error(`Live/Beta homepage service must be production verified: ${service.id}`);
      }
    }
  }
  return registry;
}

export async function loadHomepageServices() {
  const registry = validateRegistry(JSON.parse(await readFile(registryPath, 'utf8')));
  const candidates = registry.services
    .filter(service => service.productionVerified === true && service.status === 'live')
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.id.localeCompare(b.id));
  const services = candidates.filter(service => service.homepage === true);
  Object.defineProperty(services, 'presentationCandidates', {
    value: candidates,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return services;
}

function serviceIsClickable(service) {
  return service.productionVerified === true && CLICKABLE_STATUSES.has(service.status);
}

function renderServiceCard(service) {
  const id = escapeHtml(service.id);
  const url = escapeHtml(service.url);
  const name = escapeHtml(service.name);
  const nameEn = escapeHtml(service.nameEn || service.name);
  const descriptionKo = escapeHtml(service.descriptionKo || service.name);
  const descriptionEn = escapeHtml(service.descriptionEn || service.nameEn || service.name);
  const label = escapeHtml(service.label);
  const statusId = escapeHtml(service.status);
  const status = STATUS_DEFINITIONS[service.status];
  const clickable = serviceIsClickable(service);
  const defaultVisibility = service.homepage === true ? 'normal' : 'hidden';
  const displayOrder = Number.isFinite(Number(service.order)) ? Math.trunc(Number(service.order)) : 9999;
  const icon = `<span class="service-icon"><svg viewBox="0 0 40 40" aria-hidden="true">${ICONS[service.icon]}</svg></span>`;
  const copy = `<span class="service-copy"><span class="service-title"><strong>${name}</strong><span class="service-name-en">${nameEn}</span></span><span class="service-description"><span>${descriptionKo}</span><small>${descriptionEn}</small></span><span class="service-domain">${label}</span></span>`;
  const badge = `<span class="service-status" data-status-badge="${statusId}"><b>${escapeHtml(status.label)}</b><span>${escapeHtml(status.labelEn)}</span></span>`;
  const common = `class="service-card status-${statusId}${clickable ? '' : ' is-unavailable'}" data-service-id="${id}" data-service-status="${statusId}" data-service-clickable="${clickable ? 'true' : 'false'}" data-homepage-default="${defaultVisibility}" data-homepage-order="${displayOrder}"${defaultVisibility === 'hidden' ? ' hidden' : ''}`;

  if (clickable) {
    return `          <a ${common} href="${url}">${icon}${copy}<span class="service-card-side">${badge}<span class="arrow" aria-hidden="true">→</span></span></a>`;
  }
  return `          <article ${common} aria-label="${name} ${escapeHtml(status.label)}">${icon}${copy}<span class="service-card-side">${badge}<span class="arrow is-muted" aria-hidden="true">·</span></span></article>`;
}

export function renderServiceCards(services) {
  const renderServices = Array.isArray(services?.presentationCandidates) ? services.presentationCandidates : services;
  return CATEGORY_DEFINITIONS.map(category => {
    const categoryServices = renderServices.filter(service => service.category === category.id);
    if (!categoryServices.length) return '';
    const cards = categoryServices.map(renderServiceCard).join('\n');
    const visibleCount = categoryServices.filter(service => service.homepage === true).length;
    return `      <section class="service-group" data-service-category="${escapeHtml(category.id)}"${visibleCount ? '' : ' hidden'}>
        <div class="service-group-heading"><h3><strong>${escapeHtml(category.label)}</strong><small>${escapeHtml(category.labelEn)}</small></h3><span data-service-count>${visibleCount}</span></div>
        <div class="service-list">
${cards}
        </div>
      </section>`;
  }).filter(Boolean).join('\n');
}

export { CATEGORY_DEFINITIONS, STATUS_DEFINITIONS, validateRegistry };