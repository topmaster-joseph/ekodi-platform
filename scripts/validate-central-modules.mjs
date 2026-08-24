import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { CORE_PERMISSION_POLICY, evaluateCorePermission } from '../core-permission.js';
import { CORE_WORKFLOW_POLICY, defineCoreWorkflow, evaluateWorkflowTransition } from '../core-workflow.js';
import { CORE_EVIDENCE_POLICY, normalizeCoreEvidence, canShareEvidence } from '../core-evidence.js';
import { getCoreAiGatewayStatus } from '../core-ai-gateway.js';

const failures = [];
const fail = message => failures.push(message);

if (EKODI_SERVICE_MANIFEST.identityModel !== 'person-space-role') fail('service manifest identity model changed');
if (EKODI_SERVICE_MANIFEST.authorityModel !== 'platform-admin-is-separate-from-tenant-activity') fail('service manifest authority separation changed');
if (CORE_PERMISSION_POLICY.model !== 'person-space-role-capability-resource') fail('permission model mismatch');
if (!CORE_WORKFLOW_POLICY.immutableHistory) fail('workflow history must remain immutable');
if (CORE_EVIDENCE_POLICY.model !== 'domain-owned-evidence-portable-provenance') fail('evidence provenance model mismatch');

const active = EKODI_SERVICE_MANIFEST.services.filter(service => service.state !== 'planned');
for (const service of active) {
  if (!service.id || !Array.isArray(service.capabilities) || !service.capabilities.length) fail(`${service.id || 'unknown'}: capabilities required`);
  if (!Array.isArray(service.workspaceKinds) || !service.workspaceKinds.length) fail(`${service.id || 'unknown'}: workspaceKinds required`);
  if (service.sso !== true) fail(`${service.id}: active user service must use SSO`);

  const owner = { kind: 'user', role: 'owner', coreRole: 'owner' };
  const read = evaluateCorePermission({ principal: owner, serviceId: service.id, action: 'read' });
  if (read.tier !== 'allow') fail(`${service.id}: owner read must be centrally permitted`);

  const viewer = { kind: 'user', role: 'viewer', coreRole: 'viewer' };
  const write = evaluateCorePermission({ principal: viewer, serviceId: service.id, action: 'update' });
  if (write.tier !== 'deny') fail(`${service.id}: viewer write must fail closed`);

  const platformAdmin = { kind: 'admin', role: 'admin', coreRole: 'admin' };
  const tenantAction = evaluateCorePermission({ principal: platformAdmin, serviceId: service.id, action: 'update', targetScope: 'tenant' });
  if (tenantAction.tier !== 'human_gate') fail(`${service.id}: platform admin tenant action must require explicit delegation`);

  const workflow = defineCoreWorkflow({
    id: `${service.id}.central-contract`,
    serviceId: service.id,
    states: ['draft','ready'],
    initialState: 'draft',
    transitions: [{ from: 'draft', to: 'ready', action: 'update' }],
  });
  const transition = evaluateWorkflowTransition({ workflow, from: 'draft', to: 'ready', principal: owner });
  if (transition.tier !== 'allow') fail(`${service.id}: workflow transition must inherit central permission`);

  const evidence = normalizeCoreEvidence({ serviceId: service.id, workspaceKey: `service:${service.id}`, title: `${service.name} contract evidence`, authority: 'official' });
  if (evidence.serviceId !== service.id || !canShareEvidence(evidence, `service:${service.id}`)) fail(`${service.id}: evidence must stay shareable inside its workspace`);
  if (canShareEvidence(evidence, 'service:other')) fail(`${service.id}: workspace evidence leaked across boundary`);
}

const ai = getCoreAiGatewayStatus({ AI_PROVIDER: 'NONE' }, []);
if (!ai.providerIndependent || !ai.aiOptional || !['free_assist','core'].includes(ai.mode)) fail('AI gateway must remain provider-independent and optional');

if (failures.length) {
  console.error(`Central module validation failed (${failures.length})`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`✅ EKODI central modules validated across ${active.length} active/preparing services: permission, workflow, evidence and AI gateway.`);
