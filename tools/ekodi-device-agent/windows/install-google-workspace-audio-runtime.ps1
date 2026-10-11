param(
  [Parameter(Mandatory=$true)][string]$RepositoryRoot,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
# Run only on an authorized isolated Windows execution node, using a locally
# verified checkout of an officially released EKODI commit. No browser login,
# third-party connection, remote script fetching or npm install occurs here.
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$dst = Join-Path $env:ProgramData 'EKODI\GoogleWorkspace'
$specs = @(
  'google-workspace-slides-audio-policy.js',
  'tools/ekodi-device-agent/windows/google-workspace-slides-audio.mjs'
)
foreach ($spec in $specs) {
  $src = Join-Path $repo ($spec.Replace('/', [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
    throw ('SOURCE_MISSING:' + $spec)
  }
}
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'NODE_RUNTIME_MISSING' }
if (-not $Apply) {
  Write-Output 'DRY_RUN_ONLY: specify -Apply after the EKODI release and local administrator approve the source.'
  Write-Output ('Source: ' + $repo)
  Write-Output ('Destination: ' + $dst)
  exit 0
}
$staging = Join-Path $env:ProgramData ('EKODI\GoogleWorkspace-stage-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  foreach ($spec in $specs) {
    $src = Join-Path $repo ($spec.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $target = Join-Path $staging ($spec.Replace('/', [IO.Path]::DirectorySeparatorChar))
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $src -Destination $target -Force
    if ((Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) {
      throw ('FILE_HASH_MISMATCH:' + $spec)
    }
  }
  '{"type":"module","private":true}' | Set-Content -LiteralPath (Join-Path $staging 'package.json') -Encoding UTF8
  & $node.Source --check (Join-Path $staging 'google-workspace-slides-audio-policy.js')
  if ($LASTEXITCODE -ne 0) { throw 'POLICY_SYNTAX_INVALID' }
  & $node.Source --check (Join-Path $staging 'tools\ekodi-device-agent\windows\google-workspace-slides-audio.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'WORKER_SYNTAX_INVALID' }

  # The real target may contain user-consented Google profile/session data.
  # Never replace/delete that directory or its consent/canary during upgrades.
  New-Item -ItemType Directory -Path $dst -Force | Out-Null
  $backup = @{}
  foreach ($spec in @($specs + 'package.json')) {
    $from = Join-Path $staging ($spec.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $to = Join-Path $dst ($spec.Replace('/', [IO.Path]::DirectorySeparatorChar))
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($to)) -Force | Out-Null
    if (Test-Path -LiteralPath $to) {
      $backup[$spec] = [IO.File]::ReadAllBytes($to)
    }
    try {
      Copy-Item -LiteralPath $from -Destination $to -Force
    } catch {
      foreach ($saved in $backup.Keys) {
        $restore = Join-Path $dst ($saved.Replace('/', [IO.Path]::DirectorySeparatorChar))
        [IO.File]::WriteAllBytes($restore,$backup[$saved])
      }
      throw
    }
  }
  Write-Output 'WORKER_SOURCE_INSTALLED: Native execution is still disabled until explicit consent, isolated profile authentication, Playwright runtime, and a valid canary.'
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
