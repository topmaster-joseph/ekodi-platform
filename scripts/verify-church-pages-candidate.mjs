import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planChurchPagesCandidate } from './build-church-pages-candidate.mjs';

const HEX40=/^[a-f0-9]{40}$/;
const SHA256=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const fail=message=>{throw new Error('CHURCH_CANDIDATE_VERIFY: '+message);};

async function collectFiles(folder,prefix='') {
  const found=[];
  for(const e of await readdir(folder,{withFileTypes:true})) {
    if(!e.name||e.name==='.'||e.name==='..')fail('unexpected entry name');
    const rel=prefix?prefix+'/'+e.name:e.name;
    if(e.isDirectory()) found.push(...await collectFiles(join(folder,e.name),rel));
    else if(e.isFile()) found.push(rel);
    else fail('symlink or non-file in candidate: '+rel);
  }
  return found;
}

export async function verifyChurchPagesCandidate({sourceDir,artifactDir,expectedSourceSha}) {
  if(!HEX40.test(expectedSourceSha||''))fail('exact protected source SHA required');
  if(!sourceDir||!artifactDir)fail('source and candidate directories required');
  const source=await realpath(resolve(sourceDir));
  const artifact=await realpath(resolve(artifactDir));
  if(source===artifact||relative(source,artifact).split(sep)[0]!=='..'||
     relative(artifact,source).split(sep)[0]!=='..')fail('candidate must be outside source tree');
  const manifest=JSON.parse(await readFile(join(source,'source-import-manifest.json'),'utf8'));
  const plan=planChurchPagesCandidate(manifest,expectedSourceSha);
  const files=await collectFiles(artifact);
  const expected=new Set([...plan.assets.map(a=>a.path),'church-release.json']);
  if(files.length!==expected.size || files.some(f=>!expected.has(f)))fail('candidate source file inventory drift');
  const digests=[];
  for(const asset of plan.assets) {
    const full=join(artifact,asset.path);
    const stat=await lstat(full);
    if(!stat.isFile())fail('non-regular artifact: '+asset.path);
    const bytes=await readFile(full);
    if(gitBlob(bytes)!==asset.expectedBlobSha)fail('candidate blob differs from signed source: '+asset.path);
    digests.push(asset.path+'\t'+SHA256(bytes));
  }
  const computedPayload=SHA256(Buffer.from(digests.join('\n')));
  const marker=JSON.parse(await readFile(join(artifact,'church-release.json'),'utf8'));
  if(marker.contract!=='ekodi.church-release.v2'||
     marker.sourceRepository!=='topmaster-joseph/ekodi-platform'||
     marker.sourceModule!=='sites/ekodi-church'||
     marker.sourceSha!==expectedSourceSha||
     marker.upstreamSourceRepository!==plan.upstreamRepository||
     marker.upstreamSourceSha!==plan.upstreamSourceSha||
     marker.payloadSha256!==computedPayload)
    fail('v2 release source, upstream or payload digest mismatch');
  const actualPRs=marker.reviewedUpstreamPullRequests||null;
  if(JSON.stringify(actualPRs)!==JSON.stringify(plan.reviewedUpstreamPullRequests))
    fail('audited upstream Church PR provenance mismatch');
  if(JSON.stringify(marker.preservedPublicWorship||null)!==JSON.stringify(plan.preservedPublicWorship))
    fail('preserved PR150 worship SHA lineage missing or altered');
  return Object.freeze({contract:'ekodi.church-offline-verified.v1',
    sourceSha:expectedSourceSha,artifactFileCount:plan.assets.length,
    payloadSha256:computedPayload,sourceProvenance:'exact-git-blob',
    productionDeployed:false,providerSecretsUsed:false});
}

function parse(argv){
  const o={};
  for(let i=0;i<argv.length;i+=2) {
    if(!['--source','--artifact','--sha'].includes(argv[i])||!argv[i+1])fail('usage: --source PATH --artifact PATH --sha SHA');
    o[argv[i]]=argv[i+1];
  }
  return {sourceDir:o['--source'],artifactDir:o['--artifact'],expectedSourceSha:o['--sha']};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  verifyChurchPagesCandidate(parse(process.argv.slice(2)))
    .then(r=>console.log(JSON.stringify(r)))
    .catch(e=>{console.error(e.message);process.exitCode=1});
}
