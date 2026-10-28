import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedScannerEndpoint,verifiedScannerVerdict} from '../supabase/functions/secure-documents-api/scanner-guards.mjs';

test('scanner only accepts the canonical no-redirect EKODI internal route',()=>{
 assert.equal(approvedScannerEndpoint('https://ekodi.kr/api/internal/security/scan'),true);
 for(const url of [
  ('https://' + ['scanner','ekodi','kr'].join('.') + '/api/internal/security/scan'),
  'https://ekodi.kr.evil.example/api/internal/security/scan',
  'http://ekodi.kr/api/internal/security/scan',
  'https://ekodi.kr:444/api/internal/security/scan',
  'https://ekodi.kr/api/internal/security/scan?token=not-secret',
  'https://ekodi.kr/api/internal/security/scan#fragment',
  'https://user:pass@ekodi.kr/api/internal/security/scan',
  'https://ekodi.kr/api/internal/security/scan/extra',
  'https://ekodi.kr/auth',
  ' https://ekodi.kr/api/internal/security/scan',
  'https://ekodi.kr@attacker.example/api/internal/security/scan',
  'not-a-url'
 ])assert.equal(approvedScannerEndpoint(url),false,url);
});
test('scanner verdict is fail-closed on every non-clean or redirect response',()=>{
 const yes={verdict:'clean',engine_verified:true,pii_safe:true,redaction_verified:true};
 assert.equal(verifiedScannerVerdict(200,yes,false),true);
 assert.equal(verifiedScannerVerdict(302,yes,true),false);
 assert.equal(verifiedScannerVerdict(500,yes,false),false);
 assert.equal(verifiedScannerVerdict(200,{...yes,pii_safe:false},false),false);
 assert.equal(verifiedScannerVerdict(200,{...yes,engine_verified:'true'},false),false);
 assert.equal(verifiedScannerVerdict(200,{...yes,verdict:'malicious'},false),false);
 assert.equal(verifiedScannerVerdict(200,null,false),false);
 assert.equal(verifiedScannerVerdict(200,yes,true),false);
});
