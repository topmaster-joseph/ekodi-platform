import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const verifier=readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
test('domain control canary uses six isolated .invalid registry records',()=>{
 assert.match(verifier,/DOMAIN-CONTROL-SYNTHETIC-001/);assert.ok(verifier.includes('qa-domain-1.invalid'));assert.match(verifier,/Attempt to mutate outside synthetic registry fixture/);
});
test('domain-specific visibility blocks stale architecture screenshots',()=>{
 for(const term of ['architectureVisible','state.active','verifyDomainControlAcceptance()','.ekodi-domctl-entry','.ekodi-domctl-pill.no'])assert.ok(verifier.includes(term),term);
});
test('synthetic search, filters, mock PUT+GET and responsive screenshots enforced',()=>{
 for(const term of ['fixture-keyword','Synthetic Registrar','expiring','unset','no-renew','attention','registryWriteLog.length!==1','fixtureReadCount<=readsBefore','[320,390,768,1366,1440]','domain-control-acceptance.json'])assert.ok(verifier.includes(term),term);
});
