import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

test('installer file checksum is pinned in device agent',()=>{
 const hash=crypto.createHash('sha256').update(payload).digest('hex').toUpperCase();
 assert.ok(agent.includes(hash));
 assert.ok(agent.includes('LOCALAI_INSTALLER_HASH_MISMATCH'));
});
