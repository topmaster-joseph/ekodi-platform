import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson=async path=>JSON.parse((await readFile(new URL('../'+path,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const REGEXP_META=/[.+?^$()|{}[\]\\]/g;

export function validReleaseSourcePattern(value) {
  if(typeof value!=='string')return false;
  const pattern=value.replaceAll('\\','/').trim();
  return Boolean(pattern) && !pattern.startsWith('/') && !pattern.startsWith('./')
    && !pattern.includes('//') && !pattern.split('/').includes('..')
    && !/[\r\n\0]/.test(pattern) && !pattern.includes('?') && !pattern.includes('[')
    && !pattern.includes(']');
}

function compileSourceGlob(glob) {
  if(!validReleaseSourcePattern(glob)) throw new Error('Unsafe or unsupported release source pattern: '+glob);
  let regex='^';
  for(let i=0;i<glob.length;i++) {
    const char=glob[i];
    if(char==='*' && glob[i+1]==='*') { regex+='.*'; i++; }
    else if(char==='*')regex+='[^/]*';
    else regex+=char.replace(REGEXP_META,'\\$&');
  }
  return new RegExp(regex+'$');
}

function cleanChangedPath(path) {
  if(typeof path!=='string')return null;
  const text=path.trim().replaceAll('\\','/');
  if(!text || text.startsWith('/') || text.startsWith('./') ||
     text.split('/').includes('..') || text.includes('//') || /[\r\n\0]/.test(text))return null;
  return text;
}

export function planFleetReleaseImpact(boundaries,changedPaths) {
  const errors=[];
  if(!boundaries || boundaries.version!==1 || !boundaries.platforms ||
     typeof boundaries.platforms!=='object'||Array.isArray(boundaries.platforms))errors.push('invalid platform boundary registry');
  if(!Array.isArray(changedPaths)) errors.push('changed file paths must be an array');
  const units=boundaries?.platforms||{};
  const mapped=new Map();
  for(const [id,unit] of Object.entries(units)) {
    if(!Array.isArray(unit?.source)||!unit.source.length) {
      errors.push(id+': source patterns missing');
      continue;
    }
    const expressions=[];
    for(const p of unit.source) {
      try{expressions.push(compileSourceGlob(p));}
      catch(e){errors.push(id+': '+e.message);}
    }
    if(typeof unit.deployWorkflow!=='string'||!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(unit.deployWorkflow)){
      errors.push(id+': invalid declared deploy workflow');
    }
    mapped.set(id,{unit,expressions});
  }
  const inputs=Array.isArray(changedPaths)?changedPaths:[];
  const paths=[...new Set(inputs.map(x=>cleanChangedPath(x)).filter(Boolean))].sort();
  if(inputs.some(x=>!cleanChangedPath(x)))errors.push('unsafe path input');
  const directIds=new Set();
  const pathOwnership=paths.map(path=>{
    const owners=[];
    for(const [id,{expressions}] of mapped) if(expressions.some(regex=>regex.test(path))){owners.push(id);directIds.add(id);}
    return {path,directReleaseUnitIds:owners.sort()};
  });
  const downstreamIds=new Set();
  // Only a dependency matching an exact registered boundary ID has meaning.
  let changed=true;
  while(changed){
    changed=false;
    for(const [id,unit] of Object.entries(units)){
      if(directIds.has(id)||downstreamIds.has(id))continue;
      if((Array.isArray(unit.sharedDependencies)?unit.sharedDependencies:[]).some(dep=>
        typeof dep==='string' && (directIds.has(dep)||downstreamIds.has(dep)))){
        downstreamIds.add(id);
        changed=true;
      }
    }
  }
  const directReleaseUnits=[...directIds].sort().map(id=>({
    id,
    workflow:units[id].deployWorkflow,
    action:'guarded-release-candidate-not-authorized'
  }));
  const downstreamRegressionUnits=[...downstreamIds].sort().map(id=>({
    id,
    workflow:units[id].deployWorkflow,
    action:'cross-service-regression-only-no-automatic-deploy'
  }));
  const unmatchedChangedPaths=pathOwnership.filter(item=>item.directReleaseUnitIds.length===0).map(item=>item.path);
  const highImpactIds=new Set(['site-core','control-api','service-proxy','ekodi-shell','admin-auth']);
  return {
    contract:'ekodi.fleet-release-impact.v1',
    mode:'read-only-release-decision-support',
    registeredReleaseUnits:Object.keys(units).length,
    changedPaths:paths,
    pathOwnership,
    directReleaseUnits,
    downstreamRegressionUnits,
    unmatchedChangedPaths,
    criticalSharedChange:directReleaseUnits.some(item=>highImpactIds.has(item.id)),
    sourceOwnershipReviewRequired:errors.length>0||unmatchedChangedPaths.length>0,
    deployApproved:false,
    productionMutationPerformed:false,
    errors
  };
}

export async function planCurrentFleetReleaseImpact(paths) {
  return planFleetReleaseImpact(await readJson('platform-boundaries.json'),paths);
}

function parseArgs(argv) {
  const files=[];
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--file' && i+1<argv.length)files.push(argv[++i]);
    else if(arg.startsWith('--file='))files.push(arg.slice('--file='.length));
    else throw new Error('Usage: node scripts/plan-fleet-release-impact.mjs --file <path> [--file <path> ...]');
  }
  if(!files.length)throw new Error('At least one --file argument is required.');
  return files;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  (async()=> {
    const result=await planCurrentFleetReleaseImpact(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result,null,2));
    if(result.errors.length)process.exitCode=1;
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
