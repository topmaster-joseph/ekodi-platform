const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const BASE_SHA='520d4f2daf7e5e4dc53bf928c9df626b5f896600';
const BASE_TREE='30f2d5396b416aec9aca9773c84710052f4f8c35';
const APPROVED_PR_HEADS=new Map([
  [143,'9e8fc072d1d6d66286d9a275fe3960e50e5c5e72'],
  [144,'b752da0de6520b934b585a1c2a75d8e7af065ac7'],
  [142,'1607bc1c06157c420afabe3bfc62cca9073738c8']
]);
const fail=message=>{throw new Error('Church reviewed source: '+message);};
const unique=values=>new Set(values).size===values.length;
const equalSets=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));

/**
 * Both contracts remain read-only sources. The legacy shadow contract supports
 * old isolated unit-test fixtures. The reviewed integration contract is strict
 * and never grants production cutover or legacy GitHub deletion authority.
 */
export function verifyReviewedChurchSource(manifest) {
  if(manifest?.contract==='ekodi.church-shadow-import.v1' &&
     manifest?.mode==='shadow-source-only')return null;
  if(manifest?.contract!=='ekodi.church-reviewed-integration.v1' ||
     manifest?.mode!=='candidate-with-reviewed-unmerged-upstream-prs')
    fail('unknown or downgraded source contract');
  if(manifest.sourceRepository!=='topmaster-joseph/ekodi-church' ||
     manifest.sourceCommit!==BASE_SHA || manifest.sourceTree!==BASE_TREE)
    fail('immutable original import provenance changed');
  if(manifest.originalImportedTrackedFileCount!==208 ||
     manifest.importedTrackedFileCount!==212 ||
     manifest.productionReleaseSwitched!==false ||
     manifest.sourceOwnershipTransferred!==false ||
     manifest.legacyRepositoryDeletionAuthorized!==false ||
     manifest.nestedWorkflowFilesInert!==false ||
     manifest.excludedWorkflows?.length!==8)
    fail('source inventory, release authority or original workflow exclusion drifted');
  const reviewed=manifest.reviewedOverlays;
  if(reviewed?.contract!=='ekodi.church-upstream-pr-audit.v1' ||
     reviewed.originalSnapshotSha!==BASE_SHA ||
     reviewed.originalSnapshotTreeSha!==BASE_TREE ||
     reviewed.sourceStatus!=='upstream-prs-pending-merge' ||
     reviewed.oldDeploymentWorkflowsExcluded!==true ||
     reviewed.protectedMainMigrationOnly!==true ||
     reviewed.legacyRepositoryDeletionAuthorized!==false ||
     JSON.stringify(reviewed.integrationOrder)!==JSON.stringify([143,144,142]))
    fail('unapproved integration sequence or release authority');
  if(!Array.isArray(reviewed.pullRequests)||reviewed.pullRequests.length!==3)
    fail('all three Church source change sets must have exact audit receipts');
  const pullMap=new Map();
  const changedPaths=new Set();
  for(const pull of reviewed.pullRequests){
    if(APPROVED_PR_HEADS.get(pull.number)!==pull.headSha ||
       pull.repo!=='topmaster-joseph/ekodi-church' ||
       pull.sourceStatusAtIntegration!=='open' ||
       !HEX64.test(pull.auditedPatchSha256||'') ||
       !Array.isArray(pull.changedSourcePaths) || !unique(pull.changedSourcePaths))
      fail('invalid audited PR head or patch hash: '+pull.number);
    pullMap.set(pull.number,pull);
    for(const path of pull.changedSourcePaths){
      if(!path||path.startsWith('/')||path.includes('..')||path.startsWith('.github/'))
        fail('untrusted or executable legacy workflow change: '+path);
      changedPaths.add(path);
    }
  }
  if(pullMap.size!==3 || !Array.isArray(manifest.trackedFiles) ||
     manifest.trackedFiles.length!==212 || !unique(manifest.trackedFiles.map(x=>x.path)))
    fail('incomplete or duplicated imported source files');
  const tracked=new Map(manifest.trackedFiles.map(x=>[x.path,x]));
  const normalized=manifest.trackedFiles
    .filter(x=>x.normalizedBlobSha&&x.normalizedBlobSha!==x.blobSha)
    .map(x=>x.path);
  if(!Array.isArray(manifest.canonicalizedPaths) ||
     !equalSets(new Set(normalized),new Set(manifest.canonicalizedPaths)) ||
     manifest.canonicalizedPaths.length!==new Set(manifest.canonicalizedPaths).size)
    fail('normalized Git blob inventory is incomplete or duplicated');
  if(!Array.isArray(reviewed.changedFiles) ||
     reviewed.changedFiles.length!==changedPaths.size ||
     reviewed.changedFiles.length!==20 ||
     !unique(reviewed.changedFiles.map(x=>x.path)))
    fail('reviewed source path inventory drifted');
  let added=0;
  for(const recorded of reviewed.changedFiles){
    const item=tracked.get(recorded.path);
    if(!item||!changedPaths.has(recorded.path)||
       recorded.finalCanonicalBlobSha!==(item.normalizedBlobSha||item.blobSha) ||
       !HEX40.test(recorded.finalCanonicalBlobSha||''))
      fail('mismatched canonical Git blob for '+recorded.path);
    if(!Array.isArray(recorded.sourceChain)||!recorded.sourceChain.length)
      fail('missing original upstream provenance for '+recorded.path);
    if(!recorded.originalBaseBlobSha){added++;if(item.blobSha!==recorded.sourceChain[0].upstreamBlobSha)fail('new source origin mismatch: '+recorded.path);}
    else if(item.blobSha!==recorded.originalBaseBlobSha)fail('original base blob was modified for '+recorded.path);
    const expectedChains=[...pullMap.values()].filter(p=>p.changedSourcePaths.includes(recorded.path)).map(p=>p.number).sort();
    const observedChains=recorded.sourceChain.map(x=>x.prNumber).sort();
    if(!unique(observedChains)||JSON.stringify(observedChains)!==JSON.stringify(expectedChains))
      fail('missing or duplicated PR source-chain proof for '+recorded.path);
    for(const link of recorded.sourceChain){
      if(APPROVED_PR_HEADS.get(link.prNumber)!==link.headSha ||
         !pullMap.get(link.prNumber)?.changedSourcePaths.includes(recorded.path) ||
         !HEX40.test(link.upstreamBlobSha||'') ||
         !['A','M'].includes(link.status))
        fail('unaudited PR chain for '+recorded.path);
    }
  }
  if(added!==4)fail('four reviewed upstream additions must be preserved without replacing the original snapshot');
  return Object.freeze({
    originalSourceSha:BASE_SHA,
    integrationOrder:Object.freeze([143,144,142]),
    pullRequests:Object.freeze(reviewed.pullRequests.map(x=>Object.freeze({number:x.number,headSha:x.headSha})))
  });
}
