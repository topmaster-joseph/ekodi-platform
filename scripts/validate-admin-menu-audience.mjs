// ADMIN-AUDIENCE-001: every admin menu must carry an EKODI-orchestrator-decided
// audience (platform-super-admin | platform-site-operations | site-admin).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function validateAdminMenuAudience({ policy, orchestration, registryIds, superAdminOnlyIds = [], agentsText = '' }) {
  const fail = [];
  if (policy?.policyId !== 'ADMIN-AUDIENCE-001') fail.push('policyId must be ADMIN-AUDIENCE-001');
  if (policy?.status !== 'active') fail.push('ADMIN-AUDIENCE-001 must remain active');
  const orchestrator = orchestration?.orchestrator;
  if (!orchestrator) fail.push('orchestration policy has no orchestrator id');
  if (policy?.classifier !== orchestrator) fail.push(`classifier must be the EKODI orchestrator (${orchestrator})`);
  if (policy?.classification?.decidedBy !== orchestrator) fail.push(`classification.decidedBy must be ${orchestrator}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(policy?.classification?.decidedAt || ''))) fail.push('classification.decidedAt must be YYYY-MM-DD');

  const audiences = policy?.audiences || {};
  for (const required of ['platform-super-admin', 'platform-site-operations', 'site-admin']) {
    if (!audiences[required]) fail.push(`audience ${required} must be declared`);
  }
  if (audiences['site-admin']?.inheritsPlatformAuthority !== false) fail.push('site-admin must never inherit platform authority');
  if (audiences['platform-site-operations']?.siteMutation !== 'enter-site-admin-context') fail.push('site operations must mutate site data only by entering the site admin context');
  if (policy?.audienceChangeGates?.['toward-tenant-exposure'] !== 'sovereign-human-gate') fail.push('exposing a menu to tenants must require the sovereign human gate');

  const siteTypes = new Set(Object.keys(policy?.siteTypes || {}));
  if (!siteTypes.size) fail.push('siteTypes must be declared');
  const siteMenuTargets = new Set(Object.keys(policy?.platformSiteOperationsMenus || {}));
  const groupIds = new Set();
  for (const group of policy?.siteAdminMenuContract || []) {
    if (!ID_PATTERN.test(group.id || '')) fail.push(`site admin group id invalid: ${group.id}`);
    if (groupIds.has(group.id)) fail.push(`duplicate site admin group: ${group.id}`);
    groupIds.add(group.id);
    if (!group.ko) fail.push(`site admin group ${group.id} needs a Korean label`);
    siteMenuTargets.add(group.id);
    const menuIds = new Set();
    if (!Array.isArray(group.menus) || !group.menus.length) fail.push(`site admin group ${group.id} needs menus`);
    for (const menu of group.menus || []) {
      if (!ID_PATTERN.test(menu.id || '')) fail.push(`site admin menu id invalid: ${group.id}.${menu.id}`);
      if (menuIds.has(menu.id)) fail.push(`duplicate site admin menu: ${group.id}.${menu.id}`);
      menuIds.add(menu.id);
      if (!menu.ko) fail.push(`site admin menu ${group.id}.${menu.id} needs a Korean label`);
      for (const type of menu.siteTypes || []) if (!siteTypes.has(type)) fail.push(`unknown site type ${type} on ${group.id}.${menu.id}`);
      siteMenuTargets.add(`${group.id}.${menu.id}`);
    }
  }

  const entries = policy?.classification?.entries || {};
  const registry = new Set(registryIds);
  for (const id of registry) {
    if (!entries[id]) fail.push(`admin menu "${id}" has no EKODI-orchestrated audience classification (config/admin-menu-audience-policy.json)`);
  }
  for (const [id, entry] of Object.entries(entries)) {
    if (!registry.has(id)) fail.push(`classification "${id}" is stale: no such admin menu`);
    if (!audiences[entry?.audience]) { fail.push(`admin menu "${id}" has unknown audience "${entry?.audience}"`); continue; }
    if (entry.audience === 'platform-site-operations') {
      if (!siteMenuTargets.has(entry.siteMenu)) fail.push(`site operations menu "${id}" must mirror a site admin menu (got "${entry.siteMenu}")`);
    } else if (entry.siteMenu) {
      fail.push(`"${id}" is ${entry.audience} and must not declare siteMenu`);
    }
  }
  for (const id of superAdminOnlyIds) {
    if (entries[id] && entries[id].audience === 'site-admin') fail.push(`superAdminOnly menu "${id}" cannot be classified as site-admin`);
  }
  if (!agentsText.includes('ADMIN-AUDIENCE-001')) fail.push('AGENTS.md must reference ADMIN-AUDIENCE-001');
  return fail;
}

async function main() {
  const policy = JSON.parse(fs.readFileSync('config/admin-menu-audience-policy.json', 'utf8'));
  const orchestration = JSON.parse(fs.readFileSync('config/ai-change-orchestration-policy.json', 'utf8'));
  const { ADMIN_MENU_REGISTRY } = await import(pathToFileURL(`${process.cwd()}/admin-menu-registry.js`).href);
  const fail = validateAdminMenuAudience({
    policy,
    orchestration,
    registryIds: ADMIN_MENU_REGISTRY.map(item => item.id),
    superAdminOnlyIds: ADMIN_MENU_REGISTRY.filter(item => item.superAdminOnly).map(item => item.id),
    agentsText: fs.readFileSync('AGENTS.md', 'utf8'),
  });
  if (fail.length) {
    console.error(`Admin menu audience validation failed (${fail.length})`);
    for (const line of fail) console.error(`- ${line}`);
    process.exit(1);
  }
  const counts = {};
  for (const entry of Object.values(policy.classification.entries)) counts[entry.audience] = (counts[entry.audience] || 0) + 1;
  console.log(`ADMIN-AUDIENCE-001: OK (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
