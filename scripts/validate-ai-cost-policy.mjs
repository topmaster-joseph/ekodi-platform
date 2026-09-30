import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8').replace(/^\uFEFF/,'');
const policy=JSON.parse(read('config/ai-cost-policy.json'));
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(policy.policyId==='AI-COST-001','policyId must remain AI-COST-001');
expect(policy.status==='enforced','AI cost policy must remain enforced');
expect(policy.principle==='free-first-never-free-only','constitutional free-first principle changed');
expect(policy.automaticPaidBudgetKrw===0,'automatic paid AI budget must remain KRW 0');
expect(policy.paidApiAutoEscalation===false,'paid API auto escalation must remain disabled');
expect(policy.paidApiRequiresExplicitDelegatedBudget===true,'paid AI must require explicit delegated budget');
expect(policy.consumerWebAutomationAllowed===false,'consumer web AI must not be used unattended');
expect(policy.coreFallbackRequired===true,'Core fallback must remain required');
expect(Array.isArray(policy.freeExhaustedFallback)&&policy.freeExhaustedFallback.includes('core-only'),'free exhaustion must fall back through Core');

const costSource=read('ai-cost-policy.js');
expect(costSource.includes("paidCommitment === true && source?.explicitDelegatedBudget === true"),'paid authorization must require commitment and delegated budget');
expect(costSource.includes("blockedBy:'paid_or_unclassified_cost_requires_explicit_budget'"),'paid/unclassified hard block missing');
expect(costSource.includes("blockedBy:'free_quota_exhausted'"),'free quota exhaustion gate missing');

const providerSource=read('ai-provider-control.js');
expect(providerSource.includes("providerCostEligibility(id,{})"),'public/provider automatic route must use zero-cost gate');
expect(providerSource.includes("status:'cost-blocked'"),'scheduled paid provider health must be cost-blocked');
expect(providerSource.includes("governance={}"),'trusted internal paid route must require explicit governance context');
const controlSource=read('ai-control-core.js');
expect(controlSource.includes("if (canonical === 'paid-opt-in') return canonical"),'known paid provider classes must not be relabeled');
const adminSource=read('ai-management-admin.js');
expect(adminSource.includes('AI-COST-001')&&adminSource.includes('AUTO PAID BUDGET KRW'),'admin must expose locked cost governance');
const governorSource=read('admin-ai-governor.js');
expect(governorSource.includes('paidApiAutoEscalation:false')&&governorSource.includes('automaticPaidBudgetKrw:0'),'admin governor must not plan automatic paid AI');
expect(governorSource.includes("gate=gate||'paid_ai'"),'admin governor must gate unbudgeted paid AI');
const registrySource=read('ekodi-ai-provider-registry.js');
expect(registrySource.includes("costClass:costClass('openai')")&&registrySource.includes("costClass:costClass('anthropic')")&&registrySource.includes("costClass:costClass('gemini')"),'provider registry must declare explicit cost classes');
const orchestratorSource=read('ai-orchestrator-runtime.js');
expect(orchestratorSource.includes('costClass: provider.costClass')&&orchestratorSource.includes('{ lane, governance }'),'orchestrator must preserve and enforce provider cost metadata');
const packageJson=JSON.parse(read('package.json'));
expect(packageJson.scripts?.check?.includes('npm run validate:ai-cost'),'full check must enforce AI cost policy');

if(failures.length){for(const failure of failures)console.error(`[AI-COST-001] ${failure}`);process.exitCode=1;}else{console.log('AI-COST-001 validated: free-first, paid opt-in, automatic paid budget KRW 0.');}
