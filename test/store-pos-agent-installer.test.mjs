import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const setup=read('agents/windows-pos/setup-pos-agent.cmd');
const install=read('agents/windows-pos/install-pos-agent.ps1');
const uninstall=read('agents/windows-pos/uninstall-pos-agent.ps1');
const diagnose=read('agents/windows-pos/diagnose-pos-targets.ps1');
const start=read('agents/windows-pos/start-pos-agent.cmd');
const stop=read('agents/windows-pos/stop-pos-agent.cmd');
const remove=read('agents/windows-pos/remove-pos-agent.cmd');
const readme=read('agents/windows-pos/README.md');

test('one-click POS Agent setup is fixed to the official package and elevates explicitly',()=>{
  assert.match(setup,/https:\/\/ekodi\.kr\/cmpmyi\/admin\/agent\/download/);
  for(const name of ['install-pos-agent.ps1','EKODI-POS-Agent.ps1','pos-agent.config.example.json','diagnose-pos-targets.ps1','start-pos-agent.cmd','stop-pos-agent.cmd','uninstall-pos-agent.ps1']) assert.match(setup,new RegExp(name.replaceAll('.','\\.')));
  assert.match(setup,/Start-Process -FilePath '%ComSpec%'.*-Verb RunAs/);
  assert.match(setup,/listenerPrefix must remain loopback-only/);
  assert.match(setup,/EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v3/);
  assert.match(setup,/Refreshing Task Scheduler compatibility package/);
  assert.match(setup,/\?v=/);
  assert.match(setup,/outdated Task Scheduler installer/);
  assert.match(setup,/Language\.Parser.*ParseFile/);
  assert.match(setup,/Downloaded installer syntax check failed/);
  assert.match(setup,/explicit_user_action_only/);
  assert.doesNotMatch(setup,/Invoke-Expression|\biex\b/i);
  assert.doesNotMatch(setup,/raw\.githubusercontent\.com|github\.com\/topmaster-joseph/i);
});

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

test('POS Agent scheduled task registration degrades safely across Task Scheduler XML variants',()=>{
  assert.match(install,/RestartInterval \(New-TimeSpan -Minutes 1\)/);
  assert.doesNotMatch(install,/RestartInterval \(New-TimeSpan -Seconds 20\)/);
  assert.match(install,/EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v3/);
  assert.match(install,/0x80041318/);
  assert.match(install,/FullyQualifiedErrorId/);
  assert.match(install,/Test-TaskSchemaRangeError/);
  assert.match(install,/Register-EkodiScheduledTask/);
  assert.match(install,/mode = 'restart-1m'/);
  assert.match(install,/mode = 'compat-no-restart'/);
  assert.match(install,/mode = 'legacy-default-settings'/);
  assert.match(install,/retrying with a simpler compatibility profile/);
  assert.match(install,/Get-ScheduledTask -TaskName \$TaskName -ErrorAction Stop/);
  assert.match(install,/Task Scheduler compatibility:/);
  assert.match(install,/New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(install,/Register-ScheduledTask -TaskName \$Name -Action \$Action -Trigger \$Trigger -Principal \$Principal -Force/);
});


test('POS Agent installer source is structurally single-copy after compatibility repair',()=>{
  assert.equal((install.match(/^param\(/gm)||[]).length,1);
  assert.equal((install.match(/function Read-AgentConfig/g)||[]).length,1);
  assert.equal((install.match(/function Register-EkodiScheduledTask/g)||[]).length,1);
  assert.equal((install.match(/if \(-not \(Test-IsAdministrator\)\)/g)||[]).length,1);
  assert.match(install,/\$prefix -notmatch '\^http:\/\/\(127\\\.0\\\.0\\\.1\|localhost\):\\d\+\/\ and rolls back the agent file on failure',()=>{
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


test('one-click POS Agent removal is fixed to the official uninstall script and asks before deleting',()=>{
  assert.match(remove,/choice \/C YN/);
  assert.match(remove,/https:\/\/ekodi\.kr\/cmpmyi\/admin\/agent\/download\/uninstall-pos-agent\.ps1/);
  assert.match(remove,/Start-Process -FilePath '%ComSpec%'.*-Verb RunAs/);
  assert.match(remove,/EKODI POS Agent removed/);
  assert.doesNotMatch(remove,/Invoke-Expression|\biex\b/i);
});

test('POS Agent start and stop helpers only control the fixed scheduled task',()=>{
  assert.match(start,/Start-ScheduledTask -TaskName 'EKODI POS Agent'/);
  assert.match(start,/127\.0\.0\.1:17831\/v1\/health/);
  assert.match(stop,/Stop-ScheduledTask -TaskName 'EKODI POS Agent'/);
  assert.match(stop,/Automatic start at the next Windows logon remains enabled/);
  assert.doesNotMatch(start+stop,/Invoke-Expression|\biex\b|Invoke-WebRequest|Start-BitsTransfer|curl\.exe/i);
  assert.doesNotMatch(start+stop,/Unregister-ScheduledTask|Disable-ScheduledTask|Remove-Item/i);
});

test('POS Agent README documents install, diagnostics, upgrade and explicit-user focus safety',()=>{
  for(const phrase of ['setup-pos-agent.cmd','remove-pos-agent.cmd','install-pos-agent.ps1','start-pos-agent.cmd','stop-pos-agent.cmd','diagnose-pos-targets.ps1','uninstall-pos-agent.ps1','cmpmyi/admin/agent','기존 설정은 유지','자동실행 금지','사용자가 직접','다음 Windows 로그인 시 자동 시작 설정은 유지']) assert.match(readme,new RegExp(phrase));
});
/);
  assert.doesNotMatch(install,/return \$cfg\s*}\s*function Test-TaskSchemaRangeError[\s\S]*return \$cfg\s*}/);
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


test('one-click POS Agent removal is fixed to the official uninstall script and asks before deleting',()=>{
  assert.match(remove,/choice \/C YN/);
  assert.match(remove,/https:\/\/ekodi\.kr\/cmpmyi\/admin\/agent\/download\/uninstall-pos-agent\.ps1/);
  assert.match(remove,/Start-Process -FilePath '%ComSpec%'.*-Verb RunAs/);
  assert.match(remove,/EKODI POS Agent removed/);
  assert.doesNotMatch(remove,/Invoke-Expression|\biex\b/i);
});

test('POS Agent start and stop helpers only control the fixed scheduled task',()=>{
  assert.match(start,/Start-ScheduledTask -TaskName 'EKODI POS Agent'/);
  assert.match(start,/127\.0\.0\.1:17831\/v1\/health/);
  assert.match(stop,/Stop-ScheduledTask -TaskName 'EKODI POS Agent'/);
  assert.match(stop,/Automatic start at the next Windows logon remains enabled/);
  assert.doesNotMatch(start+stop,/Invoke-Expression|\biex\b|Invoke-WebRequest|Start-BitsTransfer|curl\.exe/i);
  assert.doesNotMatch(start+stop,/Unregister-ScheduledTask|Disable-ScheduledTask|Remove-Item/i);
});

test('POS Agent README documents install, diagnostics, upgrade and explicit-user focus safety',()=>{
  for(const phrase of ['setup-pos-agent.cmd','remove-pos-agent.cmd','install-pos-agent.ps1','start-pos-agent.cmd','stop-pos-agent.cmd','diagnose-pos-targets.ps1','uninstall-pos-agent.ps1','cmpmyi/admin/agent','기존 설정은 유지','자동실행 금지','사용자가 직접','다음 Windows 로그인 시 자동 시작 설정은 유지']) assert.match(readme,new RegExp(phrase));
});
