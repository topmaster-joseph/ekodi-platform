import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT_PROJECT_ENDPOINT=/https:\/\/api\.supabase\.com\/v1\/projects(?=$|[\s"'\x60?#])/i;
const CLI_CREATE=/\bsupabase\s+projects?\s+create\b/i;
const SDK_CREATE=/\bcreateSupabaseProject\s*\(|\bsupabaseManagement\s*\.\s*createProject\s*\(/i;

export function findSupabaseProjectCreationAttempts(text=''){
  const source=String(text);
  const hits=[];
  if(ROOT_PROJECT_ENDPOINT.test(source)&&/\b(?:POST|method\s*:\s*['"]POST['"]|-X\s+POST)\b/i.test(source)){
    hits.push('management-api-project-create');
  }
  if(CLI_CREATE.test(source))hits.push('supabase-cli-project-create');
  if(SDK_CREATE.test(source))hits.push('supabase-sdk-project-create');
  return hits;
}

function trackedFiles(){
  try{
    return execFileSync('git',['ls-files'],{encoding:'utf8'}).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }catch{
    return [];
  }
}

function shouldScan(file){
  if(file==='scripts/validate-supabase-free-project-capacity.mjs')return false;
  if(file==='test/supabase-free-project-capacity-guard.test.mjs')return false;
  if(file.startsWith('.git/'))return false;
  return /^(?:\.github\/workflows\/|scripts\/|supabase\/functions\/|[^/]+\.(?:js|mjs|cjs|ts|tsx))/.test(file);
}

export function scanRepository(files=trackedFiles()){
  const findings=[];
  for(const file of files){
    if(!shouldScan(file)||!fs.existsSync(file))continue;
    let content='';
    try{content=fs.readFileSync(file,'utf8')}catch{continue}
    const hits=findSupabaseProjectCreationAttempts(content);
    if(hits.length)findings.push({file,hits});
  }
  return findings;
}

export function validateSupabaseFreeProjectCapacity(policy){
  const rule=policy?.resourceGovernor?.capacityRules?.['supabase.active_projects'];
  const projectPolicy=policy?.resourceGovernor?.projectCreationPolicy||{};
  const errors=[];
  if(Number(rule?.fullAt)!==2)errors.push('Supabase Free project capacity must remain 2');
  if(rule?.action!=='block-new-project-only')errors.push('capacity action must remain block-new-project-only');
  if(rule?.existingProjectsRemainAvailable!==true)errors.push('existing projects must remain available');
  if(projectPolicy.supabase!=='reuse-existing-projects-before-new-project')errors.push('reuse-existing-projects-before-new-project policy missing');
  if(projectPolicy.automaticPaidProjectCreation!==false)errors.push('automatic paid project creation must stay disabled');
  return errors;
}

export function main(){
  const policy=JSON.parse(fs.readFileSync('config/free-tier-optimization-policy.json','utf8'));
  const errors=validateSupabaseFreeProjectCapacity(policy);
  const findings=scanRepository();
  if(findings.length){
    for(const finding of findings){
      errors.push(`${finding.file}: forbidden automated Supabase project creation (${finding.hits.join(',')})`);
    }
  }
  if(errors.length){
    for(const error of errors)console.error(`[EKODI-FREE-TIER-SUPABASE-CAPACITY] ${error}`);
    process.exitCode=1;
    return;
  }
  console.log('[EKODI-FREE-TIER-SUPABASE-CAPACITY] verified: automated project creation is blocked; existing Free projects remain available.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
