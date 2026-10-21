$ErrorActionPreference = 'Stop'
$env:NO_PROXY = '127.0.0.1,localhost'; $env:no_proxy = '127.0.0.1,localhost'
$src = Get-Content (Join-Path $PSScriptRoot '../../ekodi-device-agent.ps1') -Raw
$t=$null;$e=$null; $ast=[System.Management.Automation.Language.Parser]::ParseInput($src,[ref]$t,[ref]$e)
foreach ($f in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  . ([scriptblock]::Create($f.Extent.Text))
}
$D = $PSScriptRoot; $RepoAgent = Join-Path $PSScriptRoot '../../ekodi-device-agent.ps1'
$Root = Join-Path ([IO.Path]::GetTempPath()) ('ekodi-ias-e2e-' + [guid]::NewGuid().ToString('N')); Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $Root | Out-Null
$AgentVersion = '2.5.7-e2e'
# Load the section's top-level variables exactly as written.
$start = $src.IndexOf('# EKODI-INTERACTIVE-AUTH-001'); $end = $src.IndexOf('function Get-WindowsOptionalFeatureStateSafe', $start)
. ([scriptblock]::Create($src.Substring($start, $end - $start)))
# --- Windows-only seams (test doubles) ---
$script:Consent = $true
function Request-EkodiInteractiveAuthLocalConsent([string]$Label, [int]$TtlMinutes) { return $script:Consent }
$TmpBin = Join-Path $Root 'bin'; New-Item -ItemType Directory $TmpBin -Force | Out-Null; Copy-Item (Join-Path $D 'chrome-wrapper.sh') (Join-Path $TmpBin 'chrome.exe'); & chmod +x (Join-Path $TmpBin 'chrome.exe')
function Resolve-EkodiBrowser { return (Join-Path $TmpBin 'chrome.exe') }
function Get-AgentSettings { return @{ interactiveAuthSession = Get-EkodiInteractiveAuthSettingsProjection } }
function Get-CimInstance {
  $rows = @(& ps -eo pid=,args= | ForEach-Object { $l = $_.Trim(); $i = $l.IndexOf(' '); if ($i -gt 0) { [pscustomobject]@{ ProcessId = [int]$l.Substring(0,$i); CommandLine = $l.Substring($i+1) } } })
  return @($rows | Where-Object { $_.CommandLine -match '^(/usr/bin/env .*)?/tmp/chromium ' } | ForEach-Object { [pscustomobject]@{ Name='chrome.exe'; ProcessId=$_.ProcessId; CommandLine=$_.CommandLine } })
}
function Assert($c, $m) { if (-not $c) { throw "ASSERT FAILED: $m" } else { Write-Host "  ok - $m" } }
$sid = 'ias_0f8fad5b-d9cb-469f-a165-70867728950e'
function NewPayload([string]$exp) { return [pscustomobject]@{ policyId='EKODI-INTERACTIVE-AUTH-001'; sessionId=$sid; service='factchat-mokpo'; expiresAt=$exp; headed=$true; localConsentRequired=$true; credentialRelay=$false; cookieExport=$false; activeUserProfileReuse=$false; hostInputInjection=$false; screenCapture=$false; clipboardShared=$false } }
$exp = (Get-Date).ToUniversalTime().AddMinutes(30).ToString('o')

Write-Host 'Scenario 1: declined local consent opens nothing'
$script:Consent = $false
$r = Start-EkodiInteractiveAuthSession (NewPayload $exp)
Assert ($r.interactiveAuth.status.state -eq 'declined') 'declined state recorded'
Assert (-not (Test-Path (Join-Path $Root 'InteractiveAuth'))) 'no profile directory created'
$x=@(Get-CimInstance); $x | Format-List | Out-Host; Assert ($x.Count -eq 0) "no browser process launched"

