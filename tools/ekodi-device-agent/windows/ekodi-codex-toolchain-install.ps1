# Reviewed, fixed-purpose installer for the EKODI Windows Device Agent.
# No cloud-supplied command, URL, path, credential, or shell expression is executed.
[CmdletBinding()]
param([string]$ReceiptPath)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12

if (-not [Environment]::Is64BitOperatingSystem) { throw 'EKODI_CODEX_X64_REQUIRED' }
if (-not $env:LOCALAPPDATA) { throw 'EKODI_CODEX_USER_CONTEXT_REQUIRED' }
if (-not $ReceiptPath -or -not [IO.Path]::GetFullPath($ReceiptPath).StartsWith([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
  throw 'EKODI_CODEX_RECEIPT_PATH_REJECTED'
}

$root=Join-Path $env:LOCALAPPDATA 'EKODI\CodexToolchain'
$bin=Join-Path $root 'bin'
$work=Join-Path $root 'staging'
New-Item -ItemType Directory -Path $bin,$work -Force | Out-Null
$lock=New-Object Threading.Mutex($false,'Local\EKODI_CodexToolchain_Install')
$acquired=$false
$actions=New-Object 'System.Collections.Generic.List[string]'

function Use-Path([string]$directory) {
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { return }
  if (-not @($env:Path -split ';' | Where-Object { $_.TrimEnd('\') -ieq $directory.TrimEnd('\') }).Count) {
    $env:Path=$directory+';'+$env:Path
  }
  # Do not alter a system-service account's or another user's PATH.
  if ([Security.Principal.WindowsIdentity]::GetCurrent().IsSystem) { return }
  $user=[Environment]::GetEnvironmentVariable('Path','User')
  if (-not @($user -split ';' | Where-Object { $_.TrimEnd('\') -ieq $directory.TrimEnd('\') }).Count) {
    [Environment]::SetEnvironmentVariable('Path',(($user,$directory | Where-Object { $_ }) -join ';'),'User')
  }
}
function Get-Exe([string]$name,[string[]]$locations) {
  foreach($p in $locations){if($p -and (Test-Path -LiteralPath $p -PathType Leaf)){return $p}}
  $cmd=Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) {return [string]$cmd.Source}
  return ''
}
function Get-ToolVersion([string]$exe) {
  if (-not $exe) { return '' }
  try {
    $value=(& $exe --version 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {return ''}
    return ([string]$value).Split("`n")[0].Trim().Substring(0,[Math]::Min(90,([string]$value).Split("`n")[0].Trim().Length))
  }catch{return ''}
}
function Fetch-VerifiedGithubZip([string]$repository,[string]$filePattern,[string]$target) {
  $headers=@{'User-Agent'='EKODI-Device-Agent-Codex'}
  $release=Invoke-RestMethod -Uri ('https://api.github.com/repos/'+$repository+'/releases/latest') -Headers $headers -TimeoutSec 30
  $asset=@($release.assets | Where-Object { $_.name -match $filePattern } | Select-Object -First 1)[0]
  if (-not $asset -or [string]$asset.digest -notmatch '^sha256:([0-9a-fA-F]{64})$') {throw 'OFFICIAL_RELEASE_SHA256_UNAVAILABLE'}
  $expected=$Matches[1].ToUpperInvariant()
  $archive=Join-Path $work ([guid]::NewGuid().ToString('N')+'.zip')
  $extract=Join-Path $work ([guid]::NewGuid().ToString('N'))
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $archive -TimeoutSec 180
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {throw 'OFFICIAL_RELEASE_HASH_MISMATCH'}
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    if (Test-Path -LiteralPath $target) { throw 'TOOLCHAIN_TARGET_ALREADY_EXISTS' }
    Move-Item -LiteralPath $extract -Destination $target
  }finally{
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
  }
}
function Install-NodeLts([string]$target) {
  $list=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
  $release=@($list | Where-Object { $_.lts -ne $false -and [int]([regex]::Match($_.version,'^v(\d+)').Groups[1].Value) -ge 22 } | Select-Object -First 1)[0]
  if(-not $release){throw 'NODE_LTS_NOT_AVAILABLE'}
  $name='node-'+$release.version+'-win-x64.zip'
  $base='https://nodejs.org/dist/'+$release.version+'/'
  $sums=(Invoke-WebRequest -UseBasicParsing -Uri ($base+'SHASUMS256.txt') -TimeoutSec 30).Content
  $match=[regex]::Match([string]$sums,'(?m)^([a-fA-F0-9]{64})\s+'+[regex]::Escape($name)+'\s*$')
  if(-not $match.Success){throw 'NODE_SHA256_NOT_AVAILABLE'}
  $archive=Join-Path $work ([guid]::NewGuid().ToString('N')+'.zip')
  $extract=Join-Path $work ([guid]::NewGuid().ToString('N'))
  try {
    Invoke-WebRequest -UseBasicParsing -Uri ($base+$name) -OutFile $archive -TimeoutSec 180
    if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $match.Groups[1].Value.ToUpperInvariant()){throw 'NODE_HASH_MISMATCH'}
    Expand-Archive -LiteralPath $archive -DestinationPath $extract
    $folder=Join-Path $extract ('node-'+$release.version+'-win-x64')
    if(-not (Test-Path -LiteralPath (Join-Path $folder 'node.exe'))){throw 'NODE_ARCHIVE_INVALID'}
    if(Test-Path -LiteralPath $target){throw 'NODE_TARGET_ALREADY_EXISTS'}
    Move-Item -LiteralPath $folder -Destination $target
  }finally{
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$result=[ordered]@{schemaVersion=1;checkedAt=(Get-Date).ToUniversalTime().ToString('o');state='failed';actions=@();reason='';authorization='interactive_user_login_required'}
try {
  try {$acquired=$lock.WaitOne(0)} catch [Threading.AbandonedMutexException] {$acquired=$true}
  if(-not $acquired){throw 'CODEX_INSTALL_ALREADY_RUNNING'}
  $gitFolder=Join-Path $root 'git'
  $uvFolder=Join-Path $root 'uv'
  $nodeFolder=Join-Path $root 'node'
  $npmFolder=Join-Path $root 'npm'
  foreach($d in @((Join-Path $gitFolder 'cmd'),$uvFolder,$nodeFolder,$npmFolder,(Join-Path $env:USERPROFILE '.local\bin'))){Use-Path $d}
  $git=Get-Exe 'git.exe' @((Join-Path $gitFolder 'cmd\git.exe'),(Join-Path $gitFolder 'mingw64\bin\git.exe'))
  if(-not (Get-ToolVersion $git)){
    Fetch-VerifiedGithubZip 'git-for-windows/git' '^MinGit-.*-64-bit\.zip$' $gitFolder
    Use-Path (Join-Path $gitFolder 'cmd')
    $git=Get-Exe 'git.exe' @((Join-Path $gitFolder 'cmd\git.exe'),(Join-Path $gitFolder 'mingw64\bin\git.exe'))
    if(-not (Get-ToolVersion $git)){throw 'GIT_VERIFY_FAILED'}
    $actions.Add('git')
  }
  $uv=Get-Exe 'uv.exe' @((Join-Path $uvFolder 'uv.exe'),(Join-Path $env:USERPROFILE '.local\bin\uv.exe'))
  if(-not (Get-ToolVersion $uv)){
    Fetch-VerifiedGithubZip 'astral-sh/uv' '^uv-x86_64-pc-windows-msvc\.zip$' $uvFolder
    Use-Path $uvFolder
    $uv=Get-Exe 'uv.exe' @((Join-Path $uvFolder 'uv.exe'))
    if(-not (Get-ToolVersion $uv)){throw 'UV_VERIFY_FAILED'}
    $actions.Add('uv')
  }
  $python=Get-Exe 'python.exe' @((Join-Path $env:USERPROFILE '.local\bin\python.exe'))
  if(-not (Get-ToolVersion $python)){
    & $uv python install '3.13' --default 2>$null | Out-Null
    if($LASTEXITCODE -ne 0){throw 'PYTHON_INSTALL_FAILED'}
    Use-Path (Join-Path $env:USERPROFILE '.local\bin')
    $python=Get-Exe 'python.exe' @((Join-Path $env:USERPROFILE '.local\bin\python.exe'))
    if(-not (Get-ToolVersion $python)){
      $found=(& $uv python find '3.13' 2>$null | Out-String).Trim()
      if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $found -PathType Leaf)){throw 'PYTHON_VERIFY_FAILED'}
      $python=$found
    }
    $actions.Add('python')
  }
  $node=Get-Exe 'node.exe' @((Join-Path $nodeFolder 'node.exe'))
  $nodeVersion=Get-ToolVersion $node
  if(-not $nodeVersion -or $nodeVersion -notmatch '^v(\d+)' -or [int]$Matches[1] -lt 22){
    Install-NodeLts $nodeFolder
    Use-Path $nodeFolder
    $node=Get-Exe 'node.exe' @((Join-Path $nodeFolder 'node.exe'))
    if(-not (Get-ToolVersion $node)){throw 'NODE_VERIFY_FAILED'}
    $actions.Add('node')
  }
  $npm=Get-Exe 'npm.cmd' @((Join-Path $nodeFolder 'npm.cmd'))
  if(-not (Get-ToolVersion $npm)){throw 'NPM_MISSING'}
  $codex=Get-Exe 'codex.cmd' @((Join-Path $npmFolder 'codex.cmd'),(Join-Path $env:APPDATA 'npm\codex.cmd'))
  if(-not (Get-ToolVersion $codex)){
    & $npm install -g '@openai/codex' --prefix $npmFolder --no-audit --no-fund --ignore-scripts 2>$null | Out-Null
    if($LASTEXITCODE -ne 0){throw 'CODEX_NPM_INSTALL_FAILED'}
    Use-Path $npmFolder
    $codex=Get-Exe 'codex.cmd' @((Join-Path $npmFolder 'codex.cmd'))
    if(-not (Get-ToolVersion $codex)){throw 'CODEX_VERIFY_FAILED'}
    $actions.Add('codex')
  }
  $result.state='installed_and_verified'
  $result.reason='ok'
}catch {
  $result.reason=(([string]$_.Exception.Message) -replace '[^A-Za-z0-9_-]','_').Substring(0,[Math]::Min(100,([string]$_.Exception.Message).Length))
}finally{
  $result.actions=@($actions.ToArray())
  $result.checkedAt=(Get-Date).ToUniversalTime().ToString('o')
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
  if($acquired){$lock.ReleaseMutex()}
  $lock.Dispose()
}
if($result.state -ne 'installed_and_verified'){exit 1}
