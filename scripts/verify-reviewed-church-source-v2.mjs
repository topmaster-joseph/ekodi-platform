import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HISTORICAL_SOURCE_BLOB='09b01865a3f0ba99caf8b7b97fc787ee8ef83d51';
const PR_HEADS={
  "146": "b79dc3b19b562f9b654bffb55d797ea336c08d34",
  "149": "b89c32f9330afbd114dc632306a7b9348c869b7b"
};
const SOURCE_BLOBS={
  "146": {
    "church-homepage-layout.css": "380ec056ca472eaba538dc7840a45d916ed6ccd3",
    "church-i18n-extended.js": "2add4eee5c83fff672408a464f9f396e0adc795e",
    "church-i18n.js": "86f710116abee33562ed191cb924f366f76c63ee",
    "church-public-updates.css": "9229ba7eb5eccfa0d3cba2196781a6a5a4ec5799",
    "church-public-updates.js": "446936ca40d893b0c1dc6e128a91e2907436a741",
    "church-shared-schedules.js": "314b39ef88fa88c0bd49e02d59a6849ab38acd5d",
    "devotion/index.html": "f282755fe00ed052311eb5d98211e08939cba26f",
    "index.html": "5ab179901ccc87871831cfea73d989bca7b9b9db",
    "notices/index.html": "b511da63e7133d00ed6fe238d45e6c8ee54a9f85",
    "schedule/index.html": "804db74c194dd0b1b810423dd8f281a56039e490",
    "script.js": "603294d3e48ff4659b9232ca8b1bf181fd85a794",
    "test/church-approved-homepage-layout.test.mjs": "18697e3cd84381004545813ff67279b7fb258fc3",
    "test/church-home-overview-navigation.test.mjs": "a43e50b8434562b1ab6a64030ff9d090e2bcfb81",
    "test/church-public-notices-schedule.test.mjs": "1f50e776ab65623934ff775ac282011e25335f33",
    "test/church-shared-schedule-147.test.mjs": "0745a47058a625c001c4d306f91c59e4d5102dbd",
    "test/simple-home-progressive-disclosure.test.mjs": "a5e26bb5c1021e96920947802dd5024e591f6a1d"
  },
  "149": {
    "church-compact-navigation.css": "fcdb494c302d3692d5e82aca3aebd26014f51aa3",
    "church-i18n-extended.js": "d4f9ee7e51052c61e4baa7aaf1f87412ff69bcf5",
    "church-i18n.js": "c2123abf86c9db6bba98b90bcbc2540692fdb208",
    "church-section-nav.js": "9eb0de3e5332b324e8cd95872e57987a56b00f8b",
    "devotion/index.html": "08ef8c744271ec70b366ae84572e37603c2604b3",
    "index.html": "2b4250abdf28cdaa896bed325262c013f5996cda",
    "notices/index.html": "1036fb223e87cd8781741e56b6ac2ce06b097bbc",
    "schedule/index.html": "95fc21ab7cf6f4bd66aad51a285afc07774a8f41",
    "script.js": "f7b3ea040b28d788eff8e621d1891ea8a622b80a",
    "test/church-approved-homepage-layout.test.mjs": "9f69a1b10fc58b757ab3f89d02e8a72c75c92f7a",
    "test/church-compact-selected-navigation.test.mjs": "a634326bc6d70f8f3093ece0dd53cda1995bfcce",
    "test/church-devotion.test.mjs": "3787c765e6162157fcb2d610224e45db795eda1a",
    "test/church-home-overview-navigation.test.mjs": "0ce6412dddfe38df931166bbe224fa228bb91bc6",
    "test/church-life-hub.test.mjs": "f150f78154a49316b27301e82b96d38930e8fe0c",
    "test/church-live-entry.test.mjs": "c11c75776afba13c74fe02c58048cbe7c1f4dce6",
    "test/church-public-notices-schedule.test.mjs": "9d904189a7cd5a41cc82a49b98f993b024f285d4",
    "test/church-selected-panel-runtime.test.mjs": "cdb5a6c62e25e87ac729d24f3adb204a62b4c94d",
    "test/simple-home-progressive-disclosure.test.mjs": "31e2673ac9e130df6829f13dd1474d14795802ec",
    "test/together-page.test.mjs": "b2d64ebdbfe1b452ae92d0af778072a9276d5346"
  }
};

