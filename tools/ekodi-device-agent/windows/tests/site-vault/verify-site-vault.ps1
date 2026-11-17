# EKODI-LOCAL-SITE-VAULT-001 synthetic-only Windows CurrentUser DPAPI smoke test.
$ErrorActionPreference='Stop'
$path=Join-Path $PSScriptRoot '..\..\ekodi-site-vault.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $path),[ref]$tokens,[ref]$errors)
if($errors.Count -gt 0){throw ('SITE_VAULT_PARSE_FAILED: '+$errors.Count)}
foreach($func in $ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
  . ([scriptblock]::Create($func.Extent.Text))
}
$PolicyId='EKODI-LOCAL-SITE-VAULT-001'
$MaxArchiveBytes=67108864;$MaxExpandedBytes=134217728
function Assert($test,$message){if(-not $test){throw 'SITE_VAULT_TEST_FAILED: '+$message}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ekodi-site-vault-test-'+[guid]::NewGuid().ToString('N'))
$sealed=Join-Path $root 'sealed'
$profile=Join-Path $root 'profile'
$restored=Join-Path $root 'restored'
[IO.Directory]::CreateDirectory($sealed)|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $profile 'Default'))|Out-Null
[IO.Directory]::CreateDirectory($restored)|Out-Null
try{
  $site=Get-EkodiSite 'https://example.com/login'
  Assert ($site.Origin -ceq 'https://example.com') 'canonical origin'
  Assert ($site.Id.Length -eq 64) 'origin SHA256 ID'
  Assert ((Get-EkodiSite 'https://example.com/other').Id -ceq $site.Id) 'same origin same vault'
  Assert ((Get-EkodiSite 'https://login.example.com/').Id -cne $site.Id) 'subdomains separated'
  foreach($bad in @('http://example.com','https://127.0.0.1/','https://server.local','https://example.com/?secret=x','https://user:pass@example.com/','https://example.com:8443')){
    $blocked=$false
    try{[void](Get-EkodiSite $bad)}catch{$blocked=$true}
    Assert $blocked ('unsafe site was accepted: '+$bad)
  }
  # A small synthetic browser profile, not a genuine credential or live cookie.
  [IO.File]::WriteAllText((Join-Path $profile 'Default\Cookies'),'synthetic-session-do-not-use',[Text.Encoding]::UTF8)
  [IO.File]::WriteAllText((Join-Path $profile 'Local State'),'synthetic-encryption-metadata',[Text.Encoding]::UTF8)
  Protect-EkodiSiteState $root $site $profile $false
  $vault=Get-EkodiVaultPath $root $site
  Assert (Test-Path -LiteralPath $vault) 'encrypted blob created'
  $blob=[IO.File]::ReadAllBytes($vault)
  $utf8=[Text.Encoding]::UTF8.GetString($blob)
  Assert (-not $utf8.Contains('synthetic-session-do-not-use')) 'cookie data never stored as plaintext'
  $record=Unprotect-EkodiSiteState $root $site $restored
  Assert ($record.origin -ceq $site.Origin) 'decrypted origin bound to enrollment'
  Assert (-not [bool]$record.passwordManagerAllowed) 'password manager defaults off'
  Assert ([IO.File]::ReadAllText((Join-Path $restored 'Default\Cookies')).Contains('synthetic-session-do-not-use')) 'profile data restored locally'
  $other=Get-EkodiSite 'https://different.example.com/'
  [IO.File]::WriteAllBytes((Get-EkodiVaultPath $root $other),$blob)
  $failed=$false
  try{[void](Unprotect-EkodiSiteState $root $other (Join-Path $root 'wrong-origin'))}catch{$failed=$true}
  Assert $failed 'cross-origin ciphertext cannot be decrypted'
  $tampered=[byte[]]$blob.Clone()
  $tampered[[Math]::Floor($tampered.Length/2)]=$tampered[[Math]::Floor($tampered.Length/2)] -bxor 1
  [IO.File]::WriteAllBytes($vault,$tampered)
  $failed=$false
  try{[void](Unprotect-EkodiSiteState $root $site (Join-Path $root 'tampered'))}catch{$failed=$true}
  Assert $failed 'tampered DPAPI ciphertext rejected'
  Assert ($blob.Length -gt 64) 'synthetic payload non-empty'
  Write-Output 'EKODI Site Vault Windows DPAPI synthetic roundtrip PASS'
}finally{
  try{Remove-Item -LiteralPath $root -Force -Recurse -ErrorAction Stop}catch{
    throw 'SITE_VAULT_SYNTHETIC_TEST_CLEANUP_FAILED'
  }
}
