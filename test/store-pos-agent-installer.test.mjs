import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const install=read('agents/windows-pos/install-pos-agent.ps1');
const uninstall=read('agents/windows-pos/uninstall-pos-agent.ps1');
const diagnose=read('agents/windows-pos/diagnose-pos-targets.ps1');
const readme=read('agents/windows-pos/README.md');

test('POS Agent installer keeps the local control boundary and interactive user session',()=>{
  assert.match(install,/ProgramData\\EKODI\\POSAgent/);
  assert.match(install,/listenerPrefix must remain loopback-only/);
  assert.match(install,/allowedOrigins must include https:\/\/ekodi\.kr/);
  assert.match(install,/New-ScheduledTaskTrigger -AtLogOn -User \$userName/);
  assert.match(install,/New-ScheduledTaskPrincipal -UserId \$userName -LogonType Interactive -RunLevel Highest/);
  assert.doesNotMatch(install,/ServiceAccount|UserId 'SYSTEM'|Invoke-Expression|\biex\b/i);
  assert.doesNotMatch(install,/Invoke-WebRequest|Start-BitsTransfer|curl\.exe/i);
  assert.doesNotMatch(install,/https:\/\/(?!ekodi\.kr)/i);
});

test('POS Agent upgrade preserves local target configuration and rolls back the agent file on failure',()=>{
  assert.match(install,/if \(-not \(Test-Path -LiteralPath \$targetConfig\)\)/);
  assert.match(install,/Copy-Item -LiteralPath \$targetAgent -Destination \$backupAgent -Force/);
  assert.match(install,/Move-Item -LiteralPath \$candidateAgent -Destination \$targetAgent -Force/);
  assert.match(install,/if \(Test-Path -LiteralPath \$backupAgent\)/);
  assert.match(install,/Copy-Item -LiteralPath \$backupAgent -Destination \$targetAgent -Force/);
  assert.match(install,/loopback health endpoint did not become ready/);
});

test('POS target diagnostics are read-only and uninstall supports config preservation',()=>{
  assert.match(diagnose,/Get-Process/);
  assert.match(diagnose,/No process is started, stopped, or focused/);
  assert.doesNotMatch(diagnose,/Start-Process|Stop-Process|SetForegroundWindow|AppActivate/);
  assert.match(uninstall,/Unregister-ScheduledTask/);
  assert.match(uninstall,/\[switch\]\$KeepConfig/);
  assert.match(uninstall,/Configuration preserved/);
});

test('POS Agent README documents install, diagnostics, upgrade and explicit-user focus safety',()=>{
  for(const phrase of ['install-pos-agent.ps1','diagnose-pos-targets.ps1','uninstall-pos-agent.ps1','기존 설정은 유지','자동실행 금지','사용자가 직접']) assert.match(readme,new RegExp(phrase));
});
