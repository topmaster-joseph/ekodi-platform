import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');
const [agent,installer,api,admin]=await Promise.all([
  read('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'),
  read('tools/ekodi-device-agent/windows/ekodi-codex-toolchain-install.ps1'),
  read('device-control.js'),
  read('device-control-admin.js'),
]);

test('Codex commands are allowlisted, separated by risk and admin confirmation',()=>{
  assert.match(api, /'software\.codex\.check': \{ risk: 'observe' \}/);
  assert.match(api, /'software\.codex\.install': \{ risk: 'maintain', confirm: true \}/);
  assert.match(api, /'software\.codex\.check': 'codexToolchainCheck'/);
  assert.match(api, /'software\.codex\.install': 'codexToolchainInstall'/);
  for(const name of ['software.codex.check','software.codex.install']){
    assert.ok(agent.includes("'"+name+"'"));
    assert.ok(admin.includes("'"+name+"'"));
  }
  assert.match(agent,/codexToolchainCheck = \$true/);
  assert.match(agent,/codexToolchainInstall = \$true/);
  assert.match(admin,/makeActionButton\(device, 'software\.codex\.check'/);
  assert.match(admin,/makeActionButton\(device, 'software\.codex\.install'/);
});

test('Agent downloads only its exact, reviewed install helper bytes',()=>{
  const actual=createHash('sha256').update(installer,'utf8').digest('hex').toUpperCase();
  assert.match(agent,new RegExp(actual));
  assert.match(agent,/CODEX_INSTALLER_HASH_MISMATCH/);
  assert.match(agent,/CODEX_INSTALLER_SYNTAX_INVALID/);
  assert.match(agent,/CODEX_POSTINSTALL_PROOF_INCOMPLETE/);
  assert.match(installer,/OFFICIAL_RELEASE_HASH_MISMATCH/);
  assert.match(installer,/NODE_HASH_MISMATCH/);
  assert.match(installer,/CODEX_NPM_INSTALL_FAILED/);
  assert.doesNotMatch(installer,/Invoke-Expression|\biex\b|Invoke-Command\s+-ComputerName/i);
});

test('Host preflight is bounded and results reveal only tool/version information',()=>{
  for(const name of ['git','python','uv','node','npm','codex']) {
    assert.match(installer,new RegExp(name));
  }
  assert.match(agent,/function Get-EkodiCodexToolchainProof/);
  assert.match(agent,/authorization='interactive_user_login_required'/);
  assert.match(agent,/credentialCollection=\$false/);
  assert.match(api,/summary\.codexToolchainProof =/);
  assert.match(api,/executionContext:'agent_user'/);
  assert.match(admin,/toolchain\.tools\?\.\[name\]/);
  assert.doesNotMatch(installer,/codex\s+login|\$env:OPENAI_API_KEY|\$env:CODEX_API_KEY/);
});

test('Toolchain remains scoped to agent user; no package-manager dependency',()=>{
  assert.match(installer,/LOCALAPPDATA/);
  assert.match(installer,/EKODI\\CodexToolchain/);
  assert.match(installer,/uv python install/);
  assert.match(installer,/nodejs\.org\/dist\/index\.json/);
  assert.match(installer,/git-for-windows\/git/);
  assert.match(installer,/astral-sh\/uv/);
  assert.match(installer,/@openai\/codex/);
  assert.doesNotMatch(installer,/winget\s+install/);
});
