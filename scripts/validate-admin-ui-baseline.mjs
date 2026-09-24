import { readFile } from 'node:fs/promises';

const readText = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = async path => JSON.parse(await readText(path));

const [constitution, baseline, design, pkg, principles, agents] = await Promise.all([
  readJson('governance/constitution/constitution.json'),
  readJson('config/admin-ui-baseline-policy.json'),
  readJson('config/design-engine.json'),
  readJson('package.json'),
  readText('ADMIN_UI_PRINCIPLES.md'),
  readText('AGENTS.override.md'),
]);

const errors = [];
const expectedRegions = [
  'fixed-left-navigation',
  'top-breadcrumb',
  'large-title-and-single-line-description',
  'core-kpi-cards',
  'quick-actions',
  'integrated-management-list',
  'right-help-guide-panel',
];
const expectedLifecycle = ['status', 'configure', 'execute', 'result'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const c = constitution.adminUiBaselinePolicy || {};

if (c.id !== 'ADMIN-UI-BASELINE-001' || c.status !== 'enforced') errors.push('constitutional admin UI baseline must remain enforced.');
if (c.machinePolicy !== 'config/admin-ui-baseline-policy.json') errors.push('constitutional machine policy pointer drifted.');
if (c.sharedShellFirst !== true || c.pageLocalTemporaryCompositionForbidden !== true) errors.push('shared-shell-first constitutional rule is missing.');
if (!same(c.requiredStructure, expectedRegions)) errors.push('constitutional required admin regions drifted.');
if (!same(c.settingsWorkflow, expectedLifecycle)) errors.push('constitutional settings lifecycle drifted.');
if (c.sameWorkspaceLifecycleRequired !== true || c.scatteredSettingsForbidden !== true) errors.push('same-workspace settings lifecycle must remain mandatory.');
if (c.appliesToAllCurrentAndFutureAdminSurfaces !== true) errors.push('constitutional scope must include all current and future admin surfaces.');
if (c.exceptionRequiresConstitutionalAmendment !== true) errors.push('admin UI baseline exceptions must require constitutional amendment.');

if (baseline.policyId !== c.id || baseline.status !== 'enforced') errors.push('machine admin UI baseline must match constitutional identity/status.');
if (baseline.scope?.appliesToAllCurrentAndFutureAdminSurfaces !== true) errors.push('machine policy scope must cover all current/future admin surfaces.');
if (baseline.composition?.sharedShellFirst !== true || baseline.composition?.pageLocalTemporaryShellForbidden !== true) errors.push('machine policy must prohibit page-local temporary admin shells.');
if (!same(baseline.composition?.requiredRegions, expectedRegions)) errors.push('machine policy required regions drifted.');
if (!same(baseline.settingsExperience?.lifecycle, expectedLifecycle)) errors.push('machine policy settings lifecycle drifted.');
if (baseline.settingsExperience?.scatteredSettingsForbidden !== true || baseline.settingsExperience?.sameWorkspaceByDefault !== true) errors.push('machine policy must keep settings lifecycle together.');
if (baseline.enforcement?.exceptionRequiresConstitutionalAmendment !== true) errors.push('machine policy exception gate must remain constitutional.');

const admin = design.admin || {};
if (admin.baselinePolicy !== 'config/admin-ui-baseline-policy.json') errors.push('Design Engine must reference the admin UI baseline policy.');
if (admin.baselinePolicyId !== 'ADMIN-UI-BASELINE-001') errors.push('Design Engine admin baseline policy id drifted.');
if (!same(admin.baselineRequiredRegions, expectedRegions)) errors.push('Design Engine baseline regions drifted.');
if (!same(admin.settingsWorkflow, expectedLifecycle)) errors.push('Design Engine settings workflow drifted.');

for (const marker of ['ADMIN-UI-BASELINE-001','좌측 고정 메뉴','breadcrumb','핵심 KPI 카드','빠른 실행','통합 관리목록','우측 도움/가이드','상태 확인','설정','실행','결과 확인']) {
  if (!principles.includes(marker)) errors.push(`ADMIN_UI_PRINCIPLES.md missing baseline marker: ${marker}`);
}
for (const marker of ['ADMIN-UI-BASELINE-001','config/admin-ui-baseline-policy.json','shared baseline','status → configure → execute → result']) {
  if (!agents.includes(marker)) errors.push(`AGENTS.override.md missing mandatory baseline marker: ${marker}`);
}

if (pkg.scripts?.['validate:admin-ui-baseline'] !== 'node scripts/validate-admin-ui-baseline.mjs') errors.push('package.json must expose validate:admin-ui-baseline.');
if (!String(pkg.scripts?.check || '').includes('npm run validate:admin-ui-baseline')) errors.push('full check must enforce validate:admin-ui-baseline.');
if (!String(pkg.scripts?.['validate:constitution'] || '').includes('validate-admin-ui-baseline.mjs')) errors.push('validate:constitution must include the admin UI baseline validator.');

const protectedPaths = constitution.changeControl?.protectedPaths || [];
for (const path of ['config/admin-ui-baseline-policy.json','scripts/validate-admin-ui-baseline.mjs']) {
  if (!protectedPaths.includes(path)) errors.push(`constitutional protectedPaths missing ${path}`);
}

if (errors.length) {
  for (const error of errors) console.error(`[ADMIN-UI-BASELINE-001] ${error}`);
  process.exit(1);
}
console.log('[ADMIN-UI-BASELINE-001] constitutional, machine, Design Engine, agent and CI contracts are aligned.');
