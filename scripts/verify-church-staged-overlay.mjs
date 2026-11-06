import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyReviewedChurchSource } from './verify-reviewed-church-source.mjs';

const HEX40=/^[a-f0-9]{40}$/;
const ROOT='staging/church-pr149-review';
const head='b89c32f9330afbd114dc632306a7b9348c869b7b';
const original='520d4f2daf7e5e4dc53bf928c9df626b5f896600';
const originalManifestBlob='09b01865a3f0ba99caf8b7b97fc787ee8ef83d51';
const EXPECTED=new Map(Object.entries({
  'church-homepage-layout.css':'380ec056ca472eaba538dc7840a45d916ed6ccd3',
  'church-i18n-extended.js':'d4f9ee7e51052c61e4baa7aaf1f87412ff69bcf5',
  'church-i18n.js':'c2123abf86c9db6bba98b90bcbc2540692fdb208',
  'church-public-updates.css':'9229ba7eb5eccfa0d3cba2196781a6a5a4ec5799',
  'church-public-updates.js':'446936ca40d893b0c1dc6e128a91e2907436a741',
  'church-shared-schedules.js':'314b39ef88fa88c0bd49e02d59a6849ab38acd5d',
  'devotion/index.html':'08ef8c744271ec70b366ae84572e37603c2604b3',
  'index.html':'2b4250abdf28cdaa896bed325262c013f5996cda',
  'notices/index.html':'1036fb223e87cd8781741e56b6ac2ce06b097bbc',
  'schedule/index.html':'95fc21ab7cf6f4bd66aad51a285afc07774a8f41',
  'script.js':'f7b3ea040b28d788eff8e621d1891ea8a622b80a',
  'test/church-approved-homepage-layout.test.mjs':'9f69a1b10fc58b757ab3f89d02e8a72c75c92f7a',
  'test/church-home-overview-navigation.test.mjs':'0ce6412dddfe38df931166bbe224fa228bb91bc6',
  'test/church-public-notices-schedule.test.mjs':'9d904189a7cd5a41cc82a49b98f993b024f285d4',
  'test/church-shared-schedule-147.test.mjs':'0745a47058a625c001c4d306f91c59e4d5102dbd',
  'test/simple-home-progressive-disclosure.test.mjs':'31e2673ac9e130df6829f13dd1474d14795802ec',
  'church-compact-navigation.css':'fcdb494c302d3692d5e82aca3aebd26014f51aa3',
  'church-section-nav.js':'9eb0de3e5332b324e8cd95872e57987a56b00f8b',
  'test/church-compact-selected-navigation.test.mjs':'a634326bc6d70f8f3093ece0dd53cda1995bfcce',
  'test/church-devotion.test.mjs':'3787c765e6162157fcb2d610224e45db795eda1a',
  'test/church-life-hub.test.mjs':'f150f78154a49316b27301e82b96d38930e8fe0c',
  'test/church-live-entry.test.mjs':'c11c75776afba13c74fe02c58048cbe7c1f4dce6',
  'test/church-selected-panel-runtime.test.mjs':'cdb5a6c62e25e87ac729d24f3adb204a62b4c94d',
  'test/together-page.test.mjs':'b2d64ebdbfe1b452ae92d0af778072a9276d5346'
}));
const fail=reason=>{throw new Error('Church review overlay: '+reason)};
const gitBlobSHA=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const allowedPath=path=>{
  if(typeof path!=='string'||!path||path.includes('\\')||path.startsWith('/')||path.startsWith('.')||path.endsWith('/'))return false;
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))return false;
  if(parts.includes('node_modules')||parts.includes('functions')||parts.includes('.github'))return false;
  return /^[\w./-]+$/.test(path)&&/\.(html|js|mjs|css)$/.test(path);
};
const readSafe=async(root,path)=>{
  const full=resolve(root,path),candidate=await realpath(full),base=await realpath(root);
  if(candidate!==base&&!candidate.startsWith(base+sep))fail('overlay path escapes review folder: '+path);
  if(!(await lstat(full)).isFile())fail('not a regular file: '+path);
  return readFile(full);
};

