import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {contractQuery,preflight} from '../scripts/singles-api-db-preflight.mjs';
const wf=await readFile(new URL('../.github/workflows/deploy-singles-api.yml',import.meta.url),'utf8');
const contract=JSON.parse(await readFile(new URL('../config/singles-api-db-contract.json',import.meta.url),'utf8'));

test('every RPC singles-api calls is listed in the DB contract',async()=>{
  const dir=new URL('../supabase/functions/singles-api/',import.meta.url);
  let src='';for(const f of await readdir(dir))if(f.endsWith('.ts'))src+=await readFile(new URL(f,dir),'utf8');
  const used=[...new Set([...src.matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g)].map(m=>m[1]))].sort();
  const listed=contract.required_functions.map(s=>s.match(/^public\.([a-z_]+)\(/)[1]).sort();
  assert.deepEqual(listed,used,'update config/singles-api-db-contract.json when adding or removing an RPC');
});
test('preflight passes only when every contract function exists',async()=>{
  const mk=(present)=>async(url,opts)=>{
    assert.match(url,/\/v1\/projects\/ref123\/database\/query\/read-only$/);
    assert.equal(opts.headers.authorization,'Bearer tok');
    return new Response(JSON.stringify(contract.required_functions.map((sig,i)=>({sig,present:present(i)}))),{status:201});
  };
  assert.deepEqual(await preflight({ref:'ref123',token:'tok',fetchImpl:mk(()=>true)}),{ok:true,missing:[]});
  const r=await preflight({ref:'ref123',token:'tok',fetchImpl:mk(i=>i!==2)});
  assert.equal(r.ok,false);assert.deepEqual(r.missing,[contract.required_functions[2]]);
  await assert.rejects(preflight({ref:'ref123',token:'tok',fetchImpl:async()=>new Response('no',{status:403})}),/preflight_query_failed:403/);
});
test('contract query refuses anything but plain function signatures',()=>{
  assert.match(contractQuery(['public.a_b(uuid,text)']),/to_regprocedure\(sig\)/);
  assert.throws(()=>contractQuery(["public.x(uuid);drop table y--()"]),/invalid_signature/);
});
test('deploy lane keeps JWT verification, provenance, preflight order and rollback',()=>{
  assert.doesNotMatch(wf,/--no-verify-jwt/);
  assert.match(wf,/test "\$jwt" = 'true'/);
  assert.match(wf,/if: github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
  assert.match(wf,/push:\n    branches: \[main\]\n    paths:\n      - "supabase\/functions\/singles-api\/\*\*"/);
  assert.match(wf,/commits\/\$GITHUB_SHA\/pulls/,'push deploys recover the merged orchestrator branch');
  const order=['validate-ekodi-ai-change-orchestration.mjs --release','validate-deployment-guardrails.mjs','singles-api-db-preflight.mjs','functions deploy singles-api','id: verify','git checkout HEAD^ -- supabase/functions/singles-api'];
  const prod=wf.slice(wf.indexOf('  production:'));
  let last=-1;for(const step of order){const i=prod.indexOf(step);assert.ok(i>last,step+' out of order');last=i;}
  assert.match(wf,/if: failure\(\) && steps\.verify\.conclusion == 'failure'/);
});
