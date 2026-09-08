import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';
import { getControlPlaneSummary } from './cognitive-control-plane.js';
import { getSovereignAutonomySummary } from './sovereign-autonomy-runtime.js';
import {AI_MISSION_RUNTIME,evaluateMissionAction} from './ai-governance-runtime.js';

export const AI_CONTROL_POLICY = Object.freeze({
  version: '0.6.0',
  defaultMode: 'parallel',
  modes: Object.freeze(['parallel']),
  providerOrder: Object.freeze([
    'gemini-free',
    'node:codex',
    'node:gemini-cli',
    'node:claude-code',
    'openai-api',
    'anthropic-api',
    'worker:claude',
    'worker:chatgpt',
    'worker:gemini',
    'worker:notebooklm',
    'worker:aistudio',
  ]),
  maxPromptLength: 24000,
  maxParallelProviders: 5,
  executionEnvironment: 'development',
  originPreservation: true,
  finalSynthesisRole: 'origin-synthesis',
  controlPlane: getControlPlaneSummary(),
  sovereignAutonomy: getSovereignAutonomySummary(),
  missionPolicyVersion: AI_MISSION_RUNTIME.version,
});

const clean = value => String(value ?? '').trim();
const unique = values => [...new Set(values.filter(Boolean))];
const clip = (value, max=4000) => clean(value).slice(0,max);

const ORIGIN_ALIASES = Object.freeze({
  chatgpt:'chatgpt',gpt:'chatgpt',openai:'chatgpt','openai-api':'chatgpt','worker:chatgpt':'chatgpt',codex:'codex','node:codex':'codex',
  claude:'claude',anthropic:'claude','anthropic-api':'claude','worker:claude':'claude','claude-code':'claude','node:claude-code':'claude',
  gemini:'gemini',google:'gemini','gemini-free':'gemini','worker:gemini':'gemini','gemini-cli':'gemini','node:gemini-cli':'gemini',
  ekodi:'ekodi',unknown:'ekodi',
});

const ORIGIN_PROVIDER_PREFERENCES = Object.freeze({
  chatgpt:Object.freeze(['worker:chatgpt','openai-api','node:codex']),
  codex:Object.freeze(['node:codex','openai-api','worker:chatgpt']),
  claude:Object.freeze(['worker:claude','anthropic-api','node:claude-code']),
  gemini:Object.freeze(['worker:gemini','gemini-free','node:gemini-cli']),
  ekodi:Object.freeze([]),
});

export function createTaskId(now = new Date(), random = Math.random) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(4, '0').slice(0, 4);
  return `task-${stamp}-${suffix}`;
}

export function normalizeOrigin(input = {}) {
  const raw = input.origin && typeof input.origin === 'object' ? input.origin : {};
  const requestedProvider = clean(raw.provider || input.originProvider || input.sourceProvider || 'ekodi').toLowerCase();
  const provider = ORIGIN_ALIASES[requestedProvider] || requestedProvider || 'ekodi';
  const channel = clip(raw.channel || input.originChannel || input.sourceChannel || provider, 80).toLowerCase() || provider;
  const requestId = clip(raw.requestId || raw.request_id || input.originRequestId || input.requestId, 160);
  return Object.freeze({provider,channel,requestId,requestedProvider:requestedProvider||provider});
}

export function taskOrigin(task = {}) {
  const raw = task.origin || task.governance?.origin || {};
  return normalizeOrigin({origin:raw});
}

export function providerFamily(providerId = '') {
  const id=clean(providerId).toLowerCase();
  if(['openai-api','worker:chatgpt','node:codex'].includes(id))return'openai';
  if(['anthropic-api','worker:claude','node:claude-code'].includes(id))return'anthropic';
  if(['gemini-free','worker:gemini','node:gemini-cli'].includes(id))return'google';
  return id.startsWith('worker:')?'worker':id.startsWith('node:')?'node':id||'unknown';
}

function originFamily(origin = {}) {
  if(['chatgpt','codex'].includes(origin.provider))return'openai';
  if(origin.provider==='claude')return'anthropic';
  if(origin.provider==='gemini')return'google';
  return origin.provider;
}

