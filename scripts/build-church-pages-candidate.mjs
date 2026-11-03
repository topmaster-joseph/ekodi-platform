import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, join, sep, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyReviewedChurchSource } from './verify-reviewed-church-source.mjs';

const HEX40=/^[0-9a-f]{40}$/;
const DEPLOYABLE_EXTENSIONS=new Set(['.html','.js','.mjs','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.txt','.xml','.webmanifest','.woff','.woff2']);
const IGNORED_TOP=new Set(['.github','test','node_modules','.wrangler']);
const IGNORED_FILES=new Set(['.dockerignore','.gitignore','.gitattributes','Dockerfile','README.md','MIGRATION_README.md','nginx.conf','package.json','package-lock.json','wrangler.jsonc','source-import-manifest.json','WEEKLY_RULES.md']);

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobSha=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const allowedAssetPath=(path)=>{
  if(typeof path!=='string'||!path||path.includes('\\')||isAbsolute(path)) return false;
  const segments=path.split('/');
  if(segments.some(x=>!x||x==='.'||x==='..'))return false;
  if(IGNORED_TOP.has(segments[0])||segments.some(x=>x.startsWith('.')))return false;
  if(IGNORED_FILES.has(segments.at(-1)))return false;
  if(path==='_headers'||path==='_redirects')return true;
  const dot=segments.at(-1).lastIndexOf('.');
  return dot>=0 && DEPLOYABLE_EXTENSIONS.has(segments.at(-1).slice(dot).toLowerCase());
};

export function planChurchPagesCandidate(manifest,platformSha) {
  if(!HEX40.test(platformSha||''))throw new Error('Exact 40-hex platform source SHA required');
  const reviewedSource=verifyReviewedChurchSource(manifest);
  if(manifest?.sourceRepository!=='topmaster-joseph/ekodi-church'||!HEX40.test(manifest.sourceCommit||''))
    throw new Error('Upstream provenance invalid');
  if(!Array.isArray(manifest.trackedFiles)||manifest.importedTrackedFileCount!==manifest.trackedFiles.length)
    throw new Error('Imported file inventory mismatch');
  if(manifest.productionReleaseSwitched!==false||manifest.legacyRepositoryDeletionAuthorized!==false)
    throw new Error('Release switch/deletion authority must remain external');
  const seen=new Set();
  const assets=[];
  for(const item of manifest.trackedFiles){
    if(typeof item.path!=='string'||seen.has(item.path))throw new Error('Duplicated/invalid source path');
    seen.add(item.path);
    if(!/^[0-9a-f]{40}$/.test(item.blobSha||'') || (item.normalizedBlobSha&&!HEX40.test(item.normalizedBlobSha)))
      throw new Error('Invalid Git blob provenance: '+item.path);
    if(!allowedAssetPath(item.path))continue;
    assets.push({path:item.path,expectedBlobSha:item.normalizedBlobSha||item.blobSha});
  }
  if(!assets.some(x=>x.path==='index.html')||!manifest.trackedFiles.some(x=>x.path==='_headers')){
    // _headers is handled as a root-only special Cloudflare Pages configuration.
    throw new Error('Church payload must include homepage and headers');
  }
  return {
    contract:'ekodi.church-pages-candidate.v1',
    mode:'offline-candidate-only',
    sourceRepository:'topmaster-joseph/ekodi-platform',
    sourceModule:'sites/ekodi-church',
    sourceSha:platformSha,
    upstreamRepository:manifest.sourceRepository,
    upstreamSourceSha:manifest.sourceCommit,
    reviewedUpstreamPullRequests:reviewedSource?.pullRequests||null,
    assets:assets.sort((a,b)=>a.path.localeCompare(b.path))
  };
}

export async function buildChurchPagesCandidate({sourceDir,outputDir,platformSha}) {
  if(!sourceDir||!outputDir)throw new Error('Source and output directories are required');
  const source=resolve(sourceDir);
  const output=resolve(outputDir);
  if(source===output||relative(source,output).split(sep)[0]!=='..'||
     relative(output,source).split(sep)[0]!=='..')throw new Error('Payload must remain separate from source tree');
  const manifest=JSON.parse(await readFile(join(source,'source-import-manifest.json'),'utf8'));
  const plan=planChurchPagesCandidate(manifest,platformSha);
  try{await stat(output);throw new Error('Refuse to overwrite existing candidate output directory');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const sourceReal=await realpath(source);
  const inMemory=[];
  for(const asset of plan.assets){
    const full=resolve(source,asset.path);
    const real=await realpath(full);
    if(real!==sourceReal && !real.startsWith(sourceReal+sep))throw new Error('Asset escapes Church source directory');
    const info=await stat(full);
    if(!info.isFile())throw new Error('Not a regular source file');
    const worktreeBytes=await readFile(full);
    // Windows core.autocrlf may expand Git LF blobs to CRLF on checkout.
    // Accept only a reversible line-ending normalization whose bytes match
    // the independently recorded *exact* Git blob; emit those Git bytes.
    let bytes=worktreeBytes;
    if(blobSha(bytes)!==asset.expectedBlobSha && worktreeBytes.includes(13)){
      const restored=Buffer.from(worktreeBytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
      if(blobSha(restored)===asset.expectedBlobSha)bytes=restored;
    }
    if(blobSha(bytes)!==asset.expectedBlobSha)throw new Error('Git blob SHA mismatch: '+asset.path);
    inMemory.push({path:asset.path,bytes,sha256:sha256(bytes)});
  }
  const payloadHash=sha256(Buffer.from(inMemory.map(a=>a.path+'\t'+a.sha256).join('\n')));
  const marker={
    contract:'ekodi.church-release.v2',
    sourceRepository:plan.sourceRepository,
    sourceModule:plan.sourceModule,
    sourceSha:plan.sourceSha,
    upstreamSourceRepository:plan.upstreamRepository,
    upstreamSourceSha:plan.upstreamSourceSha,
    ...(plan.reviewedUpstreamPullRequests?{reviewedUpstreamPullRequests:plan.reviewedUpstreamPullRequests}:{}),
    payloadSha256:payloadHash
  };
  // This is an offline-only candidate builder. The release workflow is deliberately untouched.
  await mkdir(output,{recursive:false});
  for(const asset of inMemory){
    const path=join(output,asset.path);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,asset.bytes,{flag:'wx'});
  }
  await writeFile(join(output,'church-release.json'),JSON.stringify(marker,null,2)+'\n',{flag:'wx'});
  return Object.freeze({
    contract:'ekodi.church-pages-candidate-build.v1',
    mode:'offline-only-not-deployed',
    sourceSha:platformSha,
    fileCount:inMemory.length,
    payloadSha256:payloadHash,
    releaseMarker:marker,
    deployed:false,
    modifiedProduction:false
  });
}

function args(argv) {
  const opts={};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!['--source','--output','--sha'].includes(key)||!argv[i+1])throw new Error('Usage: --source DIR --output NEW_DIR --sha PLATFORM_COMMIT_SHA');
    opts[key]=argv[++i];
  }
  if(!opts['--source']||!opts['--output']||!opts['--sha'])throw new Error('Missing required candidate argument');
  return {sourceDir:opts['--source'],outputDir:opts['--output'],platformSha:opts['--sha']};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  buildChurchPagesCandidate(args(process.argv.slice(2))).then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
