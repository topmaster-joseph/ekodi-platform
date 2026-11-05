import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const cli=new URL('../scripts/inspect-ekodibiz-campus-ai.mjs',import.meta.url).pathname;
function fixture(){
  return {
    observedAt:new Date().toISOString(),
    runtime:{local:{ledgerAvailable:true,tenantIsolationVerified:true,auditAvailable:true,taskQueueAvailable:true,
      financeReconciled:true,paymentCoreAvailable:true,backupRestoreVerified:true,nativeBrowserAvailable:true,recoveryPathAvailable:true}},
    external:{aiSupplier:'offline',governmentPortal:'online'},
    approvals:{},
    termination:{unconfirmedCancellationCount:0,fourthChargeRiskCount:0},
  };
}
test('standalone Node CLI works with no login, third-party API or browser call',()=>{
  const r=spawnSync(process.execPath,[cli],{input:JSON.stringify(fixture()),encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(r.stdout);
  assert.equal(out.coreAvailable,true);
  assert.equal(out.status,'PROVIDER_DEGRADED_CORE_ONLY');
  assert.equal(out.paymentAuthorized,false);
});
test('standalone CLI returns nonzero for missing core ledger, without exposing input',()=>{
  const s=fixture();s.runtime.local.ledgerAvailable=false;s.secret='sensitive-password-example';
  const r=spawnSync(process.execPath,[cli],{input:JSON.stringify(s),encoding:'utf8',timeout:5000});
  assert.equal(r.status,3);
  assert.equal(JSON.stringify(r.stdout).includes('sensitive-password-example'),false);
});
test('standalone CLI refuses malformed and oversized inputs',()=>{
  for (const input of ['not-json','x'.repeat(70000)]) {
    const r=spawnSync(process.execPath,[cli],{input,encoding:'utf8',timeout:5000});
    assert.equal(r.status,2);
    assert.equal(r.stdout,'');
  }
});