export function normalizeTaskInput(input = {}) {
  const prompt = clean(input.prompt);
  if (!prompt) throw new Error('prompt_required');
  if (prompt.length > AI_CONTROL_POLICY.maxPromptLength) throw new Error('prompt_too_long');
  const requestedMode = clean(input.mode).toLowerCase();
  const mode = AI_CONTROL_POLICY.defaultMode;
  const title = clean(input.title).slice(0, 160) || prompt.replace(/\s+/g, ' ').slice(0, 80);
  const requestedProviders = unique(Array.isArray(input.providers) ? input.providers.map(v=>clean(v).toLowerCase()) : []);
  const needsCodeBranch = input.needsCodeBranch === true || /\b(code|coding|git|github|branch|deploy|worker|repository|repo)\b/i.test(prompt) || /코드|코딩|깃|브랜치|배포|저장소/.test(prompt);
  const origin=normalizeOrigin(input);
  const g = input.governance && typeof input.governance === 'object' ? input.governance : {};
  const governance = Object.freeze({agentId:clean(g.agentId||input.agentId||'chief')||'chief',area:clean(g.area||input.actionArea||(needsCodeBranch?'software_change':'general_assistance'))||'general_assistance',delegated:g.delegated===true,reversible:g.reversible===true,logged:g.logged===true,preflightVerified:g.preflightVerified===true,reducesUserRights:g.reducesUserRights===true,crossTenantPrivateData:g.crossTenantPrivateData===true,highImpact:g.highImpact===true,personId:clean(g.personId||g.person_id),workspaceId:clean(g.workspaceId||g.workspace_id),role:clean(g.role),capability:clean(g.capability),production:g.production===true,standingDelegation:g.standingDelegation===true,existingBoundary:g.existingBoundary===true,rollbackDefined:g.rollbackDefined===true,verificationDefined:g.verificationDefined===true,postVerificationRequired:g.postVerificationRequired===true,automaticRollback:g.automaticRollback===true,knownStableTarget:g.knownStableTarget===true,paidCommitment:g.paidCommitment===true,explicitDelegatedBudget:g.explicitDelegatedBudget===true,permissionExpansion:g.permissionExpansion===true,canonicalIdentityChange:g.canonicalIdentityChange===true,workspaceAuthorityChange:g.workspaceAuthorityChange===true,destructiveDataChange:g.destructiveDataChange===true,massDataChange:g.massDataChange===true,newDomainOwnership:g.newDomainOwnership===true,securityBoundaryChange:g.securityBoundaryChange===true,newIndependentDeployment:g.newIndependentDeployment===true,providerLockIn:g.providerLockIn===true,productionSecretChange:g.productionSecretChange===true,productionDnsChange:g.productionDnsChange===true,violates:unique(Array.isArray(g.violates)?g.violates.map(clean):[]),origin});
  return Object.freeze({title,prompt,mode,requestedMode,requestedProviders,needsCodeBranch,origin,executionEnvironment:AI_CONTROL_POLICY.executionEnvironment,governance});
}

export function evaluateTaskMissionPolicy(task = {}) {
  const governance=task.governance||{agentId:'chief'};
  const decision=evaluateMissionAction(governance);
  if (decision.tier==='forbidden'||decision.tier==='human_gate') return Object.freeze({...decision,forbidden:decision.tier==='forbidden',humanGate:decision.tier==='human_gate',analysisOnly:true,allowModelConsultation:decision.tier!=='forbidden',autonomousActionAllowed:false,humanApprovalRequired:decision.tier==='human_gate'});
  if (governance.production) {
    const sovereign=evaluateAutonomousOperation({area:'bounded_production_promotion',...governance,audited:governance.logged});
    const humanGate=sovereign.tier==='human_gate';
    return Object.freeze({...decision,forbidden:false,humanGate,analysisOnly:true,allowModelConsultation:true,autonomousActionAllowed:false,humanApprovalRequired:humanGate,controlPlaneRequired:true,standingDelegationEligible:sovereign.standingDelegationEligible===true,standingDelegationMissing:sovereign.standingDelegationMissing||[],sovereignDecision:sovereign});
  }
  const autonomousActionAllowed=['observe','execute_reversible'].includes(decision.tier);
  return Object.freeze({...decision,forbidden:false,humanGate:false,analysisOnly:!autonomousActionAllowed,allowModelConsultation:true,autonomousActionAllowed,humanApprovalRequired:false});
}

export function availableProviderIds(capabilities = {}) {
  const ids = [];
  if (capabilities.geminiFree) ids.push('gemini-free');
  for (const id of capabilities.nodeProviders || []) ids.push(`node:${clean(id).toLowerCase()}`);
  if (capabilities.openaiApi) ids.push('openai-api');
  if (capabilities.anthropicApi) ids.push('anthropic-api');
  for (const id of capabilities.workerProviders || []) ids.push(`worker:${clean(id).toLowerCase()}`);
  return unique(ids);
}