const HEX40=/^[a-f0-9]{40}$/;
const stop=msg=>{throw new Error('Church stacked source: '+msg)};
const matching=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>[...a].sort();
const uniq=a=>new Set(a).size===a.length;
const blobHash=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','sites','ekodi-church');

export function verifyReviewedChurchStackedSource(m){
  const historicalBytes=readFileSync(resolve(root,'source-import-baseline-v1.json'));
  if(blobHash(historicalBytes)!==HISTORICAL_SOURCE_BLOB)stop('independent 212-file baseline Git blob SHA changed');
  const baseline=JSON.parse(historicalBytes.toString('utf8'));
  if(baseline.contract!=='ekodi.church-reviewed-integration.v1'||
     baseline.mode!=='candidate-with-reviewed-unmerged-upstream-prs'||
     baseline.importedTrackedFileCount!==212||
     baseline.trackedFiles?.length!==212||
     baseline.reviewedOverlays?.changedFiles?.length!==20||
     !matching(baseline.reviewedOverlays.integrationOrder,[143,144,142]))
    stop('pre-existing historical source review invalid');
  if(m?.contract!=='ekodi.church-reviewed-integration.v2' ||
     m.mode!=='candidate-with-reviewed-stacked-upstream-prs' ||
     m.sourceRepository!==baseline.sourceRepository ||
     m.sourceCommit!==baseline.sourceCommit ||
     m.sourceTree!==baseline.sourceTree ||
     m.originalImportedTrackedFileCount!==208 ||
     m.importedTrackedFileCount!==223 ||
     m.excludedWorkflows?.length!==8 ||
     m.sourceOwnershipTransferred!==false ||
     m.productionReleaseSwitched!==false ||
     m.legacyRepositoryDeletionAuthorized!==false ||
     m.nestedWorkflowFilesInert!==false)
    stop('source contract or independent production safety changed');
  if(!matching(m.reviewedOverlays,baseline.reviewedOverlays))
    stop('earlier 3-PR historical source ledger was replaced');
  const staged=m.stackedReviewedOverlays;
  if(staged?.contract!=='ekodi.church-stacked-upstream-pr-audit.v1'||
     staged.originalSnapshotSha!==baseline.sourceCommit||
     staged.preservedPreviousReviewContract!==baseline.reviewedOverlays.contract||
     staged.previouslyTrackedFileCount!==212||
     staged.sourceStatus!=='upstream-stacked-prs-unmerged'||
     !matching(staged.integrationOrder,[146,149])||
     staged.sourceOwnershipTransferred!==false||
     staged.productionReleaseSwitched!==false||
     staged.legacyRepositoryDeletionAuthorized!==false||
     staged.importedOldDeploymentWorkflows!==false)
    stop('stacked PR authority or integration order altered');
  if(!Array.isArray(staged.pullRequests)||staged.pullRequests.length!==2)
    stop('two SHA-pinned source pull requests required');
  for(const pr of [146,149]){
    const item=staged.pullRequests.find(p=>p.number===pr);
    const expectedPaths=sorted(Object.keys(SOURCE_BLOBS[pr]));
    const base=pr===146?'9e8fc072d1d6d66286d9a275fe3960e50e5c5e72':PR_HEADS[146];
    if(!item||item.headSha!==PR_HEADS[pr]||
       item.baseHeadSha!==base||
       item.sourceRepository!=='topmaster-joseph/ekodi-church'||
       item.sourceStatusAtIntegration!=='open'||
       !matching(item.changedSourcePaths,expectedPaths))
      stop('upstream PR head, parent or changed path drift: #'+pr);
  }
  const expectedPaths=sorted(new Set([...Object.keys(SOURCE_BLOBS[146]),...Object.keys(SOURCE_BLOBS[149])]));
  const prev=new Map(baseline.trackedFiles.map(f=>[f.path,f]));
  if(!Array.isArray(m.trackedFiles)||m.trackedFiles.length!==223||!uniq(m.trackedFiles.map(f=>f.path)))
    stop('223 canonical Git asset inventory invalid');
  const present=new Map(m.trackedFiles.map(f=>[f.path,f]));
  const fixed=staged.localReconciliations;
  const reconciledPath='test/church-compact-tabs.test.mjs';
  const reconciledSha='be1a66be3fe7d37a9171930fe00585593d541724';
  const historical=prev.get(reconciledPath);
  const currentTest=present.get(reconciledPath);
  if(!Array.isArray(fixed)||fixed.length!==1||
     fixed[0].path!==reconciledPath||
     fixed[0].previousCanonicalBlobSha!==(historical?.normalizedBlobSha||historical?.blobSha)||
     fixed[0].finalCanonicalBlobSha!==reconciledSha||
     fixed[0].taskId!=='church-canonical-146-149-stage-20261106'||
     !String(fixed[0].reason||'').includes('six primary menu')||
     (currentTest?.normalizedBlobSha||currentTest?.blobSha)!==reconciledSha)
    stop('reviewed six-menu test reconciliation SHA or scope drifted');
  const added=expectedPaths.filter(p=>!prev.has(p));
  if(!matching(sorted(staged.addedFiles||[]),added)||added.length!==11)
    stop('eleven reviewed added files not enumerated');
  if(!Array.isArray(staged.changedFiles)||staged.changedFiles.length!==expectedPaths.length||
     !matching(sorted(staged.changedFiles.map(x=>x.path)),expectedPaths))
    stop('stacked changes incomplete or extra unreviewed paths');
  for(const [path,original] of prev){
    const current=present.get(path);
    if(!current||current.blobSha!==original.blobSha||current.mode!==original.mode)
      stop('original Git blob or file mode replaced: '+path);
    if(!expectedPaths.includes(path)&&path!==reconciledPath&&!matching(current,original))
      stop('unreviewed original file normalized hash drift: '+path);
  }
  for(const [path,current] of present){
    if(!HEX40.test(current.blobSha||'')||
       (current.normalizedBlobSha&&!HEX40.test(current.normalizedBlobSha)))
      stop('untrusted source blob: '+path);
    if(!prev.has(path)&&!added.includes(path))stop('extra unreviewed new source asset: '+path);
  }
  for(const path of expectedPaths){
    const item=present.get(path),original=prev.get(path);
    const r=staged.changedFiles.find(x=>x.path===path);
    const expectedChain=[146,149].filter(pr=>SOURCE_BLOBS[pr][path]);
    if(!item||!r||r.finalCanonicalBlobSha!==(item.normalizedBlobSha||item.blobSha)||
       r.previousCanonicalBlobSha!==(original?(original.normalizedBlobSha||original.blobSha):null)||
       r.originalBaseBlobSha!==(original?original.blobSha:null)||
       !Array.isArray(r.sourceChain) ||
       !matching(r.sourceChain.map(x=>x.prNumber),expectedChain))
      stop('tracked source historical/committed hash mismatch: '+path);
    for(const link of r.sourceChain){
      if(link.headSha!==PR_HEADS[link.prNumber] ||
         link.upstreamBlobSha!==SOURCE_BLOBS[link.prNumber]?.[path])
        stop('upstream SHA-pinned Git blob mismatch: '+path);
    }
    if(!original&&item.blobSha!==r.sourceChain[0].upstreamBlobSha)
      stop('new file not imported from exact source PR Git blob: '+path);
  }
  const normalized=sorted(m.trackedFiles.filter(x=>x.normalizedBlobSha&&x.normalizedBlobSha!==x.blobSha).map(x=>x.path));
  if(!Array.isArray(m.canonicalizedPaths)||!matching(sorted(m.canonicalizedPaths),normalized)||
     !uniq(m.canonicalizedPaths)||normalized.length!==34)
    stop('canonicalized Git blob inventory drifted');
  const previous=baseline.reviewedOverlays.pullRequests.map(x=>({number:x.number,headSha:x.headSha}));
  return Object.freeze({
    originalSourceSha:baseline.sourceCommit,
    integrationOrder:Object.freeze([143,144,142,146,149]),
    pullRequests:Object.freeze([...previous,...[146,149].map(number=>({number,headSha:PR_HEADS[number]}))])
  });
}
