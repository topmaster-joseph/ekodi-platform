import fs from 'node:fs';
import path from 'node:path';
import { applyUserSurfaceOverride, assertEngineBoundarySeparation, assertUserFacingCanonical, loadUserSurfaceContract } from './user-surface-contract.mjs';

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '');
const json = rel => JSON.parse(read(rel));

const contract = await loadUserSurfaceContract();
try { assertEngineBoundarySeparation(contract); } catch (error) { fail(error.message); }

const ecosystem = json('config/ecosystem-services.json');
for (const raw of ecosystem.services || []) {
  const service = applyUserSurfaceOverride(raw, contract);
  try { assertUserFacingCanonical(service, contract); } catch (error) { fail(`ecosystem:${error.message}`); }
}
const marketing = ecosystem.services?.find(service => service.id === 'marketing');
if (marketing?.url !== 'https://ekodi.kr/ekodibiz/marketing-ai') fail(`raw ecosystem marketing canonical drift: ${marketing?.url || 'missing'}`);
if (marketing?.label !== 'ekodi.kr/ekodibiz/marketing-ai') fail(`raw ecosystem marketing label drift: ${marketing?.label || 'missing'}`);

const manifest = read('ekodi-service-manifest.js');
if (!manifest.includes("id:'marketing',name:'Marketing AI',shortName:'Marketing',url:'https://ekodi.kr/ekodibiz/marketing-ai'")) fail('service manifest Marketing user URL is not canonical');
if (!manifest.includes("engineUrl:'https://marketing.ekodi.kr/'")) fail('service manifest must keep Marketing Core as explicit engine metadata');

const userSurfaceFiles = [
  'index.html','admin-shell.html','hub.html','trade.html','business-worker.js','business/customer-next.js','business/index.html',
  'bible/index.html','community/index.html','life/index.html','social/index.html','energy/app.js','my-worker.js','my/app.js',
  'my/church-marketing-ai.js','my/site-activity-role-ui.js','management-platform.js','config/management-platform.json',
  'service-proxy.js','social-registry-api.js','social/channels.json','generated/user-services.js','my/user-services.js',
];
const forbidden = [
  [/https:\/\/(?:jadam|pizzamaru|yogurt|cgma)\.ai\.ekodi\.kr/gi, 'customer-specific AI subdomain'],
  [/https:\/\/marketing\.ekodi\.kr/gi, 'Marketing Core used as ordinary user entry'],
  [/https:\/\/biz\.ekodi\.kr/gi, 'legacy Biz public URL'],
  [/https:\/\/church\.ekodi\.kr/gi, 'legacy Church public URL'],
  [/https:\/\/lab\.ekodi\.kr/gi, 'legacy Lab public URL'],
];
for (const rel of userSurfaceFiles) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { fail(`user surface file missing: ${rel}`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  for (const [pattern, label] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) fail(`${rel}: ${label}`);
  }
}

const tenants = json('config/marketing-tenants.json');
const expectedTenantCanonicals = {
  jadam:'https://ekodi.kr/jadam/marketing',
  pizzamaru:'https://ekodi.kr/pizzamaru/marketing',
  yogurt:'https://ekodi.kr/yogurt/marketing',
  cgma:'https://ekodi.kr/cgma/marketing',
};
for (const tenant of tenants.tenants || []) {
  if (tenant.canonicalUrl !== expectedTenantCanonicals[tenant.tenant]) fail(`marketing tenant canonical mismatch: ${tenant.tenant}`);
  if (tenant.domainRole !== 'legacy_execution_alias') fail(`marketing tenant legacy execution alias role missing: ${tenant.tenant}`);
}
if (tenants.hub?.role !== 'common_engine' || tenants.hub?.canonicalProductUrl !== 'https://ekodi.kr/ekodibiz/marketing-ai') fail('Marketing tenant hub must separate common engine from product canonical');

const workspacePolicy = json('config/service-workspace-policy.json');
if (workspacePolicy.userSurfaceTopologyPolicy?.customerSpecificAiSubdomains !== 'forbidden_as_canonical') fail('workspace policy must forbid customer AI subdomains as canonical');
if (workspacePolicy.userSurfaceTopologyPolicy?.examples?.jadamMarketing !== 'https://ekodi.kr/jadam/marketing') fail('workspace policy Jadam marketing canonical drift');

const docs = read('docs/marketing-domains.md');
for (const marker of ['ekodi.kr/ekodibiz/marketing-ai','ekodi.kr/jadam/marketing','marketing.ekodi.kr` = EKODI Marketing Core','compatibility execution alias']) {
  if (!docs.includes(marker)) fail(`marketing domain documentation marker missing: ${marker}`);
}
const agents = read('AGENTS.md');
for (const marker of ['`ekodi.kr/jadam`','`ekodi.kr/pizzamaru`','`ekodi.kr/yogurt`','`ekodi.kr/cgma`']) if (!agents.includes(marker)) fail(`AGENTS canonical marker missing: ${marker}`);

if (failures.length) {
  console.error(`EKODI user-surface validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log('EKODI user-surface contract: OK');
console.log('- customer/workspace identity stays on ekodi.kr/{public_namespace} paths');
console.log('- Marketing Core and AI Gateway stay independent non-customer engine boundaries');
console.log('- customer *.ai.ekodi.kr addresses are compatibility aliases only');
console.log('- ordinary user surfaces do not expose provider/model/orchestration topology');
