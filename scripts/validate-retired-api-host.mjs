import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const retiredHost=['api','ekodi','kr'].join('.');
const exactHost=new RegExp('(^|[^A-Za-z0-9-])'+retiredHost.replaceAll('.', '\\.')+'(?=$|[^A-Za-z0-9.-])');
const allowedHistorical=new Set([
  'supabase/migrations/20260906008000_ekodi_mcp_oauth_audience.sql',
  'supabase/migrations/20260906009000_ekodi_mcp_resource_bound_audience.sql',
  'supabase/migrations/20260906010000_ekodi_mcp_active_consent_audience.sql',
  'supabase/migrations/20260906011000_ekodi_oauth_least_privilege.sql',
  'supabase/migrations/20260908193000_ekodi_mcp_canonical_resource.sql',
  'supabase/migrations/20260920154500_retire_api_subdomain_mcp_resource.sql',
  'governance/amendments/2026-09-06-affiliate-marketplace-control-boundary-v1.8.2.json',
]);
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const violations=[];
for(const file of files){
  if(allowedHistorical.has(file)) continue;
  let text='';
  try{text=readFileSync(file,'utf8')}catch{continue}
  if(text.includes('\0')) continue;
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    if(exactHost.test(lines[i])) violations.push(`${file}:${i+1}`);
  }
}
if(violations.length){
  console.error('Retired EKODI API hostname is forbidden outside immutable history:');
  for(const v of violations) console.error('- '+v);
  process.exit(1);
}
console.log('Retired API hostname guard OK: canonical public base is https://ekodi.kr/api.');
