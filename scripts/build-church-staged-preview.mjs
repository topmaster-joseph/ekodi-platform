import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildChurchPagesCandidate } from './build-church-pages-candidate.mjs';
import { verifyChurchStagedOverlay } from './verify-church-staged-overlay.mjs';

// Safe, local, reproducible preview only. The official release refuses this marker.
const PREVIEW='ekodi.church-review-preview.v1';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const isAsset=path=>!path.startsWith('test/')&&/\.(html|css|js|mjs)$/.test(path);
async function walk(folder,base=folder){
  const entries=await readdir(folder,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const path=join(folder,entry.name);
    if(entry.isDirectory())files.push(...await walk(path,base));
    else if(entry.isFile())files.push(relative(base,path).split(sep).join('/'));
    else throw new Error('Church preview refuses symlink/other file');
  }
  return files;
}
export async function buildChurchStagedPreview({
  platformRoot=resolve('.'),
  overlayDir=resolve('staging/church-pr149-review'),
  outputDir,
  platformSha,
}={}){
  if(!outputDir||!/^[0-9a-f]{40}$/.test(platformSha||''))throw new Error('Exact source SHA and output directory required');
  const root=resolve(platformRoot),overlay=resolve(overlayDir),output=resolve(outputDir);
  const sourceDir=resolve(root,'sites/ekodi-church');
  if(output===root||output===overlay||output===sourceDir ||
     !relative(root,output).startsWith('..') || !relative(overlay,output).startsWith('..'))
    throw new Error('Preview output must be outside the source checkout and overlay');
  const audited=await verifyChurchStagedOverlay({repoRoot:root,overlayDir:overlay});
  // Never change the reviewed canonical source or the original provenance.
  let staged=false;
  try{
    const base=await buildChurchPagesCandidate({sourceDir,outputDir:output,platformSha});
    staged=true;
    const baseMarker=JSON.parse((await readFile(join(output,'church-release.json'))).toString('utf8'));
    if(baseMarker.contract!=='ekodi.church-release.v2'||baseMarker.sourceSha!==platformSha)
      throw new Error('Original source candidate marker not verified');
    let added=0,overwritten=0;
    for(const file of audited.auditedFiles){
      if(!isAsset(file.path))continue;
      const dest=resolve(output,file.path);
      if(!dest.startsWith(output+sep))throw new Error('Path escapes staging output');
      await mkdir(dirname(dest),{recursive:true});
      let previous=null;
      try{previous=await readFile(dest)}catch(e){if(e.code!=='ENOENT')throw e;}
      if(previous)overwritten++;else added++;
      await writeFile(dest,file.bytes,{flag:'w'});
    }
    // Recompute the *preview* digest after all overwrites, never retaining the
    // original base v2 marker as if it described these changed bytes.
    const paths=(await walk(output)).filter(x=>x!=='church-release.json').sort();
    const digest=sha256(Buffer.from((await Promise.all(paths.map(async path=>
      path+'\t'+sha256(await readFile(join(output,path)))
    ))).join('\n')));
    const marker={
      contract:PREVIEW,mode:'offline-nonproduction-review',
      sourceRepository:'topmaster-joseph/ekodi-platform',
      sourceModule:'sites/ekodi-church+staging/church-pr149-review',
      platformSourceSha:platformSha,originalChurchSourceSha:audited.originalSourceSha,
      reviewedSourceHeadSha:audited.sourceHeadSha,
      originalPayloadSha256:baseMarker.payloadSha256,
      previewPayloadSha256:digest,
      stagedAssetCount:paths.length,overwrittenAssets:overwritten,addedAssets:added,
      auditedUpstreamFiles:audited.expectedEntries,
      releaseEligible:false,productionChanged:false,sourceOwnershipTransferred:false,
      legacyRepositoryDeletionAuthorized:false,
      outstanding:['official upstream PR149 merge','PR150 worship delta reconciliation','source ownership C3 approval and receipt','independent release canary']
    };
    await writeFile(join(output,'church-release.json'),JSON.stringify(marker,null,2)+'\n',{flag:'w'});
    return Object.freeze({contract:PREVIEW,outputPath:output,marker,previewOnly:true,deployed:false});
  }catch(error){
    if(staged)await rm(output,{recursive:true,force:true});
    throw error;
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const opts=process.argv.slice(2);
    if(opts.length!==4||opts[0]!=='--output'||opts[2]!=='--sha')
      throw new Error('Usage: --output NEW_DIRECTORY --sha EXACT_PLATFORM_COMMIT');
    const result=await buildChurchStagedPreview({outputDir:opts[1],platformSha:opts[3]});
    console.log(JSON.stringify({contract:result.contract,payloadSha256:result.marker.previewPayloadSha256,files:result.marker.stagedAssetCount,releaseEligible:false,deployed:false}));
  }catch(e){console.error(e.message);process.exitCode=1}
}