Write-Host 'Scenario 2: consent -> login page -> human login -> read-only verify -> close'
$script:Consent = $true
Assert (-not (Test-Path '/no/such')) 'sanity'
$bad = NewPayload $exp; $bad.credentialRelay = $true
try { Start-EkodiInteractiveAuthSession $bad | Out-Null; Assert $false 'contract violation must throw' } catch { Assert ($_.Exception.Message -like '*contract_invalid*') 'payload weakening credential relay is refused' }
$r = Start-EkodiInteractiveAuthSession (NewPayload $exp)
$st = Read-EkodiInteractiveAuthState
Assert ($r.interactiveAuth.status.state -eq 'login_required') "state after launch = $($r.interactiveAuth.status.state)"
Assert ($r.interactiveAuth.cookiesExported -eq $false -and $r.interactiveAuth.credentialsReturned -eq $false) 'receipt invariants asserted'
Assert ($st.port -gt 0) 'CDP port discovered from DevToolsActivePort'
Assert ($r.interactiveAuth.status.currentHost -eq 'mokpo.factchat.bot') 'current host is the provider'
Assert ((Get-Content (Join-Path $st.profileDir 'Default/Preferences') -Raw) -match 'credentials_enable_service":false') 'password manager disabled in temp profile'
$v = Invoke-EkodiInteractiveAuthVerify ([pscustomobject]@{ policyId='EKODI-INTERACTIVE-AUTH-001'; sessionId=$sid; mutation=$false; uploads=$false; creditConsumingActions=$false; cookieRead=$false; storageRead=$false })
Assert ($v.interactiveAuth.verification.authenticated -eq $false) 'before login: verify reports login form, not authenticated'
& node (Join-Path $D 'human.mjs') $st.port
$changed = Reconcile-EkodiInteractiveAuthSession
$st = Read-EkodiInteractiveAuthState
Assert ($st.state -eq 'authenticated' -and $changed) "reconcile detects login (state=$($st.state))"
$v = Invoke-EkodiInteractiveAuthVerify ([pscustomobject]@{ policyId='EKODI-INTERACTIVE-AUTH-001'; sessionId=$sid; mutation=$false; uploads=$false; creditConsumingActions=$false; cookieRead=$false; storageRead=$false })
$ver = $v.interactiveAuth.verification
Assert ($ver.authenticated -eq $true) 'after login: authenticated'
$visible = @($ver.features | Where-Object { $_.menuVisible } | ForEach-Object { $_.id })
Assert ($visible -contains 'meeting-notes' -and $visible -contains 'hwp-editor' -and $visible -contains 'presentation' -and $visible -contains 'usage-credit') ("visible: " + ($visible -join ','))
Assert (-not ($visible -contains 'law-in-data')) 'absent menu reported as not found'
$json = $v | ConvertTo-Json -Depth 10
Assert ($json -notmatch 'auth=1') 'session cookie never appears in receipt'
Assert ($json -notmatch 'kim@mokpo') 'email masked in usage lines'
Assert ($json -notmatch '비밀 회의') 'chat titles never leave the page'
$verifyMut = [pscustomobject]@{ policyId='EKODI-INTERACTIVE-AUTH-001'; sessionId=$sid; mutation=$true; uploads=$false; creditConsumingActions=$false; cookieRead=$false; storageRead=$false }
try { Invoke-EkodiInteractiveAuthVerify $verifyMut | Out-Null; Assert $false 'mutation verify must throw' } catch { Assert ($_.Exception.Message -like '*contract_invalid*') 'mutating verify refused' }
$profileDir = $st.profileDir
$c = Close-EkodiInteractiveAuthSession ([pscustomobject]@{ sessionId = $sid })
Start-Sleep -Milliseconds 500
Assert ($c.interactiveAuth.profileRemoved -eq $true) 'close reports profile removed'
Assert (-not (Test-Path $profileDir)) 'profile directory (cookies) deleted on disk'
Assert (@(Get-CimInstance).Count -eq 0) 'browser process terminated'
Assert ((Get-EkodiInteractiveAuthSettingsProjection).state -eq 'closed') 'last status shows closed for admin'

Write-Host 'Scenario 3: TTL expiry auto-closes and deletes profile'
$r = Start-EkodiInteractiveAuthSession (NewPayload ((Get-Date).ToUniversalTime().AddMinutes(30).ToString('o')))
$st = Read-EkodiInteractiveAuthState; $pd = $st.profileDir
$st.expiresAt = (Get-Date).ToUniversalTime().AddSeconds(-1).ToString('o'); Save-EkodiInteractiveAuthState $st
Assert (Reconcile-EkodiInteractiveAuthSession) 'reconcile reports change on expiry'
Assert ((Get-EkodiInteractiveAuthSettingsProjection).state -eq 'expired') 'state expired'
Assert (-not (Test-Path $pd)) 'expired profile deleted'
Assert (@(Get-CimInstance).Count -eq 0) 'expired browser terminated'

Write-Host 'Scenario 4: user closes the window -> session ends and profile deleted'
$r = Start-EkodiInteractiveAuthSession (NewPayload $exp)
$st = Read-EkodiInteractiveAuthState; $pd = $st.profileDir
foreach ($p in @(Get-CimInstance)) { Stop-Process -Id $p.ProcessId -Force }
Start-Sleep -Milliseconds 800
[void](Reconcile-EkodiInteractiveAuthSession)
Assert ((Get-EkodiInteractiveAuthSettingsProjection).state -eq 'closed') 'closed after user closed window'
Assert (-not (Test-Path $pd)) 'profile deleted after user close'

Write-Host 'Scenario 5: profile path guard rejects traversal'
try { Assert-EkodiInteractiveAuthProfilePath (Join-Path $InteractiveAuthRoot 'Session-../../etc') | Out-Null; Assert $false 'traversal must throw' } catch { Assert ($_.Exception.Message -like '*profile_path_invalid*') 'traversal refused' }
Write-Host 'ALL AGENT E2E SCENARIOS PASSED'
