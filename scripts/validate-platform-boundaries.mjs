import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const failures = [];
const requireFile = async relative => {
  try { await access(path.join(root, relative)); }
  catch { failures.push(`Missing required boundary file: ${relative}`); }
};

const manifest = JSON.parse(await read('platform-boundaries.json'));
if (manifest.version !== 1) failures.push('platform-boundaries.json version must be 1');
const externalSurface = manifest.externalCanonicalSurfacePolicy || {};
const expectedCanonicalPaths = { personalHome:'/my', administration:'/admin', authentication:'/auth', api:'/api', mcp:'/mcp', webhooks:'/webhooks', status:'/status', developer:'/dev', experience:'/exp' };
if (externalSurface.host !== 'ekodi.kr' || externalSurface.pathBased !== true) failures.push('external canonical surface must be path-based on ekodi.kr');
if (externalSurface.internalDomainsAreImplementationBoundaries !== true || externalSurface.internalDomainsDoNotDefineCanonicalExternalUrls !== true) failures.push('internal platform domains must remain implementation boundaries, not external canonical URLs');
for (const [key,value] of Object.entries(expectedCanonicalPaths)) if (externalSurface.canonicalSystemPaths?.[key] !== value) failures.push(`external canonical path mismatch: ${key}`);
if (externalSurface.migration !== 'compatibility-first') failures.push('external canonical surface migration must remain compatibility-first');

for (const [id, platform] of Object.entries(manifest.platforms || {})) {
  if (!platform.deployWorkflow) failures.push(`${id}: deployWorkflow is required`);
  else await requireFile(platform.deployWorkflow);
  if (!Array.isArray(platform.source) || platform.source.length === 0) failures.push(`${id}: source boundary is required`);
  if (!Array.isArray(platform.domains) || platform.domains.length === 0) failures.push(`${id}: production domain boundary is required`);
}

const fullDeploy = await read('.github/workflows/deploy.yml');
if (!/workflow_dispatch\s*:/.test(fullDeploy)) failures.push('Full ecosystem deploy must support workflow_dispatch');
if (/^\s*push\s*:/m.test(fullDeploy)) failures.push('Full ecosystem deploy must be manual-only and must not declare a push trigger');

const mallDeploy = await read('.github/workflows/deploy-ekodi-mall.yml');
if (!mallDeploy.includes('sites/ekodi-mall/**')) failures.push('Mall workflow must remain path-isolated to sites/ekodi-mall/**');

const controlDeploy = await read('.github/workflows/deploy-control-api.yml');
for (const source of ['api-worker.js', 'customer-entry-worker.js', 'books-control.js', 'books-finance-control.js', 'affiliate-control.js', 'migrations/**']) {
  if (!controlDeploy.includes(source)) failures.push(`Control API workflow must watch ${source}`);
}

const financeDeploy = await read('.github/workflows/deploy-finance.yml');
for (const source of ['finance-worker.js', 'finance-entry-worker.js', 'wrangler.finance.toml']) {
  if (!financeDeploy.includes(source)) failures.push(`Finance workflow must watch ${source}`);
}

const booksDeploy = await read('.github/workflows/deploy-books.yml');
for (const source of ['books/**', 'books-worker.js', 'wrangler.books.toml']) {
  if (!booksDeploy.includes(source)) failures.push(`Books workflow must watch ${source}`);
}

const siteCore = await read('.github/workflows/deploy-site-core.yml');
const adminSite = await read('.github/workflows/deploy-admin-site.yml');
for (const workflow of [['site core', siteCore], ['admin site', adminSite]]) {
  if (!workflow[1].includes('group: ekodi-shared-site-worker-production')) failures.push(`${workflow[0]} workflow must serialize the shared site Worker deployment`);
}

if (failures.length) {
  console.error(`Platform boundary validation failed (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Platform boundaries OK: ${Object.keys(manifest.platforms).length} platform/service boundaries`);
