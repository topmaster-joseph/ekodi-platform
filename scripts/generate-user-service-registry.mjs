import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'config', 'ecosystem-services.json');
const serverPath = path.join(root, 'generated', 'user-services.js');
const browserPath = path.join(root, 'my', 'user-services.js');

const RESERVED_INTERNAL = new Set([
  'admin', 'api', 'auth', 'control', 'core', 'finance', 'security', 'shell', 'workspace-api',
]);

const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const services = Array.isArray(raw.services) ? raw.services : [];
const normalized = services.map((service) => ({
  id: String(service?.id || '').trim().toLowerCase(),
  name: String(service?.name || '').trim(),
  domain: String(service?.domain || '').trim().toLowerCase(),
  group: String(service?.group || '').trim().toLowerCase(),
}));

for (const service of normalized) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(service.id)) throw new Error(`Invalid user service id: ${service.id}`);
  if (RESERVED_INTERNAL.has(service.id)) throw new Error(`Internal component cannot inherit user membership: ${service.id}`);
  if (!service.name) throw new Error(`Missing service name: ${service.id}`);
  if (!service.domain.endsWith('.ekodi.kr')) throw new Error(`Invalid EKODI user service domain: ${service.domain}`);
}

const ids = normalized.map((service) => service.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate user service id in ecosystem-services.json');
const domains = normalized.map((service) => service.domain);
if (new Set(domains).size !== domains.length) throw new Error('Duplicate user service domain in ecosystem-services.json');

const banner = '// GENERATED from config/ecosystem-services.json. Do not edit by hand.\n';
const payload = JSON.stringify(normalized, null, 2);
const server = `${banner}export const USER_SERVICES = Object.freeze(${payload});\nexport const USER_SERVICE_IDS = new Set(USER_SERVICES.map((service) => service.id));\nexport function isUserService(value) { return USER_SERVICE_IDS.has(String(value || '').trim().toLowerCase()); }\n`;
const browser = `${banner}export const USER_SERVICES = Object.freeze(${payload});\nexport const USER_SERVICE_IDS = new Set(USER_SERVICES.map((service) => service.id));\n`;

fs.mkdirSync(path.dirname(serverPath), { recursive: true });
fs.writeFileSync(serverPath, server);
fs.writeFileSync(browserPath, browser);
console.log(`Generated ${normalized.length} EKODI user services.`);
