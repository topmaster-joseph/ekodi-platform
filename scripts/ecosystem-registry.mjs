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
  marketing: '<path d="M7 30V18M16 30V10M25 30V15M34 30V6M5 34h31"></path><path d="m7 14 9-7 9 4 9-8"></path>'
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validateRegistry(registry) {
  if (!registry || registry.version !== 1 || !Array.isArray(registry.services)) {
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
    if (!ICONS[service.icon]) throw new Error(`Unknown service icon: ${service.id}`);
    if (service.homepage && service.productionVerified !== true) {
      throw new Error(`Homepage service must be production verified: ${service.id}`);
    }
  }
  return registry;
}

export async function loadHomepageServices() {
  const registry = validateRegistry(JSON.parse(await readFile(registryPath, 'utf8')));
  return registry.services
    .filter(service => service.homepage === true && service.productionVerified === true)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.id.localeCompare(b.id));
}

export function renderServiceCards(services) {
  return services.map(service => {
    const id = escapeHtml(service.id);
    const url = escapeHtml(service.url);
    const name = escapeHtml(service.name);
    const label = escapeHtml(service.label);
    return `        <a class="service-card" data-service-id="${id}" href="${url}"><span class="service-icon"><svg viewBox="0 0 40 40" aria-hidden="true">${ICONS[service.icon]}</svg></span><span><strong>${name}</strong><small>${label}</small></span><span class="arrow">→</span></a>`;
  }).join('\n');
}

export { validateRegistry };
