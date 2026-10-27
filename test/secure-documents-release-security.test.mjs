import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSecureDocuments,checkRepository,productionReleaseAllowed} from '../scripts/validate-secure-documents-security.mjs';
test('secure document changes carry a strict, self-consistent default-OFF security contract',()=>{
 const {issues,release}=checkRepository();
 assert.deepEqual(issues,[]);
 assert.equal(release.status,'blocked');
 assert.equal(productionReleaseAllowed(release),false);
});
test('independent legal/security and exact SHA approval are separately mandatory',()=>{
 const {release}=checkRepository();
 const original=structuredClone(release);
 for(const field of ['independentReviewReceiptVerified','privacyReviewReceiptVerified','exactShaHumanGateReceiptVerified']){
   const candidate={...original,status:'approved',productionActivationDefault:true,
     independentReviewReceiptVerified:true,privacyReviewReceiptVerified:true,exactShaHumanGateReceiptVerified:true,[field]:false};
   assert.equal(productionReleaseAllowed(candidate),false,field);
 }
});
test('a malformed review policy cannot silently qualify',()=>{
 const {release}=checkRepository();
 assert.equal(productionReleaseAllowed({...release,status:'approved'}),false);
});
test('security audit rejects broadened document kind and unreviewed activation',()=>{
 const fs=await import('node:fs');
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const input={policy:JSON.parse(read('config/secure-documents-policy.json')),
   release:JSON.parse(read('config/secure-documents-release-policy.json')),
   sql:read('supabase/migrations/20261028054700_secure_documents_core.sql'),
   edge:read('supabase/functions/secure-documents-api/index.ts'),
   widget:read('my/docs/secure-widget.js')};
 input.policy.productionActivationDefault=true;
 input.release.requiredIndependentSecurityReview=false;
 input.policy.forbiddenKinds=[];
 const issues=auditSecureDocuments(input);
 assert.ok(issues.some(x=>x.includes('activation default OFF')));
 assert.ok(issues.some(x=>x.includes('independent reviewer')));
 assert.ok(issues.some(x=>x.includes('forbidden document kind')));
});
