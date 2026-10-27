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
    return new Response(JSON.stringify([...contract.required_functions,...(contract.required_columns||[])].map((sig,i)=>({sig,present:present(i)}))),{status:201});
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

test('orchestrator convergence dispatches the singles-api lane (token merges emit no push)',async()=>{
  const src=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.match(src,/const singlesApiTouched=changedFiles\.some\(file=>\n  file\.startsWith\('supabase\/functions\/singles-api\/'\)/);
  assert.match(src,/\[singlesApiTouched,'deploy-singles-api\.yml'\]/);
  assert.match(src,/if\(singlesApiTouched\)\{[\s\S]*?actions\/workflows\/deploy-singles-api\.yml\/dispatches[\s\S]*?inputs:\{release_branch_ref:branch,release_task_id:taskId\}/);
  assert.match(src,/workflow:'deploy-singles-api\.yml',pr:pr\.number,taskId,branch,authority:'ekodi-orchestrator'/);
});

test('preflight also requires the DB columns the code writes',async()=>{
  assert.ok(contract.required_columns.includes('public.singles_consent_receipts.religion_consent'));
  const q=contractQuery(['public.a(uuid)'],['public.t.c']);
  assert.match(q,/union all/);assert.match(q,/pg_catalog\.pg_attribute/);assert.match(q,/not a\.attisdropped/);
  assert.throws(()=>contractQuery([],["public.t.c';drop table x--"]),/invalid_column/);
  const api=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8')
    +await readFile(new URL('../supabase/functions/singles-api/social.ts',import.meta.url),'utf8');
  for(const col of contract.required_columns){
    const [, table, name]=col.split('.');
    assert.ok(api.includes(table)&&api.includes(name+':'),col+' is written by the API');
  }
});
test('enrollment receipt records the exact optional consents chosen',async()=>{
  const api=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8');
  assert.match(api,/action: "enrolled", consent_version: VERSION,\n\s+religion_consent: b\.religion_consent, marriage_opt_in: b\.marriage_opt_in \}\)/);
});

test('an identical-bundle deploy is a verified no-op, not a failure (SINGLES-LANE-NOOP-001)',()=>{
  assert.match(wf,/echo "BEFORE_BUNDLE=\$before_bundle" >> "\$GITHUB_ENV"/);
  assert.match(wf,/if \[ "\$version" -le "\$BEFORE_VERSION" \]; then[\s\S]*?test -n "\$BEFORE_BUNDLE"\n\s+test "\$version" = "\$BEFORE_VERSION"\n\s+test "\$bundle" = "\$BEFORE_BUNDLE"/);
  assert.doesNotMatch(wf,/test "\$version" -gt "\$BEFORE_VERSION"/,'a strict version bump fails every no-op release');
  assert.match(wf,/if ! git diff --quiet HEAD~1 HEAD -- supabase\/functions\/singles-api; then/,'a real code change must still advance the version');
  assert.match(wf,/fetch-depth: 2/);
  // reachability is still checked after a no-op
  const verify=wf.slice(wf.indexOf('- name: Verify deployment'),wf.indexOf('- name: Roll back'));
  assert.ok(verify.indexOf('identical bundle')<verify.indexOf('singles-api/me'));
  assert.match(verify,/test "\$status" = 'ACTIVE'/);
  assert.match(verify,/test "\$jwt" = 'true'/);
});
