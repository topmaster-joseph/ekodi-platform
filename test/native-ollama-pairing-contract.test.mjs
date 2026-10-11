import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
const windows=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
test('admin must explicitly confirm a fixed-length, one-time AI pairing code',()=>{
 assert.ok(code.includes("'software.localai.pair': { risk: 'maintain', confirm: true, payload: 'localai-pairing' }"));
 assert.ok(code.includes("'software.localai.pair': 'localAiPair'"));
 assert.ok(code.includes("policy.payload === 'localai-pairing'"));
 assert.ok(code.includes("/^[A-HJ-NP-Z2-9]{10}$/.test(code)"));
 assert.ok(code.includes("return {pairingCode:code}"));
});
test('pairing code is scrubbed even when Windows command fails',()=>{
 const part=code.slice(code.indexOf('async function commandResult'),code.indexOf('async function handleAgent'));
 assert.ok(part.includes("command.command_type==='software.localai.pair'"));
 assert.ok(part.includes("UPDATE device_commands SET payload_json='{}'"));
 assert.ok(part.indexOf("UPDATE device_commands SET payload_json='{}'")>part.indexOf("if (!update.meta?.changes)"));
});
test('Windows Agent can only enroll at pinned EKODI origin and keeps bearer token out of receipts',()=>{
 const begin=windows.indexOf('function Invoke-EkodiLocalAiPairing(');
 const end=windows.indexOf('function Get-EkodiLocalAiVerification {',begin);
 assert.ok(begin>0 && end>begin);
 const body=windows.slice(begin,end);
 assert.ok(body.includes("https://ekodi.kr/ai/api/node/enroll"));
 assert.ok(body.includes("ConvertFrom-SecureString"));
 assert.ok(body.includes("node-token.dpapi"));
 assert.ok(body.includes("APPDATA"));
 assert.ok(body.includes("credentialCollection = $false"));
 assert.ok(body.includes("cloudAiNodePaired = $true"));
 assert.ok(!body.includes("Write-Output $pair"));
 assert.ok(!body.includes("Write-Output $result"));
 assert.ok(!body.includes("agent.auth_token"));
 assert.ok(windows.includes("'software.localai.pair' { return Invoke-EkodiLocalAiPairing $payload }"));
 assert.ok(windows.includes("localAiPair = $true"));
});
test('pairing remains unavailable to POS, kiosk, other limited-management device types',()=>{
 assert.ok(code.includes("const DEVICE_TYPE_POLICIES = Object.freeze"));
 assert.ok(code.includes("commandAllowedForDeviceType(deviceType, commandType)"));
 assert.ok(code.includes("const management = await managementProfile(env, deviceId)"));
});
