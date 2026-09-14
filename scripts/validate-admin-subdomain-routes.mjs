import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const menu = read('admin-menu-registry.js');
const canonicalRouter = read('canonical-surface-router.js');
const entryRouter = read('platform-router-entry-worker.js');
const boundaries = JSON.parse(read('config/service-layer-boundaries.json'));

const failures = [];
const requireTrue = (condition, message) => { if (!condition) failures.push(message); };

const block = menu.match(/export const ADMIN_SERVICE_REGISTRY\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const services = [...block.matchAll(/\{\s*serviceId:\s*'([^']+)'[\s\S]*?basePath:\s*'([^']+)'[\s\S]*?labels:\s*\{\s*ko:\s*'([^']+)'/g)]
  .map(([, id, basePath, name]) => ({ id, basePath, name }));

requireTrue(!menu.includes("id: 'service-admins'"), 'service admin handoffs must stay inside the canonical five-axis Admin model');
requireTrue(menu.includes("group: 'services'") && menu.includes("'service-admin': { ko: '서비스별 관리자'"), 'central Admin must group service-name handoffs contextually inside Services');
requireTrue(menu.includes('...ADMIN_SERVICE_MENU_REGISTRY'), 'central Admin menu must be generated from the service admin registry');
requireTrue(menu.includes('serviceAdmin: true') && menu.includes('adminHandoff: true') && menu.includes('superAdminOnly: true'), 'service menus must be super-admin-only handoffs instead of duplicated service admin UI');
requireTrue(services.length >= 20, `service admin registry must cover the platform service set (found ${services.length})`);

const ids = new Set();
const adminPaths = new Set();
for (const service of services) {
  requireTrue(!ids.has(service.id), `duplicate service admin id: ${service.id}`);
  ids.add(service.id);
  requireTrue(/^\/[a-z0-9][a-z0-9/-]*$/i.test(service.basePath), `${service.id} basePath must be a canonical ekodi.kr path: ${service.basePath}`);
  requireTrue(!service.basePath.startsWith('/admin'), `${service.id} must not live under central /admin`);
  requireTrue(!service.basePath.includes('.ekodi.kr') && !service.basePath.includes('://'), `${service.id} must not use a service admin subdomain`);
  const adminPath = `${service.basePath.replace(/\/+$/, '')}/admin`;
  requireTrue(!adminPaths.has(adminPath), `duplicate canonical service admin path: ${adminPath}`);
  adminPaths.add(adminPath);
}

for (const [owner, policy] of Object.entries(boundaries.serviceOwnership || {})) {
  const adminRoot = String(policy?.adminRoot || '');
  requireTrue(/^\/.+\/admin$/i.test(adminRoot), `${owner} serviceOwnership.adminRoot must end with /admin`);
  requireTrue(!adminRoot.startsWith('/admin/'), `${owner} owner admin must stay under its service/workspace path, not central /admin`);
}

requireTrue(canonicalRouter.includes("const MALL_ADMIN_PREFIX='/ekodibiz/ekodimall/admin'"), 'Mall canonical admin must remain /ekodibiz/ekodimall/admin');
requireTrue(canonicalRouter.includes('isServiceLocalMallAdminPath(path)'), 'canonical router must intercept the Mall service-local admin before legacy central aliases');
requireTrue(canonicalRouter.includes("workspaceAdminPage(),'space','admin'"), 'Mall canonical admin must load the owner-scoped workspace admin implementation');

const canonicalCall = entryRouter.indexOf('const canonical=await routeCanonicalSurface');
const legacyMallAlias = entryRouter.indexOf("target.pathname='/admin/ekodimall'");
requireTrue(canonicalCall >= 0, 'platform entry router must call the canonical surface router');
requireTrue(legacyMallAlias < 0 || canonicalCall < legacyMallAlias, 'canonical service-local admin routing must execute before legacy Mall central alias handling');

const executionPrefixes = new Set([...canonicalRouter.matchAll(/prefix:'(\/[^']+)'/g)].map(match => match[1]));
const entryOwnedPrefixes = [
  '/ekodichurch', '/ekodibiz', '/insurance', '/mail', '/cmpmyi', '/tax',
];
for (const service of services) {
  const routed = [...executionPrefixes].some(prefix => service.basePath === prefix || service.basePath.startsWith(`${prefix}/`))
    || entryOwnedPrefixes.some(prefix => service.basePath === prefix || service.basePath.startsWith(`${prefix}/`));
  requireTrue(routed, `${service.id} service admin basePath is not owned by the canonical or entry router: ${service.basePath}`);
}

if (failures.length) {
  console.error(`EKODI service-local admin route contract failed (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`EKODI service-local admin route contract OK: ${services.length} service-name handoffs, ${adminPaths.size} canonical /admin paths`);
