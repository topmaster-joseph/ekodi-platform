import { readFile } from 'node:fs/promises';
import { AI_ORCHESTRATOR_DIRECTIVE, buildAiExecutionProtocol, evaluateAiCompletionEvidence } from '../ai-orchestrator-directive.js';
import { buildEkodiCommandPlan } from '../ekodi-command-plane.js';

const root = new URL('../', import.meta.url);
const policy = JSON.parse(await readFile(new URL('config/ai-orchestrator-operating-directive.json', root), 'utf8'));

assert(policy.id === AI_ORCHESTRATOR_DIRECTIVE.id, 'runtime directive id must match source policy');
assert(policy.version === AI_ORCHESTRATOR_DIRECTIVE.version, 'runtime directive version must match source policy');
assert(policy.status === 'active', 'directive must be active');
assert(policy.authority?.thisDirectiveIsSubordinate === true, 'directive must remain subordinate to the Constitution');
assert(policy.authority?.authorityExpansionForbidden === true, 'AI authority expansion must remain forbidden');
assert(policy.authority?.securityWeakeningForbidden === true, 'security weakening must remain forbidden');
assert(JSON.stringify(policy.operatingLifecycle) === JSON.stringify(AI_ORCHESTRATOR_DIRECTIVE.lifecycle), 'runtime lifecycle must match policy');
assert(JSON.stringify(policy.futureCompatibility?.sourceOfTruthPriority) === JSON.stringify(AI_ORCHESTRATOR_DIRECTIVE.sourceOfTruthPriority), 'source-of-truth priority must match');
assert(policy.verificationRules?.length === AI_ORCHESTRATOR_DIRECTIVE.verificationRules.length, 'verification rule count must match');
assert(policy.mathAndCoding?.requiredTestClasses?.includes('failure'), 'failure testing must remain required for coding work');
assert(policy.mathAndCoding?.requiredTestClasses?.includes('regression'), 'regression testing must remain required for coding work');
assert(policy.futureCompatibility?.implementationNamesAreExamplesNotPermanentMandates === true, 'implementation names must not become permanent mandates');
assert(policy.futureCompatibility?.vendorModelApiFrameworkDomainAndDeploymentLockInForbiddenByDefault === true, 'vendor lock-in must remain forbidden by default');

const protocol = buildAiExecutionProtocol({ productionImpacting: true, material: true, domain: 'coding' });
assert(protocol.requiredVerification.productionVerification === true, 'production-impacting work must require production verification');
assert(protocol.requiredVerification.regressionEvidence === true, 'material work must require regression evidence');
assert(protocol.requiredVerification.independentCrossCheck === true, 'material work must require independent cross-check');
assert(protocol.requiredVerification.mathCodingCrossCheck === true, 'coding work must require math/coding cross-check semantics');

const incomplete = evaluateAiCompletionEvidence({
  productionImpacting: true,
  material: true,
  executed: true,
  tested: true,
  regressionChecked: true,
  productionVerified: false,
  operationalHealthChecked: true,
});
assert(incomplete.complete === false, 'deployment without production verification must not be complete');
assert(incomplete.reasons.includes('production_not_verified'), 'missing production verification reason required');

const complete = evaluateAiCompletionEvidence({
  productionImpacting: true,
  material: true,
  executed: true,
  tested: true,
  regressionChecked: true,
  productionVerified: true,
  operationalHealthChecked: true,
});
assert(complete.complete === true, 'fully evidenced production work should be verified complete');

const mockProvider = {
  id: 'mock-local',
  available: true,
  priority: 1,
  capabilities: ['text', 'reasoning', 'review'],
  costClass: 'free',
  invoke: async () => ({ ok: true }),
};
const plan = buildEkodiCommandPlan({ taskId: 'directive_validation', goal: 'validate directive integration', risk: 'normal' }, [mockProvider]);
assert(plan.operatingDirective?.id === AI_ORCHESTRATOR_DIRECTIVE.id, 'command plans must carry the operating directive');
assert(plan.executionProtocol?.directiveVersion === AI_ORCHESTRATOR_DIRECTIVE.version, 'command plans must carry the execution protocol');

console.log(`AI orchestrator directive valid: ${policy.version} (${policy.verificationRules.length} verification rules)`);

function assert(condition, message) {
  if (!condition) {
    console.error(`AI orchestrator directive validation failed: ${message}`);
    process.exit(1);
  }
}
