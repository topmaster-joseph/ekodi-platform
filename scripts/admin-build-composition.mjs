import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultManifestUrl = new URL('../config/admin-build-composition.json', import.meta.url);

export async function loadAdminBuildComposition(manifestUrl=defaultManifestUrl){
  const raw=await readFile(manifestUrl,'utf8');
  const manifest=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(manifest.schemaVersion!==1||manifest.status!=='enforced'||!Array.isArray(manifest.compositions)){
    throw new Error('Invalid enforced Admin build composition manifest');
  }
  return manifest;
}

export async function composeOutputAsset({root=repositoryRoot,output,target,sources,targetMarker=''}) {
  const targetPath=`${output}${target}`;
  const base=await readFile(targetPath,'utf8');
  if(targetMarker&&!base.includes(targetMarker))throw new Error(`${target} marker missing: ${targetMarker}`);
  const chunks=[];
  for(const source of sources||[]){
    const spec=typeof source==='string'?{path:source}:source;
    const text=await readFile(`${root}${spec.path}`,'utf8');
    if(spec.marker&&!text.includes(spec.marker))throw new Error(`${spec.path} marker missing: ${spec.marker}`);
    chunks.push(text);
  }
  await writeFile(targetPath,[base,...chunks].join('\n'));
  return chunks.length;
}

export async function applyAdminBuildComposition({root=repositoryRoot,output,manifestUrl=defaultManifestUrl}){
  if(!output)throw new Error('Admin build composition output path is required');
  const manifest=await loadAdminBuildComposition(manifestUrl);
  for(const composition of manifest.compositions){
    await composeOutputAsset({
      root,
      output,
      target:composition.target,
      sources:composition.sources,
      targetMarker:composition.targetMarker||'',
    });
  }
  return manifest.compositions.length;
}
