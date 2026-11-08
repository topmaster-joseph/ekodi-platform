/**
 * Privacy-safe, read-only observation of Cloudflare Pages project source metadata.
 *
 * The Pages project listing returns production deployment trigger metadata,
 * but neither that response nor a trigger SHA proves which GitHub workflow
 * actually published the asset or which Worker owns the apex route.
 * Never include env_vars, build_config, free-text commit messages, account
 * identifiers, arbitrary repository names or tokens in GitHub artifacts.
 */
const KNOWN_PROJECTS=Object.freeze([
  ['ekodi-church','topmaster-joseph/ekodi-church'],
  ['ekodilab','topmaster-joseph/ekodi-site'],
  ['cheonggye-market','topmaster-joseph/cheonggye-market']
]);
const CANONICAL_REPO='topmaster-joseph/ekodi-platform';
const SHA40=/^[a-f0-9]{40}$/i;
const safeBranch=value=>typeof value==='string'&&/^[a-zA-Z0-9_./-]{1,96}$/.test(value)?value:null;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?
  new Date(value).toISOString():null;

function projectEvidence(project,name,legacyRepo) {
  if(!project)return {
    project:name,presentInAuthorizedAccount:false,
    status:'not-listed-in-this-account',
    configuredSource:'unknown',sourceProvider:'unknown',
    configuredProductionBranch:null,productionTriggerBranch:null,
    productionTriggerKind:'unknown',productionTriggerCommitSha:null,
    productionTriggerObservedAt:null,canonicalDeploymentSucceeded:false,
    apexBindingVerified:false,releaseReceiptMatched:false,
    providerSourceProvesActualPublisher:false,repositoryDeletionAuthorized:false
  };
  const source=project.source;
  const sourceProvider=['github','gitlab'].includes(source?.type)?source.type:'unknown';
  const config=source?.config;
  const owner=typeof config?.owner==='string'?config.owner.trim().toLowerCase():'';
  const repository=typeof config?.repo_name==='string'?config.repo_name.trim().toLowerCase():'';
  const repoFull=repository.includes('/')?repository:(owner&&repository?owner+'/'+repository:'');
  const configuredSource=sourceProvider==='github'&&repoFull===CANONICAL_REPO
    ?'canonical-repository-configured'
    :sourceProvider==='github'&&repoFull===legacyRepo
      ?'registered-legacy-repository-configured':'unknown';
  const deployment=project.canonical_deployment;
  const meta=deployment?.deployment_trigger?.metadata;
  const triggerKind=['ad_hoc','github:push','deploy_hook'].includes(deployment?.deployment_trigger?.type)
    ?deployment.deployment_trigger.type:'unknown';
  const commit=typeof meta?.commit_hash==='string'&&SHA40.test(meta.commit_hash)
    ?meta.commit_hash.toLowerCase():null;
  const succeeded=deployment?.environment==='production'&&
    deployment?.is_skipped===false&&deployment?.latest_stage?.status==='success';
  return{
    project:name,presentInAuthorizedAccount:true,
    status:commit&&succeeded?'production-trigger-metadata-observed':'incomplete-production-metadata',
    configuredSource,sourceProvider,
    configuredProductionBranch:safeBranch(project.production_branch),
    productionTriggerBranch:safeBranch(meta?.branch),
    productionTriggerKind:triggerKind,
    productionTriggerCommitSha:commit,
    productionTriggerObservedAt:iso(deployment?.created_on),
    canonicalDeploymentSucceeded:Boolean(succeeded),
    // These are never inferred from Cloudflare's list-projects response.
    apexBindingVerified:false,releaseReceiptMatched:false,
    providerSourceProvesActualPublisher:false,repositoryDeletionAuthorized:false
  };
}

export function auditKnownCloudflarePagesProjectSources(projects) {
  if(!Array.isArray(projects))throw Error('cloudflare-project-evidence-array-required');
  const known=new Map(KNOWN_PROJECTS);
  const found=new Map();
  for(const project of projects) {
    if(project&&typeof project==='object'&&known.has(project.name)){
      if(found.has(project.name))throw Error('duplicate-cloudflare-project-source-evidence');
      found.set(project.name,project);
    }
  }
  const rows=KNOWN_PROJECTS.map(([name,legacyRepo])=>
    projectEvidence(found.get(name),name,legacyRepo));
  return{
    contract:'ekodi.cloudflare-pages-source-metadata.v1',
    mode:'read-only-observation-only',
    provider:'Cloudflare Pages projects list GET',
    observedRegisteredProjects:rows.filter(x=>x.presentInAuthorizedAccount).length,
    totalRegisteredProjects:rows.length,
    noSecretsOrUnregisteredProjectsIncluded:true,
    productionPagesBindingVerified:false,
    exactProtectedReleaseReceiptVerified:false,
    configuredGitRepositoryDoesNotProvePublisher:true,
    independentRollbackVerified:false,
    repositoryDeletionAuthorized:false,
    rows
  };
}
