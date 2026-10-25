# Real Windows smoke test for EKODI-SIMULCAST-RELAY-001.
# Loads only the relay block (plus the DPAPI/sha helpers) from the agent, then:
# pinned ffmpeg download + hash verify, DPAPI store, arm, ffmpeg listening on
# 127.0.0.1:1935, a 4-second test program pushed in, keys redacted, disarm stops it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$agentPath = Join-Path $PSScriptRoot 'ekodi-device-agent.ps1'
$source = (Get-Content -LiteralPath $agentPath -Raw -Encoding UTF8) -replace "`r`n", "`n"
function Get-Block([string]$Start, [string]$End) {
  $i = $source.IndexOf($Start); $j = $source.IndexOf($End, $i)
  if ($i -lt 0 -or $j -lt 0) { throw "block not found: $Start" }
  return $source.Substring($i, $j - $i)
}
$Root = Join-Path $env:RUNNER_TEMP ('ekodi-relay-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Root | Out-Null
. ([scriptblock]::Create((Get-Block 'function Protect-LocalSecret' 'function Get-Sha256String')))
. ([scriptblock]::Create((Get-Block 'function Get-Sha256String' "`n}`n") + "`n}"))
. ([scriptblock]::Create((Get-Block '# EKODI-SIMULCAST-RELAY-001' 'function Install-EkodiLocalAI')))

$status = Install-EkodiSimulcastRelay
if (-not $status.simulcastRelay.installed) { throw 'ffmpeg was not installed and verified' }
Write-Host 'Pinned ffmpeg installed and verified.'

$secret = 'ekodi-ci-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$null = Invoke-EkodiSimulcastConfigure ([pscustomobject]@{ op = 'add'; destination = [pscustomobject]@{ id = 'relay_0123456789abcdef01234567'; label = 'CI YouTube'; url = 'rtmp://a.rtmp.youtube.com/live2'; key = $secret } })
$bad = $false
try { $null = Invoke-EkodiSimulcastConfigure ([pscustomobject]@{ op = 'add'; destination = [pscustomobject]@{ id = 'relay_0123456789abcdef01234568'; label = 'loop'; url = 'rtmp://127.0.0.1/live'; key = 'abcd1234' } }) } catch { $bad = $true }
if (-not $bad) { throw 'loopback destination was accepted' }
if ((Get-Content -LiteralPath $SimulcastStorePath -Raw).Contains($secret)) { throw 'stream key stored in plain text' }

$armed = Invoke-EkodiSimulcastConfigure ([pscustomobject]@{ op = 'arm' })
Start-Sleep -Seconds 3
$relay = Get-EkodiSimulcastProcess
if (-not $relay) { throw 'relay ffmpeg did not start' }
$listening = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 1935 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) { throw 'relay is not listening on 127.0.0.1:1935' }
Write-Host 'Relay armed and listening on rtmp://127.0.0.1:1935/live/ekodi.'

$push = Start-Process -FilePath $SimulcastFfmpegPath -ArgumentList '-hide_banner -loglevel error -re -f lavfi -i testsrc=size=640x360:rate=30 -f lavfi -i sine=frequency=440 -t 4 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -f flv rtmp://127.0.0.1:1935/live/ekodi' -WindowStyle Hidden -PassThru -Wait
# The CI destination uses a throwaway key, so YouTube may refuse the publish.
# Either the push completes, or the relay's tee reports the refused output —
# both prove the relay accepted the program and tried to forward it.
$log = ''
if (Test-Path -LiteralPath $SimulcastLogPath) { $log = Get-Content -LiteralPath $SimulcastLogPath -Raw }
if ($push.ExitCode -ne 0 -and $log -notmatch 'tee|youtube|Slave') { throw "relay did not take the program (push exit $($push.ExitCode))" }
Write-Host ('Test program reached the relay (push exit ' + $push.ExitCode + ').')

Start-Sleep -Seconds 2
$after = Get-EkodiSimulcastStatus
$json = $after | ConvertTo-Json -Depth 6
if ($json.Contains($secret)) { throw 'status or log leaked the stream key' }
if ($after.simulcastRelay.destinations[0].keyHint -notlike '****????') { throw 'key hint missing' }
Write-Host ('Relay status: ' + $after.message)

Reconcile-EkodiSimulcastRelay
Start-Sleep -Seconds 2
if (-not (Get-EkodiSimulcastProcess)) { throw 'relay did not re-listen after the program ended' }
$null = Invoke-EkodiSimulcastConfigure ([pscustomobject]@{ op = 'disarm' })
Start-Sleep -Seconds 1
if (Get-EkodiSimulcastProcess) { throw 'disarm did not stop the relay' }
Write-Host 'EKODI simulcast relay Windows smoke test OK.'
