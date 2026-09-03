import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyUserSurfaceOverride,
  assertEngineBoundarySeparation,
  assertUserFacingCanonical,
  loadUserSurfaceContract,
} from './user-surface-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'config', 'ecosystem-services.json');
const serverPath = path.join(root, 'generated', 'user-services.js');
const browserPath = path.join(root, 'my', 'user-services.js');

const RESERVED_INTERNAL = new Set([
  'admin', 'api', 'auth', 'control', 'core', 'finance', 'security', 'shell', 'workspace-api',
]);
const AVAILABLE_STATUSES = new Set(['live', 'beta']);

const contract = await loadUserSurfaceContract();
assertEngineBoundarySeparation(contract);
const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const services = Array.isArray(raw.services) ? raw.services.map(service => applyUserSurfaceOverride(service, contract)) : [];
const normalized = services.map((service) => {
  const id = String(service?.id || '').trim().toLowerCase();
  const sourceUrl = String(service?.url || (service?.domain ? `https://${service.domain}` : '')).trim();
  let parsed = null;
  try { parsed = new URL(sourceUrl); } catch {}
  const status = String(service?.status || 'planned').trim().toLowerCase();
  const productionVerified = service?.productionVerified === true;
  const homepageDefault = service?.homepage === true;
  const homepageOrder = Number.isFinite(Number(service?.order)) ? Math.trunc(Number(service.order)) : 9999;
  const normalizedService = {
    id,
    name: String(service?.name || service?.nameEn || '').trim(),
    nameEn: String(service?.nameEn || '').trim(),
    label: String(service?.label || '').trim(),
    url: parsed?.toString() || sourceUrl,
    domain: String(parsed?.hostname || service?.domain || '').trim().toLowerCase(),
    group: String(service?.category || service?.group || '').trim().toLowerCase(),
    status,
    productionVerified,
    available: Boolean(productionVerified && AVAILABLE_STATUSES.has(status)),
    homepageEligible: Boolean(productionVerified && status === 'live'),
    homepageDefault,
    homepageOrder,
  };
  assertUserFacingCanonical(normalizedService, contract);
  return normalizedService;
});

for (const service of normalized) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(service.id)) throw new Error(`Invalid user service id: ${service.id}`);
  if (RESERVED_INTERNAL.has(service.id)) throw new Error(`Internal component cannot inherit user membership: ${service.id}`);
  if (!service.name) throw new Error(`Missing service name: ${service.id}`);
  const apexPathService = service.domain === 'ekodi.kr' && /^https:\/\/ekodi\.kr\/[^/?#]/.test(service.url);
  if (!service.domain.endsWith('.ekodi.kr') && !apexPathService) throw new Error(`Invalid EKODI user service domain: ${service.domain}`);
  if (!Number.isInteger(service.homepageOrder) || service.homepageOrder < 0 || service.homepageOrder > 9999) {
    throw new Error(`Invalid homepage order: ${service.id}`);
  }
}

const ids = normalized.map((service) => service.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate user service id in ecosystem-services.json');

// Subdomain services are unique by hostname. Multiple first-class services may
// intentionally live under different paths on the EKODI apex, so those are
// unique by their canonical path.
const serviceAddresses = normalized.map((service) => {
  if (service.domain !== 'ekodi.kr') return service.domain;
  let parsed = null;
  try { parsed = new URL(service.url); } catch {}
  const pathname = String(parsed?.pathname || '/').replace(/\/+$/, '') || '/';
  return `${service.domain}${pathname}`;
});
if (new Set(serviceAddresses).size !== serviceAddresses.length) {
  throw new Error('Duplicate user service address in ecosystem-services.json');
}

const banner = '// GENERATED from config/ecosystem-services.json through config/user-surface-contract.json. Do not edit by hand.\n';
const payload = JSON.stringify(normalized, null, 2);
const server = `${banner}export const USER_SERVICES = Object.freeze(${payload});\nexport const USER_SERVICE_IDS = new Set(USER_SERVICES.map((service) => service.id));\nexport function isUserService(value) { return USER_SERVICE_IDS.has(String(value || '').trim().toLowerCase()); }\n`;
const browser = `${banner}export const USER_SERVICES = Object.freeze(${payload});\nexport const USER_SERVICE_IDS = new Set(USER_SERVICES.map((service) => service.id));\n`;

fs.mkdirSync(path.dirname(serverPath), { recursive: true });
fs.writeFileSync(serverPath, server);
fs.writeFileSync(browserPath, browser);
console.log(`Generated ${normalized.length} EKODI user services with constitutional canonical surfaces.`);
