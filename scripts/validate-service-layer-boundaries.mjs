import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const json = async relative => JSON.parse(await read(relative));
const failures = [];
const requireTrue = (value, message) => { if (!value) failures.push(message); };

const [boundaries, registry, packs, menu, workspace, tenantPolicy, supplyAdmin, layout, cgmaAdmin, storageControl, siteWorker] = await Promise.all([
  json('config/service-layer-boundaries.json'),
  json('config/capability-registry.json'),
  json('config/workspace-packs.json'),
  read('admin-menu-registry.js'),
  read('workspace-admin-page.js'),
  read('tenant-admin-policy.js'),
  read('supply-network-admin.js'),
  read('admin-menu-layout.js'),
  read('cgma-member-admin.js'),
  read('google-drive-storage-control.js'),
  read('site-worker.js'),
]);

requireTrue(boundaries.version === '1.0.0', 'service-layer-boundaries version must be 1.0.0');
for (const layer of ['system','common','professional','service-owned']) {
  requireTrue(Boolean(boundaries.classification?.[layer]), `classification.${layer} is required`);
  requireTrue(Boolean(boundaries.layers?.[layer]), `layers.${layer} is required`);
}
requireTrue(boundaries.workspacePolicy?.sameBoundaryRulesForEveryWorkspaceKind === true, 'workspace kinds must share the same boundary rules');
requireTrue((boundaries.workspacePolicy?.appliesTo || []).includes('future-custom'), 'future workspace kinds must inherit the boundary policy');
const capabilityIds = new Set((registry.capabilities || []).map(item => item.id));
const packedCapabilities = new Set(Object.values(packs.packs || {}).flatMap(pack => pack.capabilities || []));
for (const [serviceId, service] of Object.entries(boundaries.professionalServices || {})) {
  requireTrue(service.layer === 'professional', `${serviceId} must be classified as professional`);
  requireTrue(capabilityIds.has(service.capability), `${serviceId} capability ${service.capability} must exist`);
  requireTrue(packedCapabilities.has(service.capability), `${serviceId} capability ${service.capability} must be reusable through a workspace pack`);
  requireTrue((service.centralAdminMustNotOwn || []).length > 0, `${serviceId} must define owner-scoped exclusions`);
}

requireTrue(/id: 'supply-network'.*group: 'services'.*managementArea: 'professional-services'/s.test(menu), 'central Admin must expose sales/supply network inside the Services axis while preserving its professional-service classification');
requireTrue(/id: 'personal-finance'.*group: 'services'.*managementArea: 'professional-services'/s.test(menu), 'central Admin must expose personal finance inside the Services axis while preserving its professional-service classification');
requireTrue(!/id: 'affiliates'/.test(menu), 'central Admin must not expose Mall affiliate operations as a canonical top-level section');
requireTrue(!/id: 'cheonggye-members'/.test(menu), 'central Admin must not expose association member records as canonical navigation');
requireTrue(/supplyNetwork:'tenant\.supply-network\.manage'/.test(tenantPolicy), 'tenant supply-network capability is required');
requireTrue(/memberRoster:'tenant\.member-roster\.manage'/.test(tenantPolicy), 'tenant member-roster capability is required');
requireTrue(/sourcing:TENANT_ADMIN_CAPABILITIES\.supplyNetwork/.test(workspace), 'Mall sourcing must use the tenant supply-network capability');
requireTrue(/member:TENANT_ADMIN_CAPABILITIES\.memberRoster/.test(workspace), 'association member admin must use tenant member-roster capability');
requireTrue(/sourcing:\['제휴·소싱'/.test(workspace), 'Mall owner UI must label the operational projection as 제휴·소싱');
requireTrue(workspace.includes('공통 판매·공급망 엔진'), 'Mall owner UI must identify the shared 판매·공급망 professional engine');
requireTrue(workspace.includes("workspace==='cgma'") && workspace.includes('/cgma-member-admin.js'), 'CGMA member admin must be projected from its workspace');
requireTrue(!workspace.includes('/api/affiliate/accounts'), 'workspace admin must not access central affiliate account credentials');
requireTrue(!workspace.includes('affiliateMerchantRouteForm'), 'workspace admin must not mount the central merchant-route credential form');
requireTrue(supplyAdmin.includes("api('/providers')") && supplyAdmin.includes("api('/programs')"), 'professional supply admin must expose provider/program health');
requireTrue(!supplyAdmin.includes("api('/routes')") && !supplyAdmin.includes("api('/accounts')"), 'professional supply admin must not own workspace routes or credentials');
requireTrue(layout.includes('LEGACY_MALL_AFFILIATE_HASHES') && layout.includes('/ekodibiz/mall/admin/sourcing'), 'legacy affiliate entry must hand off to Mall owner admin');
requireTrue(layout.includes('LEGACY_CGMA_MEMBER_HASH') && layout.includes('/cgma/admin/member'), 'legacy association member entry must hand off to CGMA owner admin');
requireTrue(!layout.includes('openCheonggyeMembers') && !layout.includes("import('./cheonggye-members-admin.js')"), 'central Admin must not load association member CRUD');
requireTrue(cgmaAdmin.includes('/api/control/storage/google/cheonggye-members'), 'CGMA member admin must use the protected storage projection');
requireTrue(!cgmaAdmin.includes('/oauth/start'), 'CGMA member admin must not control Google credential OAuth');
requireTrue(storageControl.includes('cheonggyeWorkspaceSession') && storageControl.includes('current_site_activity_contexts'), 'member API must validate CGMA workspace authority');
requireTrue(siteWorker.includes("url.pathname.startsWith('/api/control/storage/google/cheonggye-members')") && siteWorker.includes('proxyAdminStorage(request, env)'), 'public workspace route must proxy protected member API through the storage binding');
requireTrue(boundaries.serviceOwnership?.mall?.adminRoot === '/ekodibiz/mall/admin', 'Mall owner admin root must remain canonical');
requireTrue(boundaries.serviceOwnership?.['cheonggye-association']?.adminRoot === '/cgma/admin', 'Cheonggye association owner admin root must be declared');

if (failures.length) {
  console.error(`Service layer boundary validation failed (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Service layer boundaries OK: ${Object.keys(boundaries.professionalServices || {}).length} professional services, ${(boundaries.workspacePolicy?.appliesTo || []).length} workspace kinds`);
