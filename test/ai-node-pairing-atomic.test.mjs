import test from 'node:test';
import assert from 'node:assert/strict';
import aiWorker from '../ai-control-worker.js';

function fakeD1({expired=false,insertFails=false}={}){
  const state={used:expired,insertCount:0,redemptionCount:0,issuedSecrets:[]};
  const DB={
    prepare(sql){
      return {
        bind(...args){
          return {async run(){
            if(sql.startsWith('UPDATE ai_control_node_pairings SET used_at=')){
              state.redemptionCount++;
              const available=!state.used;
              if(available)state.used=true;
              return{success:true,meta:{changes:available?1:0}};
            }
            if(sql.startsWith('INSERT INTO ai_control_nodes')){
              if(insertFails)throw new Error('simulated_d1_write_failure');
              state.insertCount++;
              state.issuedSecrets.push(args[2]); // Only hashed secrets can reach D1.
              return{success:true,meta:{changes:1}};
            }
            throw new Error('unexpected_sql_operation');
          }};
        }
      };
    }
  };
  return{DB,state};
}
const attempt=(DB,nodeId)=>
  aiWorker.fetch(new Request('https://ai.internal/api/node/enroll',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({code:'ABCDEFGHJK',nodeId,name:nodeId,providers:['ollama-local']})
  }),{DB},{waitUntil(){}});

test('simultaneous AI account node enrolls cannot redeem a pairing code twice',async()=>{
  const {DB,state}=fakeD1();
  const replies=await Promise.all([attempt(DB,'node-one'),attempt(DB,'node-two')]);
  const statuses=replies.map(r=>r.status).sort((a,b)=>a-b);
  assert.deepEqual(statuses,[201,401]);
  assert.equal(state.redemptionCount,2);
  assert.equal(state.insertCount,1);
  const winner=replies.find(r=>r.status===201);
  const loser=replies.find(r=>r.status===401);
  assert.ok((await winner.json()).nodeToken);
  assert.deepEqual(await loser.json(),{error:'pairing_invalid_or_expired'});
  assert.match(state.issuedSecrets[0],/^[0-9a-f]{64}$/i);
  assert.notEqual(state.issuedSecrets[0], 'ABCDEFGHJK');
});

test('already redeemed or expired one-time code cannot register a node',async()=>{
  const {DB,state}=fakeD1({expired:true});
  const response=await attempt(DB,'expired-node');
  assert.equal(response.status,401);
  assert.equal(state.insertCount,0);
  assert.deepEqual(await response.json(),{error:'pairing_invalid_or_expired'});
});

test('failed D1 node insert never restores a redeemed pairing code',async()=>{
  const {DB,state}=fakeD1({insertFails:true});
  await assert.rejects(attempt(DB,'failed-node'),/simulated_d1_write_failure/);
  assert.equal(state.used,true);
  const response=await attempt(DB,'replay-node');
  assert.equal(response.status,401);
  assert.equal(state.insertCount,0);
});

test('one-time node pairing implementation consumes code conditionally before issuing credentials',()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8'));
  const section=source.slice(source.indexOf('async function enrollNode('),source.indexOf('async function insertTask('));
  const claim=section.indexOf('UPDATE ai_control_node_pairings SET used_at=? WHERE code_hash=? AND used_at=\'\' AND expires_at>=?');
  const insert=section.indexOf('INSERT INTO ai_control_nodes');
  assert.ok(claim>=0 && insert>claim);
  assert.match(section,/Number\(redeemed\?\.meta\?\.changes\?\?0\)!==1/);
  assert.doesNotMatch(section,/SELECT \* FROM ai_control_node_pairings/);
});
