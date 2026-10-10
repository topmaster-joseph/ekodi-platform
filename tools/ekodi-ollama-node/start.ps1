param(
  [ValidateSet('enroll','doctor','once','run')]
  [string]$Mode = 'doctor'
)
$ErrorActionPreference = 'Stop'
$Client = Join-Path $PSScriptRoot 'node.mjs'
$DataRoot = Join-Path $env:APPDATA 'EKODI\ollama-node'
$ConfigFile = Join-Path $DataRoot 'config.json'
$SecretFile = Join-Path $DataRoot 'node-token.dpapi'
if (!(Test-Path $Client)) { throw 'Local node script missing.' }
if ($Mode -eq 'enroll') {
  New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
  if (Test-Path $ConfigFile) { $existing = Get-Content $ConfigFile -Raw | ConvertFrom-Json }
  $computer = ([Environment]::MachineName -replace '[^a-zA-Z0-9-]','-').ToLower()
  if (!$computer) { $computer = 'windows' }
  $nodeId = if ($existing.nodeId) { [string]$existing.nodeId } else { 'ollama-' + $computer.Substring(0,[Math]::Min($computer.Length,30)) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) }
  $pair = Read-Host 'EKODI AI Control one-time pairing code'
  if ($pair -notmatch '^[A-HJ-NP-Z2-9]{10}$') { throw 'Invalid pairing code format.' }
  $result = Invoke-RestMethod -Uri 'https://ekodi.kr/ai/api/node/enroll' -Method Post -ContentType 'application/json' -Body (@{code=$pair;nodeId=$nodeId;name=$nodeId;providers=@('ollama-local')}|ConvertTo-Json) -TimeoutSec 20
  if (!$result.ok -or !$result.nodeToken) {throw 'Enrollment response invalid.'}
  $secured=ConvertTo-SecureString -String ([string]$result.nodeToken) -AsPlainText -Force
  $secured | ConvertFrom-SecureString | Set-Content -Path $SecretFile -Encoding UTF8
  @{nodeId=$nodeId;provider='ollama-local';endpoint='https://ekodi.kr/ai'}|ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
  Write-Output ('Paired: '+$nodeId+'. Token protected with Windows DPAPI.')
  exit 0
}
if ($Mode -eq 'doctor') {
  & node $Client doctor
  exit $LASTEXITCODE
}
if (!(Test-Path $ConfigFile) -or !(Test-Path $SecretFile)) {
  throw 'Not paired. Run: .\start.ps1 -Mode enroll (requires a fresh administrator pairing code).'
}
$config=Get-Content $ConfigFile -Raw | ConvertFrom-Json
$protected=Get-Content $SecretFile -Raw | ConvertTo-SecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected)
try { $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$enclosure=Get-CimInstance -ClassName Win32_SystemEnclosure -ErrorAction SilentlyContinue
$desktop=$false
if ($enclosure) {
  $desktop=@($enclosure.ChassisTypes | Where-Object {$_ -in @(3,4,5,6,7,15,16)}).Count -gt 0
}
$env:EKODI_NODE_ID=[string]$config.nodeId
$env:EKODI_NODE_TOKEN=$token
$env:EKODI_NODE_DESKTOP=if($desktop){'true'}else{'false'}
$env:EKODI_NODE_ENABLED='true'
try { & node $Client $Mode; exit $LASTEXITCODE }
finally { $env:EKODI_NODE_TOKEN=''; $token=$null }
