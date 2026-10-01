import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import adapter from '../kftc-openbanking-adapter-worker.js';

test('KFTC adapter is fail-closed by default and never executes transfers',async()=>{
  const health=await adapter.fetch(new Request('https://internal/health'),{});
  assert.equal(health.status,200);
  const body=await health.json();
  assert.equal(body.service,'ekodi-kftc-openbanking-adapter');
  assert.equal(body.ready,false);
  assert.equal(body.transferExecution,false);
  assert.equal(body.tokenStoreConnected,false);

  const balance=await adapter.fetch(new Request('https://internal/v1/balance',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId:'conn-1'})
  }),{});
  assert.equal(balance.status,503);
  assert.equal((await balance.json()).error,'adapter_not_ready');

  const transfer=await adapter.fetch(new Request('https://internal/v1/transfer',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'
  }),{});
  assert.equal(transfer.status,405);
  assert.equal((await transfer.json()).error,'transfer_execution_not_supported');
});

test('KFTC adapter source accepts connectionId only and resolves token material from an internal store',async()=>{
  const source=await readFile(new URL('../kftc-openbanking-adapter-worker.js',import.meta.url),'utf8');
  assert.match(source,/TOKEN_STORE\.fetch/);
  assert.match(source,/kftc-token-store\.internal\/v1\/resolve/);
  assert.match(source,/openapi\.openbanking\.or\.kr\/v2\.0\/account\/balance\/fin_num/);
  assert.match(source,/openapi\.openbanking\.or\.kr\/v2\.0\/account\/transaction_list\/fin_num/);
  assert.doesNotMatch(source,/\/v1\/transfer[^']*'&&request\.method/);
  assert.match(source,/transfer_execution_not_supported/);
});

test('Money requires explicit adapter ready flag even when service binding exists',async()=>{
  const readiness=await import('../money/kftc-openbanking.js');
  const base={
    KFTC_OPENBANKING_ENABLED:'true',
    KFTC_OPENBANKING_CONTRACT_APPROVED:'true',
    KFTC_OPENBANKING_CLIENT_ID:'client',
    KFTC_OPENBANKING_REDIRECT_URI:readiness.KFTC_OPENBANKING.canonicalRedirectUri,
    OAUTH_STATE_STORE_READY:'true',
    TOKEN_ENCRYPTION_READY:'true',
    CONSENT_STORE_READY:'true',
    KFTC_OPENBANKING_APPROVED_READ_SCOPES:'inquiry',
    KFTC_OPENBANKING_ADAPTER:{fetch:async()=>new Response('{}')}
  };
  assert.equal(readiness.kftcOpenBankingReadiness(base).readReady,false);
  assert.equal(readiness.kftcOpenBankingReadiness({...base,KFTC_OPENBANKING_ADAPTER_READY:'true'}).readReady,true);
});
