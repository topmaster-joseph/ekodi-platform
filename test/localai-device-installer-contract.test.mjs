import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const api=fs.readFileSync(path.join(root,'device-control.js'),'utf8');
const agent=fs.readFileSync(path.join(root,'tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'),'utf8');
const payload=fs.readFileSync(path.join(root,'tools/ekodi-device-agent/windows/ekodi-localai-installer.ps1'));

test('local AI package uses a confirm-gated device command',()=>{
 assert.ok(api.includes("'software.localai.install': { risk: 'maintain', confirm: true }"));
 assert.ok(api.includes("'software.localai.install': 'localAiInstall'"));
 assert.ok(agent.includes("'software.localai.install' { return Install-EkodiLocalAI }"));
});
test('native local AI verification is observe-only and cloud-payload-free',()=>{
 assert.ok(api.includes("'software.localai.verify': { risk: 'observe' }"));
 assert.ok(api.includes("'software.localai.verify': 'localAiVerify'"));
 assert.ok(agent.includes("'software.localai.verify' { return Get-EkodiLocalAiVerification }"));
 assert.ok(agent.includes('localAiVerify = $true'));
 assert.ok(agent.includes("Uri 'http://127.0.0.1:11434/api/generate'"));
 assert.ok(agent.includes('num_predict = 8; num_ctx = 512'));
 assert.ok(agent.includes('TimeoutSec 45'));
 assert.ok(agent.includes("claudeAuth = 'requires_interactive_user_verification'"));
 assert.ok(!agent.includes('function Get-EkodiLocalAiVerification($Payload)'));
});

test('local AI proof survives sanitized admin device projection without secrets', () => {
 const start = api.indexOf('function summarizeCommandResult(');
 const end = api.indexOf('\n}\n', start) + 3;
 assert.ok(start >= 0 && end > start);
 const source = api.slice(start, end);
 const summarize = vm.runInNewContext(source + '\nsummarizeCommandResult', {
   safeText: (value, max = 120) => String(value ?? '').trim().slice(0, max),
 });
 const receipt = summarize({
   message: 'local test receipt',
   localAiProof: {
     checkedAt: '2026-10-10T00:00:00Z',
     ollamaApi: 'ready',
     ollamaVersion: '0.40.1',
     selectedModel: 'qwen2.5-coder:1.5b',
     inference: 'passed',
     claudeCli: 'visible_in_agent_context',
     claudeAuth: 'fake_authenticated',
     credentialCollection: false,
     accessToken: 'SHOULD_NOT_BE_EXPOSED',
     rawOutput: 'SHOULD_NOT_BE_EXPOSED',
     environment: { SECRET: 'SHOULD_NOT_BE_EXPOSED' },
   },
 });
 assert.equal(receipt.localAiProof.inference, 'passed');
 assert.equal(receipt.localAiProof.selectedModel, 'qwen2.5-coder:1.5b');
 assert.equal(receipt.localAiProof.claudeAuth, 'requires_interactive_user_verification');
 assert.equal(receipt.localAiProof.accessToken, undefined);
 assert.equal(receipt.localAiProof.rawOutput, undefined);
 assert.equal(receipt.localAiProof.environment, undefined);
 assert.ok(!JSON.stringify(receipt).includes('SHOULD_NOT_BE_EXPOSED'));
 const invalid = summarize({localAiProof: {inference:'passed!!!',selectedModel:'unknown-model',ollamaApi:'hacked'}});
 assert.equal(invalid.localAiProof.inference, 'unknown');
 assert.equal(invalid.localAiProof.selectedModel, '');
 assert.equal(invalid.localAiProof.ollamaApi, 'unknown');
});

test('sanitized local AI proof persists after last-five command history rollover', () => {
 const findFunction = name => {
   const start = api.indexOf('function ' + name + '(');
   const end = api.indexOf('\n}\n', start) + 3;
   assert.ok(start >= 0 && end > start, name + ' not found');
   return api.slice(start, end);
 };
 const sandbox = {
   safeText: (value, max = 120) => String(value ?? '').trim().slice(0, max),
   parseJson: value => JSON.parse(value || '{}'),
   DIAGNOSTIC_SECTIONS: {},
 };
 const source = findFunction('summarizeCommandResult') + '\n' +
   findFunction('mergeDiagnosticResult') + '\nmergeDiagnosticResult';
 const merge = vm.runInNewContext(source, sandbox);
 const device = { diagnostics_json: JSON.stringify({ system: { cpuLoadPct: 3 } }) };
 const response = merge(device, 'software.localai.verify', { localAiProof: {
   checkedAt: '2026-10-10T21:00:00Z', ollamaApi: 'ready', inference: 'passed',
   selectedModel: 'qwen2.5-coder:1.5b', claudeAuth: 'faked_auth',
   accessToken: 'SENSITIVE_VALUE',
 } });
 assert.equal(response.localAiProof.inference, 'passed');
 assert.equal(response.localAiProof.claudeAuth, 'requires_interactive_user_verification');
 assert.equal(response.localAiProof.accessToken, undefined);
 assert.equal(response.system.cpuLoadPct, 3);
 assert.ok(!JSON.stringify(response).includes('SENSITIVE_VALUE'));
 const refreshed = merge({diagnostics_json: JSON.stringify(response)}, 'diagnostics.collect', {
   diagnostics: { system: { cpuLoadPct: 9 } },
 });
 assert.equal(refreshed.system.cpuLoadPct, 9);
 assert.equal(refreshed.localAiProof.inference, 'passed');
 assert.equal(refreshed.localAiProof.selectedModel, 'qwen2.5-coder:1.5b');
 assert.equal(refreshed.localAiProof.accessToken, undefined);
 assert.ok(api.includes("current.localAiProof = summarizeCommandResult(result).localAiProof"));
 const admin = fs.readFileSync(path.join(root,'device-control-admin.js'),'utf8');
 assert.ok(admin.includes("proofCommand?.result?.localAiProof || device.diagnostics?.localAiProof"));
});

test('installer file checksum is pinned in device agent',()=>{
 const hash=crypto.createHash('sha256').update(payload).digest('hex').toUpperCase();
 assert.ok(agent.includes(hash));
 assert.ok(agent.includes('LOCALAI_INSTALLER_HASH_MISMATCH'));
});
