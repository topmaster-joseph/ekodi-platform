param(
  [switch]$SkipOpenTokenPage
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tokenUrl = 'https://github.com/settings/personal-access-tokens/new?name=EKODI-Main-Protection&description=One-time+EKODI+main+branch+protection+bootstrap&target_name=topmaster-joseph&expires_in=1&administration=write'

Write-Host 'EKODI GitHub Governance secure bootstrap'
Write-Host '1. GitHub token form will request Administration: write and expire in 1 day.'
Write-Host '2. Under Repository access choose: Only select repositories -> ekodi-platform.'
Write-Host '3. Generate the token, then paste it into the hidden prompt below.'
Write-Host 'The token is never written to disk or printed.'

if (-not $SkipOpenTokenPage) {
  Start-Process $tokenUrl
}

$secureToken = Read-Host 'Fine-grained PAT' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$plainToken = $null
$previousToken = $env:EKODI_GITHUB_ADMIN_TOKEN
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainToken)) {
    throw 'A fine-grained PAT is required.'
  }

  $env:EKODI_GITHUB_ADMIN_TOKEN = $plainToken
  Push-Location $repoRoot
  try {
    & node 'scripts/github-governance-controller.mjs' --apply
    if ($LASTEXITCODE -ne 0) {
      throw "Governance apply failed with exit code $LASTEXITCODE."
    }
    & node 'scripts/github-governance-controller.mjs' --live
    if ($LASTEXITCODE -ne 0) {
      throw "Governance verification failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  Write-Host 'GitHub main protection is applied and verified.'
  Write-Host 'The one-day token can now be revoked immediately from GitHub settings if desired.'
} finally {
  $env:EKODI_GITHUB_ADMIN_TOKEN = $previousToken
  $plainToken = $null
  $secureToken = $null
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
