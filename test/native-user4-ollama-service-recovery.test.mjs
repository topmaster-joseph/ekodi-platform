import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeUser4ServiceRecoveryCandidate,recoverUser4ExistingOllama}
  from '../scripts/recover-native-user4-ollama-service.mjs';

const now=Date.parse('2026-10-16T01:00:00.000Z');
const modelProof={ollamaApi:'unavailable',ollamaService:'stopped',ollamaProcess:'not_running',
  ollamaSocket:'not_listening',ollamaBind:'not_listening',diagnosticCode:'process_not_running'};
const latest={id:'verified-1',type:'software.localai.verify',status:'succeeded',
  completedAt:new Date(now-5000).toISOString(),result:{localAiProof:modelProof}};
const device={id:'user4-device',hostname:'USER4',status:'online',revokedAt:null,
  lastSeenAt:new Date(now-1000).toISOString(),platform:'Windows 11',
  management:{source:'agent',type:'pc'},
  capabilities:{localAiVerify:true,localAiInstall:true},
  recentCommands:[latest]};
test('USER4 existing stopped service with fresh signed device receipt is eligible',()=>{
  assert.equal(safeUser4ServiceRecoveryCandidate(device,now).deviceId,'user4-device');
  for(const invalid of [
    {...device,hostname:'USER3'},{...device,status:'offline'},
    {...device,capabilities:{...device.capabilities,localAiInstall:false}},
    {...device,recentCommands:[{...latest,completedAt:new Date(now-600000).toISOString()}]},
    {...device,recentCommands:[{...latest,result:{localAiProof:{...modelProof,ollamaService:'not_registered'}}}]},
    {...device,recentCommands:[{...latest,result:{localAiProof:{...modelProof,ollamaSocket:'listening'}}}]},
    {...device,recentCommands:[{...latest,result:{localAiProof:{...modelProof,ollamaProcess:'running'}}}]},
    {...device,recentCommands:[{...latest,result:{localAiProof:{...modelProof,ollamaBind:'other_address_only'}}}]},
    {...device,recentCommands:[{...latest,result:{localAiProof:{...modelProof,ollamaApi:'ready'}}}]},
    {...device,recentCommands:[latest,{type:'computer.browser.canary',status:'claimed'}]}
  ])assert.equal(safeUser4ServiceRecoveryCandidate(invalid,now),null);
});
test('recovery submits exactly one confirmed fixed command and requires post-recovery inference',async()=>{
  let posted=false;let checks=0;
  const requests=[];
  const fetchImpl=async(url,init)=>{
    requests.push({url,method:init.method,body:init.body});
    if(init.method==='POST'){
      const b=JSON.parse(init.body);
      assert.deepEqual(b,{type:'software.localai.recover',confirmed:true});
      posted=true;
      return new Response(JSON.stringify({command:{id:'repair-1',type:b.type,status:'queued'}}),{status:200});
    }
    const recovery=posted?[{id:'repair-1',type:'software.localai.recover',status:'succeeded',
      result:{localAiRecovery:{mode:'registered_service_only',recovered:true},
        localAiProof:{ollamaApi:'ready',inference:'passed',credentialCollection:false}}}]:[];
    return new Response(JSON.stringify({devices:[{...device,recentCommands:[...recovery,latest]}]}),{status:200});
  };
  const verifyFn=async()=>{
    checks++;
    if(checks===1)throw Error('native_localai_process_not_running');
    return {targetAlias:'user4',receiptStatus:'succeeded',ollamaApi:'ready',
      inference:'passed',model:'qwen2.5-coder:1.5b',commandId:'verify-2'};
  };
  const result=await recoverUser4ExistingOllama({token:'a-restricted-superadmin-token-123',
    fetchImpl,verifyFn,clock:()=>now,sleepFn:async()=>{},maxPoll:3});
  assert.equal(result.serviceRecovered,true);
  assert.equal(result.localAiVerified,true);
  assert.equal(checks,2);
  assert.equal(requests.filter(r=>r.method==='POST').length,1);
  assert(requests.every(r=>r.url.startsWith('https://ekodi.kr/api/control/devices')));
});
test('missing or conflicting USER4 proof never triggers mutation',async()=>{
  let writes=0;
  const fetchImpl=async(url,init)=>{
    if(init.method==='POST')writes++;
    return new Response(JSON.stringify({devices:[{...device,recentCommands:[{
      ...latest,result:{localAiProof:{...modelProof,ollamaService:'not_registered'}}}
    ]}]}),{status:200});
  };
  await assert.rejects(()=>recoverUser4ExistingOllama({token:'a-restricted-superadmin-token-123',
    fetchImpl,verifyFn:async()=>{throw Error('API unavailable');},clock:()=>now,
    sleepFn:async()=>{},maxPoll:1}),/registered_stopped_service_proof_required/);
  assert.equal(writes,0);
});
test('Windows Agent service recovery stays fixed scope and never reinstalls',()=>{
  const source=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
  const start=source.indexOf('function Invoke-EkodiOllamaExistingServiceRecovery {');
  const end=source.indexOf('\nfunction ',start+10);
  assert(start>=0);
  const block=source.slice(start,end>start?end:undefined);
  assert.match(block,/Get-EkodiOllamaLoopbackDiagnostic/);
  assert.match(block,/Start-Service -Name 'Ollama'/);
  assert.match(block,/Get-EkodiLocalAiVerification/);
  assert.match(block,/LOCALAI_RECOVERY_REGISTERED_STOPPED_SERVICE_REQUIRED/);
  assert.doesNotMatch(block,/Install-EkodiLocalAI|Invoke-WebRequest|ollama pull|Restart-Computer|Stop-Process|Start-Process|winget|choco/i);
  const control=readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
  assert.match(control,/'software\.localai\.recover': \{ risk: 'maintain', confirm: true \}/);
  assert.match(control,/'software\.localai\.recover': 'localAiInstall'/);
});