function validateNavigation(home,selected){
  const nav=home.match(/<nav\b[^>]*\bid="main-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  if(!nav)fail('six-item primary navigation is missing');
  const labels=[...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').trim());
  const expected=['매일묵상','예배·방송','공지사항','주요일정','함께하기','마이페이지'];
  if(JSON.stringify(labels)!==JSON.stringify(expected))fail('incorrect primary navigation');
  if(nav.includes('오늘의 삶')||nav.includes('>공동체<')||nav.includes('>협력소식<'))fail('legacy menu returned');
  for(const token of [
    "['예배안내','#worship']","['주보·PPT','#weekly-worship']",
    "['온라인 방송','#online']","['공동체','#community']",
    "['협력소식','#partner-news']","['참여·후원','/ekodichurch/together/']",
    "['큐티인 신청','/qtin/church']"
  ]) if(!selected.includes(token))fail('nested action missing: '+token);
  if(!home.includes('data-church-notices')||!home.includes('data-church-shared-schedules'))
    fail('public notice or shared schedule preview missing');
}

export async function verifyChurchStagedOverlay({repoRoot=resolve('.'),overlayDir=join(repoRoot,ROOT),manifestOverride=null}={}){
  const root=resolve(repoRoot),overlay=resolve(overlayDir);
  const originalManifestPath=join(root,'sites/ekodi-church/source-import-manifest.json');
  const originalBytes=await readFile(originalManifestPath);
  if(gitBlobSHA(originalBytes)!==originalManifestBlob)fail('original audited Church source manifest changed');
  const originalManifest=JSON.parse(originalBytes.toString('utf8'));
  const prior=verifyReviewedChurchSource(originalManifest);
  if(!prior||prior.originalSourceSha!==original)fail('existing original-source audit not valid');
  const manifest=manifestOverride??JSON.parse((await readFile(join(overlay,'overlay-manifest.json'))).toString('utf8'));
  if(manifest.contract!=='ekodi.church-reviewed-source-overlay.v1'||manifest.mode!=='offline-audit-candidate-only'||
     manifest.sourceRepository!=='topmaster-joseph/ekodi-church'||manifest.sourceHead!==head||
     manifest.sourceBranch!=='ai/chatgpt/church-compact-header-selected-content-20261106'||
     manifest.baseOriginalSourceSha!==original||manifest.baseManifestGitBlobSha!==originalManifestBlob)
    fail('untrusted source or original provenance');
  if(JSON.stringify(manifest.basePreviouslyReviewedPRs)!==JSON.stringify([143,144,142]))
    fail('original approved source integration order changed');
  const stack=manifest.stackedSourcePRs;
  if(JSON.stringify(stack?.map(v=>[v.number,v.head]))!==JSON.stringify([
    [143,'9e8fc072d1d6d66286d9a275fe3960e50e5c5e72'],
    [146,'b79dc3b19b562f9b654bffb55d797ea336c08d34'],
    [149,head]
  ]))fail('unexpected unreviewed stacked upstream SHA');
  const conditions=manifest.conditions;
  if(conditions?.productionReleaseSwitched!==false||conditions?.releaseCandidateApproved!==false||
     conditions?.sourceOwnershipTransferred!==false||conditions?.legacyRepositoryDeletionAuthorized!==false||
     conditions?.requiresIndependentPR150Reconciliation!==true)
    fail('release/ownership flags must remain fail-closed');
  if(manifest.plannedEntryCount!==EXPECTED.size||!Array.isArray(manifest.files)||manifest.files.length!==EXPECTED.size)
    fail('incomplete overlay inventory');
  const seen=new Set(),verified=[];
  for(const item of manifest.files){
    const path=item?.path;
    if(!allowedPath(path)||seen.has(path)||!EXPECTED.has(path))fail('unaudited or duplicated file: '+path);
    seen.add(path);
    const expectedSha=EXPECTED.get(path);
    if(!HEX40.test(item.blobSha||'')||item.blobSha!==expectedSha||
       item.provenance?.branch!=='ai/chatgpt/church-compact-header-selected-content-20261106'||
       item.provenance?.headSha!==head)
      fail('source git blob receipt mismatch: '+path);
    const bytes=await readSafe(join(overlay,'files'),path);
    if(gitBlobSHA(bytes)!==expectedSha)fail('staged source content differs from approved blob SHA: '+path);
    verified.push({path,blobSha:expectedSha,bytes});
  }
  if(seen.size!==EXPECTED.size)fail('incomplete audited source copy');
  const decode=path=>verified.find(v=>v.path===path)?.bytes.toString('utf8')||'';
  validateNavigation(decode('index.html'),decode('church-section-nav.js'));
  if(!decode('notices/index.html').includes('data-church-notices')||
     !decode('schedule/index.html').includes('data-church-schedule'))
    fail('public detail routes were not preserved');
  return Object.freeze({
    contract:manifest.contract,mode:'offline-reviewed-only',
    originalSourceSha:original,sourceHeadSha:head,
    auditedPaths:Object.freeze([...EXPECTED.keys()]),auditedFiles:verified,
    expectedEntries:EXPECTED.size,releaseEligible:false,productionChanged:false
  });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const result=await verifyChurchStagedOverlay();
    console.log(JSON.stringify({contract:result.contract,sourceHeadSha:result.sourceHeadSha,entries:result.expectedEntries,releaseEligible:false,productionChanged:false}));
  }catch(e){console.error(e.message);process.exitCode=1}
}
