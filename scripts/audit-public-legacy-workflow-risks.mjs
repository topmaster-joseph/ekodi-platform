/**
 * Observe fixed public legacy source workflows without credentials or mutation.
 * A workflow text pattern is a migration blocker, not proof of a live deploy.
 * Private repos, unknown files and network failure ALWAYS remain unverified.
 */
import {createHash} from 'node:crypto';

export const REGISTERED_SATELLITES=Object.freeze([
  'topmaster-joseph/ekodi-site',
  'topmaster-joseph/ekodi-mall',
  'topmaster-joseph/ekodi-church',
  'topmaster-joseph/jadam-maru',
  'topmaster-joseph/cheonggye-market',
  'topmaster-joseph/cheonggye-merchants-site'
]);
export const FIXED_PUBLIC_PROBES=Object.freeze([
  Object.freeze({repository:'topmaster-joseph/ekodi-site',path:'.github/workflows/deploy-cloudflare.yml',kind:'pages-publisher'}),
  Object.freeze({repository:'topmaster-joseph/ekodi-church',path:'.github/workflows/worship-auto-merge.yml',kind:'repository-merger'}),
  Object.freeze({repository:'topmaster-joseph/cheonggye-market',path:'.github/workflows/cloudflare-pages-deploy.yml',kind:'pages-publisher'})
]);
const MAX_BYTES=131072;
const getUrl=probe=>'https://raw.githubusercontent.com/'+probe.repository+'/main/'+probe.path;
const unknown=(probe,reason)=>({
  repository:probe.repository,path:probe.path,kind:probe.kind,
  status:'unavailable-unknown',reason,sourceTextSha256:null,
  deploymentOrMergeConfirmed:false,retirementCertified:false
});

export function classifyLegacyWorkflowText(probe,content) {
  const text=String(content||'');
  const configured=/^on:\s*$/m.test(text);
  const push=configured&&/^  push\s*:/m.test(text);
  const workflowRun=configured&&/^  workflow_run\s*:/m.test(text);
  const deploy=/(?:\bpages\s+deploy\b|cloudflare\/wrangler-action@)/i.test(text);
  const merge=/github\.rest\.pulls\.merge\s*\(/.test(text)&&/contents:\s*write/.test(text);
  const suspected=probe.kind==='pages-publisher'&&push&&deploy
    ?'possible-active-production-deployer'
    :probe.kind==='repository-merger'&&workflowRun&&merge
    ?'possible-active-repository-merger':'no-publishing-pattern-detected';
  return {
    repository:probe.repository,path:probe.path,kind:probe.kind,status:suspected,
    reason:suspected==='no-publishing-pattern-detected'
      ?'static-pattern-absence-does-not-prove-inactive-runtime'
      :'legacy-write-path-must-be-reconciled-before-source-retirement',
    sourceTextSha256:createHash('sha256').update(text).digest('hex'),
    deploymentOrMergeConfirmed:false,retirementCertified:false
  };
}

export async function auditPublicLegacyWorkflowRisks({
  fetcher=fetch,now=new Date(),probes=FIXED_PUBLIC_PROBES,satellites=REGISTERED_SATELLITES
}={}) {
  if(!Array.isArray(satellites)||new Set(satellites).size!==satellites.length||
     !Array.isArray(probes)||probes.some(p=>!satellites.includes(p.repository))) {
    throw Error('invalid-legacy-workflow-audit-scope');
  }
  const checked=[];
  for(const probe of probes) {
    try{
      const response=await fetcher(getUrl(probe),{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{accept:'text/plain'},signal:AbortSignal.timeout(12000)
      });
      if(!response?.ok){checked.push(unknown(probe,'http-'+String(response?.status??'no-response')));continue}
      const size=Number(response.headers?.get?.('content-length')||0);
      if(Number.isFinite(size)&&size>MAX_BYTES){checked.push(unknown(probe,'response-too-large'));continue}
      const text=await response.text();
      if(Buffer.byteLength(text,'utf8')>MAX_BYTES){checked.push(unknown(probe,'response-too-large'));continue}
      checked.push(classifyLegacyWorkflowText(probe,text));
    }catch{checked.push(unknown(probe,'public-workflow-probe-unreachable'))}
  }
  const rows=satellites.map(repository=>{
    const observations=checked.filter(x=>x.repository===repository);
    return {
      repository,observations,
      status:observations.some(x=>x.status.startsWith('possible-active-'))
        ?'review-required-legacy-writer'
        :'unverified-no-runtime-certification',
      deletionDecision:'retain'
    };
  });
  return{
    contract:'ekodi.public-legacy-workflow-risk.v1',
    mode:'fixed-public-read-only-no-github-provider-production-mutations',
    observedAt:new Date(now).toISOString(),
    totalRegisteredSatellites:rows.length,
    publicWorkflowFilesAttempted:checked.length,
    possibleActiveLegacyWriters:checked.filter(x=>x.status.startsWith('possible-active-')).length,
    unverifiedRepositoryCount:rows.filter(x=>x.status==='unverified-no-runtime-certification').length,
    providerWorkflowActivationChecked:false,
    privateRepositoryWorkflowsChecked:false,
    cloudflareSourceBindingChecked:false,
    credentialOrWebhookInventoryChecked:false,
    repositoryDeletionAuthorized:false,
    anyRepositoryDeleted:false,
    repositories:rows
  };
}
