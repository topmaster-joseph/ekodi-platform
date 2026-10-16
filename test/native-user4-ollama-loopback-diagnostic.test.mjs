import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeLocalAiFailureCode} from '../scripts/verify-native-localai.mjs';

const agent=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
const diagnosticStart=agent.indexOf('function Get-EkodiOllamaLoopbackDiagnostic');
const verificationStart=agent.indexOf('function Get-EkodiLocalAiVerification',diagnosticStart);
const end=agent.indexOf('# Audit only browser jobs',verificationStart);
const diagnostic=agent.slice(diagnosticStart,verificationStart);
const verification=agent.slice(verificationStart,end);

test('USER4 native Agent 2.5.8 reads fixed Ollama loopback without execution or private data',()=>{
  assert.ok(diagnosticStart>0&&verificationStart>diagnosticStart&&end>verificationStart);
  assert.match(agent,/\$AgentVersion = '2\.5\.7'/);
  assert.match(diagnostic,/Get-Process -Name \$names -ErrorAction SilentlyContinue/);
  assert.match(diagnostic,/Get-Service -Name 'Ollama' -ErrorAction SilentlyContinue/);
  assert.match(diagnostic,/BeginConnect\('127\.0\.0\.1', 11434, \$null, \$null\)/);
  assert.match(diagnostic,/WaitOne\(1200\)/);
  assert.match(diagnostic,/Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction Stop/);
  for(const banned of ['Start-Process','Stop-Process','Restart-Computer','Get-Clipboard','Get-CimInstance','Invoke-Expression','Invoke-WebRequest']) {
    assert.ok(!diagnostic.includes(banned),banned);
  }
  assert.doesNotMatch(diagnostic,/\.CommandLine|\.ExecutablePath|\.Path\b|\.UserName|\.Id\b|ProcessId/);
});

test('only enumerated statuses leave the native loopback diagnostic',()=>{
  for(const code of [
    'process_not_running','loopback_port_not_listening','port_bound_unresponsive',
    'wrong_bind','version_response_invalid','api_timeout','api_unavailable_unclassified'
  ]) {
    assert.ok(verification.includes("'"+code+"'"),code);
    assert.equal(nativeLocalAiFailureCode({ollamaApi:'unavailable',diagnosticCode:code}),'native_localai_'+code);
  }
  assert.equal(nativeLocalAiFailureCode({ollamaApi:'unavailable',diagnosticCode:'C:/private?token=hidden'}),'native_localai_api_unavailable');
  assert.equal(nativeLocalAiFailureCode({ollamaApi:'unavailable'}),'native_localai_api_unavailable');
  assert.equal(nativeLocalAiFailureCode({ollamaApi:'ready',inference:'passed'}),'native_localai_inference_not_ready');
});

test('Windows diagnostic remains read-only and fixed-loopback even if API is unavailable',()=>{
  assert.match(verification,/Get-EkodiOllamaLoopbackDiagnostic/);
  assert.match(verification,/http:\/\/127\.0\.0\.1:11434\/api\/version/);
  assert.match(verification,/http:\/\/127\.0\.0\.1:11434\/api\/tags/);
  assert.match(verification,/http:\/\/127\.0\.0\.1:11434\/api\/generate/);
  assert.match(verification,/credentialCollection = \$false/);
  assert.match(verification,/executionMode = 'fixed_loopback_api'/);
  assert.match(verification,/ollamaProcess = 'unknown'/);
  assert.match(verification,/ollamaSocket = 'unknown'/);
  assert.match(verification,/ollamaBind = 'unknown'/);
  assert.match(verification,/ollamaService = 'unknown'/);
  for(const banned of ['Stop-Service','Start-Service','Start-Process','Install-EkodiLocalAI','Remove-Item','Restart-Computer']) {
    assert.ok(!diagnostic.includes(banned)&&!verification.includes(banned),banned);
  }
  assert.doesNotMatch(verification,/Write-Host|Write-Output|Write-Warning/);
});
