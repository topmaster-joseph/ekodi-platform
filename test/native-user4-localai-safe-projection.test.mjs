import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCommandResult,projectNativeDeviceProofs} from '../device-control.js';
import {observeNativeDeviceReadiness} from '../scripts/observe-native-device-readiness.mjs';

const now=Date.parse('2026-10-16T00:00:00.000Z');
const checkedAt=new Date(now-30000).toISOString();
const allowedCodes=[
  'not_checked','api_ready','process_not_running','loopback_port_not_listening',
  'wrong_bind','port_bound_unresponsive','api_timeout',
  'version_response_invalid','api_unavailable_unclassified'
];
const base={checkedAt,ollamaApi:'unavailable',inference:'not_checked',executionMode:'fixed_loopback_api',credentialCollection:false};
test('only allowlisted safe USER4 diagnostic categories survive the Control API command summary',()=>{
  for(const diagnosticCode of allowedCodes){
    const payload={localAiProof:{...base,diagnosticCode,
      ollamaProcess:'running',ollamaSocket:'not_listening',
      ollamaBind:'other_address_only',ollamaService:'not_registered',
      apiKey:'SENSITIVE-TOKEN',username:'SENSITIVE-USERNAME',
      executablePath:'SENSITIVE-PATH',modelOutput:'SENSITIVE-GENERATION',
      pid:98765,rawException:'SENSITIVE-EXCEPTION'}};
    const result=summarizeCommandResult(payload,'software.localai.verify');
    assert.equal(result.localAiProof.diagnosticCode,diagnosticCode);
    assert.equal(result.localAiProof.ollamaProcess,'running');
    assert.equal(result.localAiProof.ollamaBind,'other_address_only');
    assert.equal(result.localAiProof.executionMode,'fixed_loopback_api');
    assert.doesNotMatch(JSON.stringify(result),/SENSITIVE-|apiKey|username|executablePath|rawException|pid/);
  }
});
test('untrusted category values and arbitrary object payloads fail closed',()=>{
  const result=summarizeCommandResult({localAiProof:{
    ...base,diagnosticCode:'SENSITIVE-RAW-ERROR',ollamaProcess:'SENSITIVE-PROCESS',
    ollamaSocket:'SENSITIVE-SOCKET',ollamaBind:'SENSITIVE-BIND',
    ollamaService:'SENSITIVE-SERVICE',inference:'SENSITIVE-MODEL-TEXT'
  }},'software.localai.verify');
  assert.equal(result.localAiProof.diagnosticCode,'unclassified');
  assert.equal(result.localAiProof.ollamaProcess,'unknown');
  assert.equal(result.localAiProof.ollamaSocket,'unknown');
  assert.equal(result.localAiProof.ollamaBind,'unknown');
  assert.equal(result.localAiProof.ollamaService,'unknown');
  assert.equal(result.localAiProof.inference,'unknown');
  assert.doesNotMatch(JSON.stringify(result),/SENSITIVE-/);
});
test('read-only USER4 diagnostic is visible but never converts API failure into inference success',()=>{
  const localAiProof=summarizeCommandResult({localAiProof:{...base,diagnosticCode:'wrong_bind',ollamaBind:'other_address_only'}},'software.localai.verify');
  const projection=projectNativeDeviceProofs([{
    command_type:'software.localai.verify',status:'succeeded',
    completed_at:checkedAt,issued_at:checkedAt,
    result_json:JSON.stringify(localAiProof)
  }],now);
  assert.equal(projection.localAi.diagnosticCode,'wrong_bind');
  assert.equal(projection.localAi.verified,false);
  assert.equal(projection.localAi.ollamaApi,'unverified');
});
test('scheduled authenticated USER4 GET emits only bounded diagnostic code, no raw fields or mutation',async()=>{
  const requests=[];
  const fetchImpl=async(url,init)=>{
    requests.push({url,method:init.method});
    return new Response(JSON.stringify({
      devices:[{hostname:'USER4',status:'online',revokedAt:null,
        platform:'Windows 11',management:{source:'agent',type:'pc'},
        lastSeenAt:checkedAt,capabilities:{localAiVerify:true}}],
      proofs:{localAi:{status:'succeeded',verified:false,fresh:true,
        completedAt:checkedAt,diagnosticCode:'loopback_port_not_listening',
        raw:'SENSITIVE-RAW-DATA'}}
    }),{status:200});
  };
  const result=await observeNativeDeviceReadiness({
    token:'valid-temporary-admin-session-string',hostname:'user4',now,fetchImpl
  });
  assert.equal(result.targetAlias,'user4');
  assert.equal(result.proofs.localAi.diagnosticCode,'loopback_port_not_listening');
  assert.equal(result.proofs.localAi.verified,false);
  assert.deepEqual(requests,[{
    url:'https://ekodi.kr/api/control/devices/readiness?hostname=user4',method:'GET'
  }]);
  assert.doesNotMatch(JSON.stringify(result),/SENSITIVE-/);
});
