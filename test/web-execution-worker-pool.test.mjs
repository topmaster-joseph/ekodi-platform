import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebExecutionWorkerPool } from '../web-execution-worker-pool.js';

test('pool bounds concurrency', async()=>{
 let active=0,max=0; const adapter={id:'owned',invoke:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return {ok:true};}};
 const pool=createWebExecutionWorkerPool({concurrency:2,timeoutMs:1000});
 await Promise.all(Array.from({length:6},()=>pool.run(adapter,{})));
 assert.equal(max,2); assert.equal(pool.status().queued,0);
});
test('timeout counts toward circuit breaker', async()=>{
 let t=0; const pool=createWebExecutionWorkerPool({timeoutMs:10,failureThreshold:2,cooldownMs:1000,now:()=>t});
 const adapter={id:'slow',invoke:()=>new Promise(()=>{})};
 await assert.rejects(()=>pool.run(adapter,{}),/TIMEOUT/);
 await assert.rejects(()=>pool.run(adapter,{}),/TIMEOUT/);
 await assert.rejects(()=>pool.run(adapter,{}),/CIRCUIT_OPEN/);
});
test('successful call resets circuit failures', async()=>{
 const pool=createWebExecutionWorkerPool({timeoutMs:100,failureThreshold:2});
 let n=0; const adapter={id:'flaky',invoke:async()=>{n++;if(n===1)throw new Error('boom');return {ok:true};}};
 await assert.rejects(()=>pool.run(adapter,{}),/boom/);
 assert.equal((await pool.run(adapter,{})).ok,true);
 assert.equal(pool.status().circuits.length,0);
});
