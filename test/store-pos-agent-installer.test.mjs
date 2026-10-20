import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const setup=read('agents/windows-pos/setup-pos-agent.cmd');
const compatSetup=read('agents/windows-pos/setup-pos-agent-compat.cmd');
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
  assert.match(setup,/EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v5/);
  assert.match(setup,/Refreshing Task Scheduler compatibility package/);
  assert.match(setup,/\?v=/);
  assert.match(setup,/outdated Task Scheduler installer/);
  assert.match(setup,/Language\.Parser.*ParseFile/);
  assert.match(setup,/Downloaded installer syntax check failed/);
  assert.match(setup,/explicit_user_action_only/);
  assert.doesNotMatch(setup,/Invoke-Expression|\biex\b/i);
  assert.doesNotMatch(setup,/raw\.githubusercontent\.com|github\.com\/topmaster-joseph/i);
});

test('compatibility setup bypasses Task Scheduler and requires the v6 installer contract',()=>{
  assert.match(compatSetup,/Compatibility setup: Windows Task Scheduler will be bypassed/);
  assert.match(compatSetup,/setup-pos-agent-compat/);
  assert.match(compatSetup,/EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v6/);
  assert.match(compatSetup,/-ForceStartupFallback/);
  assert.match(compatSetup,/cmpmyi\/admin\/agent\/download/);
  assert.doesNotMatch(compatSetup,/Register-ScheduledTask|RestartInterval/);
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
  assert.doesNotMatch(install,/RestartInterval \(New-TimeSpan -(?:Seconds|Minutes)/);
  assert.doesNotMatch(install,/ExecutionTimeLimit/);
  assert.match(install,/EKODI_POS_INSTALLER_COMPAT=task-scheduler-0x80041318-v6/);
  assert.match(install,/\[switch\]\$ForceStartupFallback/);
  assert.match(install,/Compatibility install requested: bypassing Task Scheduler/);
  assert.match(install,/startup-folder-forced/);
  assert.match(install,/0x80041318/);
  assert.match(install,/FullyQualifiedErrorId/);
  assert.match(install,/Test-TaskSchemaRangeError/);
  assert.match(install,/Register-EkodiScheduledTask/);
  assert.match(install,/return 'default-settings'/);
  assert.match(install,/return 'minimal-settings'/);
  assert.match(install,/return 'interactive-default-runlevel'/);
  assert.match(install,/Register-EkodiStartupFallback/);
  assert.match(install,/return \$launcher/);
  assert.match(install,/startup-folder/);
  assert.match(install,/EKODI-POS-Agent-Startup\.cmd/);
  assert.match(install,/netsh\.exe http add urlacl/);
  assert.match(install,/Start-Process -FilePath 'powershell\.exe'/);
  assert.match(install,/retrying with an explicit minimal settings profile/);
  assert.match(install,/retrying without RunLevel Highest for compatibility/);
  assert.match(install,/New-ScheduledTaskSettingsSet -StartWhenAvailable/);
  assert.match(install,/Get-ScheduledTask -TaskName \$TaskName -ErrorAction Stop/);
  assert.match(install,/Task Scheduler compatibility:/);
  assert.match(install,/Register-ScheduledTask -TaskName \$Name -Action \$Action -Trigger \$Trigger -Principal \$Principal -Force/);
  assert.match(install,/New-ScheduledTaskPrincipal -UserId \$identity\.Name -LogonType Interactive/);
  assert.match(install,/Unregister-ScheduledTask -TaskName \$TaskName -Confirm:\$false/);
});

test('POS Agent installer source is structurally single-copy after compatibility repair',()=>{
  assert.equal((install.match(/^param\(/gm)||[]).length,1);
  assert.equal((install.match(/function Read-AgentConfig/g)||[]).length,1);
  assert.equal((install.match(/function Register-EkodiScheduledTask/g)||[]).length,1);
  assert.equal((install.match(/if \(-not \(Test-IsAdministrator\)\)/g)||[]).length,1);
  assert.match(install,/\$prefix -notmatch '\^http:\/\/\(127\\\.0\\\.0\\\.1\|localhost\):\\d\+\/\$'/);
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

const enroll=read('agents/windows-pos/enroll-pos-agent.ps1');
const enrollCmd=read('agents/windows-pos/enroll-pos-agent.cmd');
const agentSource=read('agents/windows-pos/EKODI-POS-Agent.ps1');
const exampleConfig=JSON.parse(read('agents/windows-pos/pos-agent.config.example.json'));

test('POS Agent central heartbeat is opt-in, outbound-only, fixed to ekodi.kr and never runs remote commands',()=>{
  assert.deepEqual(exampleConfig.centralHeartbeat,{enabled:false,apiBase:'https://ekodi.kr',intervalSeconds:60});
  assert.match(agentSource,/\$CentralApiBase = 'https:\/\/ekodi\.kr'/);
  assert.match(agentSource,/blocked_api_base/);
  assert.match(agentSource,/\/api\/device-agent\/heartbeat/);
  assert.doesNotMatch(agentSource,/commands\/next|\/result|device-agent\/enroll/);
  assert.match(agentSource,/remoteCommands = \$false/);
  assert.match(agentSource,/revoked_or_unauthorized/);
  assert.match(agentSource,/if \(\$code -eq 401\)/);
  const beat=agentSource.slice(agentSource.indexOf('function Send-CentralHeartbeatIfDue'),agentSource.indexOf('function Focus-TargetProcess'));
  assert.ok(beat.length>200);
  assert.doesNotMatch(beat,/windowTitle =/);
  assert.doesNotMatch(beat,/Focus-TargetProcess|Start-Process/);
  assert.match(agentSource,/BeginGetContext/);
  assert.match(agentSource,/AsyncWaitHandle\.WaitOne\(1000\)/);
});

test('POS Agent string arrays are wrapped so StrictMode never breaks health on empty target lists',()=>{
  const calls=agentSource.match(/= .*As-StringArray \(/g)||[];
  assert.ok(calls.length>=6);
  assert.ok(calls.every(line=>line.includes('@(As-StringArray')),calls.join('\n'));
  assert.match(agentSource,/\$AgentVersion = '0\.2\.0'/);
  assert.match(agentSource,/deviceName = \$deviceName/);
  assert.match(agentSource,/launchable = \[bool\]\(Target-IsLaunchable \$Target\)/);
});

test('POS enrollment reuses the device registry, requires POS type and protects the credential',()=>{
  assert.match(enroll,/\$ApiBase = 'https:\/\/ekodi\.kr'/);
  assert.match(enroll,/\/api\/device-agent\/enroll/);
  assert.match(enroll,/deviceType -ne 'pos'/);
  assert.match(enroll,/Nothing was saved/);
  assert.match(enroll,/icacls\.exe \$CredentialPath \/inheritance:r/);
  assert.match(enroll,/\[switch\]\$Disable/);
  assert.match(enroll,/never polls or executes remote commands/);
  assert.doesNotMatch(enroll,/Write-Host[^\n]*\$token|Invoke-Expression|\biex\b|commands\/next/i);
  assert.doesNotMatch(enroll,/https:\/\/(?!ekodi\.kr)/i);
  assert.match(enrollCmd,/https:\/\/ekodi\.kr\/cmpmyi\/admin\/agent\/download\/enroll-pos-agent\.ps1/);
  assert.match(enrollCmd,/never polls or executes remote commands/);
  assert.match(enrollCmd,/ParseFile/);
  assert.match(enrollCmd,/-Verb RunAs/);
  assert.doesNotMatch(enrollCmd,/Invoke-Expression|\biex\b|raw\.githubusercontent/i);
});

test('POS diagnostics suggestions stay read-only candidates',()=>{
  assert.match(diagnose,/\[switch\]\$Suggest/);
  assert.match(diagnose,/confirmed = \$false/);
  assert.match(diagnose,/nothing was written/);
  assert.doesNotMatch(diagnose,/Set-Content|Out-File|Start-Process|Stop-Process|SetForegroundWindow|AppActivate/);
});
