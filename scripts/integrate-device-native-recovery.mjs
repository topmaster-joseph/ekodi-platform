import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch produced no change`);
  fs.writeFileSync(path, after);
}

patch('device-control.js', source => {
  const anchor = "  'agent.self_update': { risk: 'maintain', confirm: true },";
  if (!source.includes(anchor)) throw new Error('device-control command policy anchor missing');
  if (source.includes("'remote_desktop.recovery.enable'")) return source;
  return source.replace(anchor, `${anchor}\n  'remote_desktop.recovery.enable': { risk: 'maintain', confirm: true },\n  'remote_desktop.recovery.disable': { risk: 'maintain', confirm: true },\n  'remote_desktop.recovery.run': { risk: 'maintain', confirm: true },`);
});

patch('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', source => {
  if (source.includes('function Get-RemoteDesktopRecoveryConfig')) return source;
  const functionAnchor = 'function Load-Config {';
  if (!source.includes(functionAnchor)) throw new Error('agent function anchor missing');
  const helpers = String.raw`
+$script:DesktopRecoveryStatePath = Join-Path $PSScriptRoot 'managed-apps.json'
+$script:LastDesktopRecoveryAttempt = [datetime]::MinValue
+
+function Get-RemoteDesktopRecoveryConfig {
+  if (!(Test-Path $script:DesktopRecoveryStatePath)) { return @{ enabled = $false } }
+  try {
+    $value = Get-Content $script:DesktopRecoveryStatePath -Raw | ConvertFrom-Json
+    return @{ enabled = [bool]$value.desktopCommanderAutoRecovery }
+  } catch { return @{ enabled = $false } }
+}
+
+function Set-RemoteDesktopRecoveryConfig([bool]$Enabled) {
+  @{ desktopCommanderAutoRecovery = $Enabled; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } |
+    ConvertTo-Json | Set-Content -Path $script:DesktopRecoveryStatePath -Encoding UTF8
+  return Get-RemoteDesktopRecoveryConfig
+}
+
+function Resolve-DesktopCommanderExecutable {
+  $running = Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1
+  if ($running -and $running.Path) { return $running.Path }
+  $candidates = @(
+    "$env:LOCALAPPDATA\Programs\Desktop Commander\DesktopCommander.exe",
+    "$env:LOCALAPPDATA\Programs\DesktopCommander\DesktopCommander.exe",
+    "$env:ProgramFiles\Desktop Commander\DesktopCommander.exe",
+    "$env:ProgramFiles(x86)\Desktop Commander\DesktopCommander.exe"
+  )
+  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
+}
+
+function Ensure-DesktopCommanderRunning([bool]$Force = $false) {
+  $running = Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1
+  if ($running) { return @{ message = 'Remote Desktop Commander가 실행 중입니다.'; running = $true; recovered = $false } }
+  if (!$Force -and ((Get-Date) - $script:LastDesktopRecoveryAttempt).TotalSeconds -lt 120) {
+    return @{ message = 'Remote Desktop Commander 복구 재시도 대기 중입니다.'; running = $false; recovered = $false }
+  }
+  $script:LastDesktopRecoveryAttempt = Get-Date
+  $exe = Resolve-DesktopCommanderExecutable
+  if (!$exe) { return @{ message = 'Remote Desktop Commander 실행파일을 찾지 못했습니다.'; running = $false; recovered = $false } }
+  Start-Process -FilePath $exe | Out-Null
+  Start-Sleep -Milliseconds 700
+  $started = [bool](Get-Process -Name 'DesktopCommander' -ErrorAction SilentlyContinue | Select-Object -First 1)
+  return @{ message = $(if ($started) { 'Remote Desktop Commander를 자동 복구했습니다.' } else { 'Remote Desktop Commander 실행을 요청했지만 프로세스를 확인하지 못했습니다.' }); running = $started; recovered = $started }
+}
+
+function Set-DesktopCommanderRecovery([bool]$Enabled) {
+  $config = Set-RemoteDesktopRecoveryConfig $Enabled
+  if ($Enabled) {
+    $result = Ensure-DesktopCommanderRunning $true
+    return @{ message = "Remote Desktop Commander 자가복구를 활성화했습니다. $($result.message)"; enabled = $true; running = $result.running }
+  }
+  return @{ message = 'Remote Desktop Commander 자가복구를 비활성화했습니다.'; enabled = $false }
+}
+
+function Reconcile-DesktopCommanderRecovery {
+  $config = Get-RemoteDesktopRecoveryConfig
+  if ($config.enabled) { Ensure-DesktopCommanderRunning | Out-Null }
+}
+
+`;
  source = source.replace(functionAnchor, `${helpers}${functionAnchor}`);
  const commandAnchor = "    'agent.self_update' { return Update-AgentFromOfficialSource }";
  if (!source.includes(commandAnchor)) throw new Error('agent command anchor missing');
  source = source.replace(commandAnchor, `${commandAnchor}\n    'remote_desktop.recovery.enable' { return Set-DesktopCommanderRecovery $true }\n    'remote_desktop.recovery.disable' { return Set-DesktopCommanderRecovery $false }\n    'remote_desktop.recovery.run' { return Ensure-DesktopCommanderRunning $true }`);
  const loopAnchor = '        Poll-Command $config';
  if (!source.includes(loopAnchor)) throw new Error('agent loop anchor missing');
  source = source.replace(loopAnchor, `        Reconcile-DesktopCommanderRecovery\n${loopAnchor}`);
  return source.replace(/^\+/gm, '');
});

patch('remote-power-admin.js', source => {
  if (source.includes('data-rp-recovery')) return source;
  source = source.replace("const state = { loading:false, relayConfigured:false, devices:[], message:'' };", "const state = { loading:false, relayConfigured:false, devices:[], agents:[], message:'' };");
  const gridAnchor = "</article>`).join(''):'<div class=\"remote-power-empty\">등록된 원격 PC 정보를 불러오는 중입니다.</div>'}</div>`;";
  if (!source.includes(gridAnchor)) throw new Error('remote power render anchor missing');
  source = source.replace(gridAnchor, `</article>\`).join(''):'<div class="remote-power-empty">등록된 원격 PC 정보를 불러오는 중입니다.</div>'}</div>\n      <div class="remote-power-subhead"><strong>Remote Desktop 자가복구</strong><small>EKODI Device Agent가 허용된 복구 명령만 실행합니다.</small></div>\n      <div class="remote-power-grid">${'${'}state.agents.length?state.agents.map(device=>\`\n        <article class="remote-power-device">\n          <div><strong>${'${'}esc(device.label||device.hostname||device.id)}</strong><span class="remote-power-status" data-status="${'${'}esc(device.status||'unknown')}">${'${'}esc(statusLabel(device.status))}</span></div>\n          <small>${'${'}esc(device.id)}</small>\n          <div class="remote-power-actions"><button type="button" data-rp-recovery="enable" data-rp-device="${'${'}esc(device.id)}" ${'${'}state.loading?'disabled':''}>자가복구 켜기</button><button type="button" data-rp-recovery="run" data-rp-device="${'${'}esc(device.id)}" ${'${'}state.loading?'disabled':''}>지금 복구</button><button type="button" data-rp-recovery="disable" data-rp-device="${'${'}esc(device.id)}" ${'${'}state.loading?'disabled':''}>끄기</button></div>\n        </article>\`).join(''):'<div class="remote-power-empty">EKODI Device Agent에 등록된 PC가 없습니다.</div>'}</div>\`;`);
  const listenerAnchor = "card.querySelectorAll('[data-rp-wake]').forEach(button=>button.addEventListener('click',()=>wake(button.dataset.rpWake)));";
  if (!source.includes(listenerAnchor)) throw new Error('remote power listener anchor missing');
  source = source.replace(listenerAnchor, `${listenerAnchor}\n    card.querySelectorAll('[data-rp-recovery]').forEach(button=>button.addEventListener('click',()=>recovery(button.dataset.rpDevice,button.dataset.rpRecovery)));`);
  const loadAnchor = "state.devices=Array.isArray(payload.devices)?payload.devices:[];";
  if (!source.includes(loadAnchor)) throw new Error('remote power load anchor missing');
  source = source.replace(loadAnchor, `${loadAnchor}\n      const agentResponse=await fetch(\`${'${'}API}/api/control/devices\`,{headers:headers(),cache:'no-store'});\n      const agentPayload=await agentResponse.json().catch(()=>({}));\n      state.agents=agentResponse.ok&&Array.isArray(agentPayload.devices)?agentPayload.devices.filter(device=>device.deviceType==='pc'||device.platform==='windows'):[];`);
  const exportAnchor = '  window.EKODIRemotePowerAdmin={load,wake};';
  if (!source.includes(exportAnchor)) throw new Error('remote power export anchor missing');
  const recoveryFn = `\n  async function recovery(deviceId,action){\n    if(!deviceId||state.loading)return;\n    const type=\`remote_desktop.recovery.${'${'}action}\`;\n    state.loading=true; state.message=\`${'${'}deviceId} 원격 에이전트 복구 설정을 적용하고 있습니다.\`; render();\n    try{\n      const response=await fetch(\`${'${'}API}/api/control/devices/${'${'}encodeURIComponent(deviceId)}/commands\`,{method:'POST',headers:headers(true),body:JSON.stringify({type,confirmed:true})});\n      const payload=await response.json().catch(()=>({}));\n      if(!response.ok)throw new Error(payload.error||\`HTTP ${'${'}response.status}\`);\n      state.message=action==='enable'?'자가복구 활성화 명령을 전달했습니다.':action==='disable'?'자가복구 비활성화 명령을 전달했습니다.':'즉시 복구 명령을 전달했습니다.';\n    }catch(error){ state.message=\`자가복구 명령 실패: ${'${'}error.message}\`; }\n    finally{ state.loading=false; render(); }\n  }\n`;
  source = source.replace(exportAnchor, `${recoveryFn}\n  window.EKODIRemotePowerAdmin={load,wake,recovery};`);
  return source;
});

patch('remote-power-admin.css', source => {
  if (source.includes('.remote-power-actions')) return source;
  return `${source}\n.remote-power-subhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(148,163,184,.16)}.remote-power-subhead strong{font-size:13px}.remote-power-subhead small{font-size:10px;opacity:.6}.remote-power-actions{display:flex!important;justify-content:flex-start!important;gap:6px!important;flex-wrap:wrap}.remote-power-actions button{padding:6px 8px;font-size:10px}@media(max-width:760px){.remote-power-subhead{align-items:flex-start;flex-direction:column}}\n`;
});

console.log('Native Remote Desktop recovery integrated.');
