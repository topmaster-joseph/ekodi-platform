import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const readJson=async path=>JSON.parse((await readFile(new URL('../'+path,import.meta.url),'utf8')).replace(/^\uFEFF/,''));

export const MANDATORY_PRE_DELETION_EVIDENCE=Object.freeze([
  'verified-legal-source-ownership-and-permission',
  'complete-repository-history-mirror-or-bundle-offsite',
  'restorable-backup-hash-and-restore-drill',
  'all-source-references-and-webhooks-migrated',
  'all-ci-release-and-cron-triggers-migrated-or-disabled',
  'one-canonical-production-source-and-deploy-owner',
  'guarded-staging-release-and-production-source-provenance',
  'cross-site-regression-and-real-pc-mobile-auth',
  'tenant-finance-personal-data-and-secrets-isolation',
  'independent-release-and-rollback-test',
  'legacy-deploy-credentials-revoked-and-live-bindings-reconciled',
  'approved-orchestrator-release-receipt',
  'explicit-repository-scoped-owner-deletion-authorization'
]);
export const MANDATORY_POST_DELETION_EVIDENCE=Object.freeze([
  'legacy-repository-absence-confirmed',
  'canonical-production-and-administrator-screens-reverified',
  'no-legacy-deploy-credentials-or-live-provider-binding',
  'recovery-archive-and-restoration-path-observable'
]);
const STAGES=new Set(['ownership-investigation','active-source','legacy-readonly-evidence','migration-planned','migration-staging','production-canary','post-cutover-observation','deletion-review','deleted-verified']);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const proofHasValue=value=>typeof value==='object' && value!==null && typeof value.reference==='string' && value.reference.trim().length>0 && typeof value.verifiedBy==='string' && value.verifiedBy.trim().length>0;

export function inspectSatelliteRepositoryRetirement(policy, registry, independentlyVerifiedEvidence={}) {
  const errors=[];
  if(policy?.schemaVersion!==1||policy?.policyId!=='SOURCE-REPO-RETIREMENT-001')errors.push('retirement policy schema/id drift');
  if(policy?.mode!=='read-only-retirement-gate')errors.push('retirement policy may not mutate GitHub or Cloudflare');
  if(policy?.automaticRepositoryDeletionAllowed!==false||policy?.directWorkerRepositoryDeletionAllowed!==false)errors.push('automatic repository deletion forbidden');
  if(policy?.defaultDecision!=='retain')errors.push('default must retain satellite repositories');
  if(policy?.separateReleaseUnitPreserved!==true)errors.push('independent release-unit preservation required');
  if(policy?.canonicalRepository!==registry?.canonicalPlatformRepository)errors.push('canonical repository mismatch');
  if(!Array.isArray(policy?.registeredSatellites))errors.push('satellite retirement entries missing');
  for(const evidence of MANDATORY_PRE_DELETION_EVIDENCE) {
    if(!policy?.requiredPreDeletionEvidence?.includes(evidence))errors.push('mandatory pre-deletion guard missing: '+evidence);
  }
  for(const evidence of MANDATORY_POST_DELETION_EVIDENCE) {
    if(!policy?.postDeletionEvidence?.includes(evidence))errors.push('mandatory post-deletion guard missing: '+evidence);
  }
  const registered=(registry?.repositories||[]).filter(x=>x.name!==registry?.canonicalPlatformRepository);
  const byName=new Map(registered.map(x=>[x.name,x]));
  const configured=policy?.registeredSatellites||[];
  const seen=new Set();
  const reviews=[];
  for(const entry of configured) {
    const name=String(entry?.repository||'').trim();
    if(!name||seen.has(name))errors.push('duplicate or missing satellite repository: '+(name||'(missing)'));
    seen.add(name);
    if(name===registry?.canonicalPlatformRepository)errors.push('canonical repository may never be a retirement target');
    const authority=byName.get(name);
    if(!authority)errors.push('unregistered satellite or missing source-of-truth entry: '+name);
    if(authority && entry.classification!==authority.role)errors.push('source-of-truth role drift for '+name);
    if(!STAGES.has(entry.stage))errors.push('unknown repository migration stage '+name);
    if(typeof entry.deleteRequested!=='boolean')errors.push('deletion request flag must be explicit for '+name);
    if(entry.stage==='deleted-verified')errors.push('deleted status requires reconciled, separately authorized source-of-truth mutation: '+name);
    if(entry.deleteRequested && entry.stage!=='deletion-review')errors.push('deletion request without review stage: '+name);
    if(authority?.role==='unclassified-satellite' && entry.stage!=='ownership-investigation')errors.push('unclassified satellite must remain in ownership investigation: '+name);
    const evidence=independentlyVerifiedEvidence?.[name];
    const missing=MANDATORY_PRE_DELETION_EVIDENCE.filter(key=>!proofHasValue(evidence?.[key]));
    // This audit can report a *review candidate*, but never authorizes deletion or performs it.
    const candidate=Boolean(entry.deleteRequested && entry.stage==='deletion-review' && missing.length===0 && authority?.role!=='unclassified-satellite');
    reviews.push({
      repository:name,
      stage:entry.stage,
      deleteRequested:entry.deleteRequested,
      readiness: candidate ? 'external-owner-review-required' : 'retain',
      missingEvidence:missing,
      needsManualDeletionAction:candidate,
      performedDeletion:false
    });
  }
  for(const r of registered)if(!seen.has(r.name))errors.push('missing satellite retirement entry: '+r.name);
  return Object.freeze({
    policyId:'SOURCE-REPO-RETIREMENT-001',
    mode:'read-only-retirement-gate',
    canonicalRepository:registry?.canonicalPlatformRepository||null,
    registeredSatelliteRepositories:registered.length,
    deletionCompleted:false,
    deletionExecutableByThisTool:false,
    repositories:reviews,
    errors
  });
}

export async function inspectCurrentRepositoryRetirements() {
  const [policy,registry]=await Promise.all([
    readJson('config/site-repository-retirement-readiness.json'),
    readJson('config/repository-source-of-truth.json')
  ]);
  // The checked-in policy never contains live, independently verified deletion evidence.
  return inspectSatelliteRepositoryRetirement(policy,registry);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  inspectCurrentRepositoryRetirements().then(result=>{
    console.log(JSON.stringify(result,null,2));
    if(result.errors.length)process.exitCode=1;
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