export function resolveOriginResponseProvider(task, capabilities = {}) {
  const available=availableProviderIds(capabilities);
  if(!available.length)return'';
  const origin=taskOrigin(task);
  const preferences=ORIGIN_PROVIDER_PREFERENCES[origin.provider]||[];
  const exact=preferences.find(id=>available.includes(id));
  if(exact)return exact;
  const family=originFamily(origin);
  const sameFamily=available.find(id=>providerFamily(id)===family);
  if(sameFamily)return sameFamily;
  return AI_CONTROL_POLICY.providerOrder.find(id=>available.includes(id))||available[0];
}

export function isOriginPreserved(task, providerId) {
  const origin=taskOrigin(task);
  if(origin.provider==='ekodi')return true;
  return providerFamily(providerId)===originFamily(origin);
}

export function buildExecutionPlan(task, capabilities = {}) {
  const available = availableProviderIds(capabilities);
  const requested = task.requestedProviders?.length ? task.requestedProviders.filter(id => available.includes(id)) : [];
  const base = requested.length ? requested : AI_CONTROL_POLICY.providerOrder.filter(id => available.includes(id));
  const originProvider=resolveOriginResponseProvider(task,capabilities);
  const ordered=unique([originProvider,...base]);
  if (!ordered.length) return Object.freeze([]);
  return Object.freeze(ordered.slice(0,AI_CONTROL_POLICY.maxParallelProviders).map((providerId,index)=>Object.freeze({providerId,role:providerId===originProvider?'origin-primary':`parallel-${index+1}`})));
}

export function rolePrompt(task, role, context = {}) {
  const branch = clean(context.branch);
  const mission = context.missionDecision || task.missionDecision || null;
  const origin=taskOrigin(task);
  return [
    `EKODI task: ${task.title}`,
    `Role: ${role}`,
    `Execution mode: parallel; provider ceiling: ${AI_CONTROL_POLICY.maxParallelProviders}`,
    `Origin envelope: provider=${origin.provider}; channel=${origin.channel}; requestId=${origin.requestId||'none'}`,
    `Execution environment: ${task.executionEnvironment || AI_CONTROL_POLICY.executionEnvironment}`,
    branch ? `Isolated branch: ${branch}` : 'No source branch has been allocated for this task.',
    'Work independently from the other parallel providers. Surface evidence, disagreements, risks, and the strongest solution for the origin synthesizer.',
    'Respect least privilege and the central review, merge, and deployment gate.',
    'Never mutate production directly. Production changes must promote the same verified immutable artifact through Governance Plane.',
    mission ? `Mission gate: ${mission.tier} (${mission.reason}); policy ${mission.policyVersion}.` : '',
    mission?.analysisOnly ? 'Mission governance permits analysis, review, and candidate preparation only. Do not perform the underlying high-impact action.' : '',
    '',
    task.prompt,
  ].filter(Boolean).join('\n');
}

export function buildOriginSynthesisPrompt(task, runs = []) {
  const origin=taskOrigin(task);
  const successful=runs.filter(run=>run?.ok&&clean(run.output)&&run.role!==AI_CONTROL_POLICY.finalSynthesisRole).slice(0,AI_CONTROL_POLICY.maxParallelProviders);
  const evidence=successful.map((run,index)=>`[Parallel result ${index+1} | ${run.providerId} | ${run.role}]\n${clip(run.output,3200)}`).join('\n\n');
  return [
    'You are the final EKODI origin-preserving synthesizer.',
    `Return the final user-facing answer for the original ${origin.provider} origin on channel ${origin.channel}.`,
    'Do not expose internal orchestration chatter unless the user asks. Reconcile disagreements, prefer verified evidence, preserve important caveats, and produce one coherent final answer.',
    `Original request:\n${clip(task.prompt,6000)}`,
    `Parallel collaborators (${successful.length}):\n${evidence||'No successful collaborator output.'}`,
  ].join('\n\n');
}

export function summarizeRuns(runs = []) {
  const collaboration=runs.filter(run=>run.role!==AI_CONTROL_POLICY.finalSynthesisRole);
  const successful = collaboration.filter(run => run.ok);
  const failed = collaboration.filter(run => !run.ok);
  const synthesis=runs.find(run=>run.role===AI_CONTROL_POLICY.finalSynthesisRole)||null;
  return Object.freeze({total:collaboration.length,successful:successful.length,failed:failed.length,providers:collaboration.map(run=>run.providerId),parallel:true,maxParallelProviders:AI_CONTROL_POLICY.maxParallelProviders,needsHumanApproval:successful.length>0,synthesis:synthesis?{providerId:synthesis.providerId,state:synthesis.state,ok:synthesis.ok}:null});
}
