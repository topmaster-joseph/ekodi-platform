#!/usr/bin/env node
// Read-only production check before deploying singles-api: every DB function the
// code calls must already exist. Uses the Supabase Management API read-only query
// endpoint, so no service_role key is needed in CI.
import {readFile} from 'node:fs/promises';

export function contractQuery(signatures){
  for(const s of signatures)if(!/^public\.[a-z_][a-z0-9_]*\([a-z0-9_, ]*\)$/.test(s))throw new Error('invalid_signature:'+s);
  return 'select sig, to_regprocedure(sig) is not null as present from unnest(array['+
    signatures.map(s=>"'"+s+"'").join(',')+']::text[]) as sig';
}

export async function preflight({ref,token,fetchImpl=fetch,contractPath=new URL('../config/singles-api-db-contract.json',import.meta.url)}){
  const contract=JSON.parse(await readFile(contractPath,'utf8'));
  const res=await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`,{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({query:contractQuery(contract.required_functions)})});
  if(!res.ok)throw new Error('preflight_query_failed:'+res.status);
  const rows=await res.json();
  if(!Array.isArray(rows)||rows.length!==contract.required_functions.length)throw new Error('preflight_unexpected_response');
  const missing=rows.filter(r=>r.present!==true).map(r=>r.sig);
  return {ok:missing.length===0,missing};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const ref=process.env.PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;
  if(!ref||!token){console.error('PROJECT_REF and SUPABASE_ACCESS_TOKEN are required');process.exit(2)}
  const result=await preflight({ref,token}).catch(e=>({ok:false,error:String(e.message||e)}));
  if(!result.ok){console.error('singles-api DB contract not satisfied:',JSON.stringify(result));process.exit(1)}
  console.log('singles-api DB contract satisfied');
}
