import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { handleOrchestratorCompletionReconciliation } from '../ekodi-orchestrator-task-adapter.js';

const issuer='https://token.actions.githubusercontent.com';
const taskId='orch_00000000-0000-4000-8000-000000000123';
const branchRef=`ai/chatgpt/${taskId}`;
const mergeSha='0123456789abcdef0123456789abcdef01234567';

function oidcFixture(){
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=publicKey.export({format:'jwk'});
  Object.assign(jwk,{kid:'endpoint-key',use:'sig',alg:'RS256'});
  const now=Math.floor(Date.now()/1000);
  const header={alg:'RS256',typ:'JWT',kid:'endpoint-key'};
  const claims={
    iss:issuer,
    aud:'ekodi-orchestrator-completion',
    repository:'topmaster-joseph/ekodi-platform',
    ref:'refs/heads/main',
    event_name:'workflow_run',
    workflow_ref:'topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main',
    workflow_sha:mergeSha,
    run_id:'777',
    run_attempt:'1',
    actor:'github-actions',
    sub:'repo:topmaster-joseph/ekodi-platform:ref:refs/heads/main',
    nbf:now-10,
    exp:now+300,
  };
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const input=`${encoded(header)}.${encoded(claims)}`;
  const signature=sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  const token=`${input}.${signature}`;
  const fetchImpl=async inputUrl=>{
    const url=String(inputUrl);
    if(url===`${issuer}/.well-known/openid-configuration`)return new Response(JSON.stringify({issuer,jwks_uri:`${issuer}/.well-known/jwks`}),{status:200});
    if(url===`${issuer}/.well-known/jwks`)return new Response(JSON.stringify({keys:[jwk]}),{status:200});
    if(url==='https://ekodi.kr/api/health')return new Response(JSON.stringify({ok:true,service:'ekodi-auth-api',version:4}),{status:200});
    throw new Error('unexpected fetch '+url);
  };
  return {token,fetchImpl};
}

function dbFixture(){
  const row={
    task_id:taskId,
    requester_id:'person-1',
    branch_ref:branchRef,
    state:'assigned',
    state_version:2,
    permission_class:'delegated',
    deployment_requested:1,
    evidence_json:'[]',
    result_json:null,
    production_evidence_json:null,
    pr_ref:null,
    created_at:'2026-10-05T00:00:00.000Z',
    updated_at:'2026-10-05T00:00:01.000Z',
    completed_at:null,
    target_json:'{}',
    intent:'test',
    risk:'normal',
    assigned_worker:'ekodi-command-plane',
  };
  const events=[];
  const refs=[];
  const DB={
    prepare(sql){
      const statement={
        args:[],
        bind(...args){this.args=args;return this;},
        async first(){
          if(sql.includes('COALESCE(MAX(seq),0)+1'))return {seq:events.length+1};
          if(sql.includes('WHERE task_id=? AND branch_ref=?'))return this.args[0]===row.task_id&&this.args[1]===row.branch_ref?row:null;
          if(sql.includes('WHERE task_id = ? AND requester_id = ?'))return this.args[0]===row.task_id&&this.args[1]===row.requester_id?row:null;
          return null;
        },
        async all(){
          if(sql.includes('FROM ekodi_orchestrator_tasks')&&sql.includes('ORDER BY updated_at ASC LIMIT 50')){
            return {results:[{task_id:row.task_id,branch_ref:row.branch_ref,state:row.state,updated_at:row.updated_at}]};
          }
          return {results:[]};
        },
        async run(){
          if(sql.startsWith('UPDATE ekodi_orchestrator_tasks SET state=\'completed\'')){
            row.state='completed';
            row.state_version+=1;
            row.pr_ref=this.args[0];
            row.result_json=this.args[1];
            row.evidence_json=this.args[2];
            row.production_evidence_json=this.args[3];
            row.updated_at=this.args[4];
            row.completed_at=this.args[5];
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT INTO ekodi_orchestrator_task_events')){
            events.push({args:this.args});
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT OR IGNORE INTO ekodi_orchestrator_external_refs')){
            refs.push({args:this.args});
            return {meta:{changes:1}};
          }
          return {meta:{changes:1}};
        },
      };
      return statement;
    },
    async batch(statements){
      for(const statement of statements)await statement.run();
      return statements.map(()=>({meta:{changes:1}}));
    },
  };
  return {env:{DB},row,events,refs};
}

function request(token,body){
  return new Request('https://ekodi.kr/api/orchestrator/completion-reconciliation',{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify(body),
  });
}

test('OIDC workflow can list only nonterminal delegated deployment candidates',async()=>{
  const {token,fetchImpl}=oidcFixture();
  const {env}=dbFixture();
  const response=await handleOrchestratorCompletionReconciliation(request(token,{action:'candidates'}),env,{fetchImpl});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.authority,'ekodi-orchestrator');
  assert.deepEqual(body.candidates,[{taskId,branchRef,state:'assigned',updatedAt:'2026-10-05T00:00:01.000Z'}]);
});

test('verified OIDC evidence plus live health performs idempotent authoritative completion',async()=>{
  const {token,fetchImpl}=oidcFixture();
  const {env,row,events,refs}=dbFixture();
  const evidence={
    verified:true,
    taskId,
    branchRef,
    pr:{number:3574,url:'https://github.com/topmaster-joseph/ekodi-platform/pull/3574',mergedAt:'2026-10-05T05:45:00Z',mergeCommitSha:mergeSha},
    requiredWorkflows:[
      {name:'CI',runId:1,url:'https://example/ci',conclusion:'success'},
      {name:'EKODI AI Orchestration Gate',runId:2,url:'https://example/gate',conclusion:'success'},
    ],
    deployments:[{workflow:'Deploy Control API',runId:3,htmlUrl:'https://example/deploy',supersedesRunId:null,stagingJobs:['staging'],productionJobs:['production']}],
  };
  const response=await handleOrchestratorCompletionReconciliation(request(token,{action:'complete',taskId,branchRef,evidence}),env,{fetchImpl});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.state,'completed');
  assert.equal(row.state,'completed');
  assert.equal(row.pr_ref,'https://github.com/topmaster-joseph/ekodi-platform/pull/3574');
  const production=JSON.parse(row.production_evidence_json);
  assert.equal(production.source,'github-actions-oidc-and-live-health');
  assert.equal(production.live.ok,true);
  assert.equal(production.receipt.runId,'777');
  assert.equal(events.length,1);
  assert.equal(refs.length,2);

  const second=await handleOrchestratorCompletionReconciliation(request(token,{action:'complete',taskId,branchRef,evidence}),env,{fetchImpl});
  assert.equal(second.status,200);
  const secondBody=await second.json();
  assert.equal(secondBody.idempotent,true);
  assert.equal(events.length,1);
});

test('completion endpoint rejects unauthenticated callers before reading ledger',async()=>{
  const {env}=dbFixture();
  const response=await handleOrchestratorCompletionReconciliation(
    new Request('https://ekodi.kr/api/orchestrator/completion-reconciliation',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"candidates"}'}),
    env,
    {fetchImpl:async()=>{throw new Error('must not matter')}},
  );
  assert.equal(response.status,401);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.equal(body.reason,'github_actions_oidc_required');
});
