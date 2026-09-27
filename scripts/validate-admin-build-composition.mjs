import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAdminBuildComposition } from './admin-build-composition.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=await loadAdminBuildComposition();
const failures=[];
const fail=message=>failures.push(message);
const targets=new Set();

for(const composition of manifest.compositions){
  const target=String(composition.target||'').trim();
  if(!target)fail('composition target is required');
  if(targets.has(target))fail(`duplicate composition target: ${target}`);
  targets.add(target);
  try{await access(`${root}${target}`)}catch{fail(`missing composition target source asset: ${target}`)}
  const sources=Array.isArray(composition.sources)?composition.sources:[];
  if(sources.length===0)fail(`${target}: at least one source is required`);
  const seen=new Set();
  for(const entry of sources){
    const spec=typeof entry==='string'?{path:entry}:entry;
    const path=String(spec?.path||'').trim();
    if(!path){fail(`${target}: source path is required`);continue}
    if(path===target)fail(`${target}: target cannot append itself`);
    if(seen.has(path))fail(`${target}: duplicate source ${path}`);
    seen.add(path);
    if(target.endsWith('.css')!==path.endsWith('.css'))fail(`${target}: source type mismatch ${path}`);
    if(target.endsWith('.js')!==path.endsWith('.js'))fail(`${target}: source type mismatch ${path}`);
    try{
      const text=await readFile(`${root}${path}`,'utf8');
      if(spec.marker&&!text.includes(spec.marker))fail(`${target}: source marker missing in ${path}`);
    }catch{fail(`${target}: missing source ${path}`)}
  }
  if(composition.targetMarker){
    try{
      const text=await readFile(`${root}${target}`,'utf8');
      if(!text.includes(composition.targetMarker))fail(`${target}: target marker missing`);
    }catch{}
  }
}

const build=await readFile(`${root}scripts/build.mjs`,'utf8');
if(!build.includes("applyAdminBuildComposition({ root, output })"))fail('build.mjs must apply the Admin build composition manifest');
if(build.includes("system-timeline-admin.css")||build.includes("system-timeline-admin.js"))fail('system timeline composition must not be hard-coded in build.mjs');
if(build.includes("appendOutputSources("))fail('legacy appendOutputSources helper must be removed from build.mjs');

if(failures.length){
  console.error(`Admin build composition validation failed (${failures.length})`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Admin build composition OK: ${manifest.compositions.length} declared compositions`);
