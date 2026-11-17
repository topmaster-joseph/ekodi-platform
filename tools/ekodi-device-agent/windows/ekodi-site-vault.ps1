# EKODI-LOCAL-SITE-VAULT-001
# Windows LOCAL USER ONLY. No EKODI control-plane command may call this as SYSTEM.
# This keeps site-specific browser state encrypted at rest via DPAPI CurrentUser.
# Secrets, cookies and browser profiles NEVER enter GitHub, EKODI server, MCP, or AI.
[CmdletBinding()]
param(
  [ValidateSet('manage','list','register','open','delete')][string]$Action='manage',
  [string]$Site='',
  [switch]$RememberPasswords
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression
$PolicyId='EKODI-LOCAL-SITE-VAULT-001'
$MaxArchiveBytes=67108864
$MaxExpandedBytes=134217728
$MaxHours=8

function Assert-EkodiLocalHuman {
  if(-not [Environment]::UserInteractive){throw 'SITE_VAULT_INTERACTIVE_DESKTOP_REQUIRED'}
  if([Security.Principal.WindowsIdentity]::GetCurrent().IsSystem){throw 'SITE_VAULT_SYSTEM_ACCOUNT_FORBIDDEN'}
  if((Get-Process -Id $PID).SessionId -le 0){throw 'SITE_VAULT_SESSION_ZERO_FORBIDDEN'}
  if(-not [Environment]::GetFolderPath('LocalApplicationData')){throw 'SITE_VAULT_USER_PROFILE_REQUIRED'}
}
function Get-EkodiSite($InputSite){
  $value=([string]$InputSite).Trim()
  if(-not $value -or $value.Length -gt 2048 -or $value -notmatch '^https://' -or $value -match '[\x00-\x20\x7f]'){
    throw 'SITE_VAULT_PUBLIC_HTTPS_REQUIRED'
  }
  $uri=$null
  if(-not [Uri]::TryCreate($value,[UriKind]::Absolute,[ref]$uri)){throw 'SITE_VAULT_URL_INVALID'}
  if($uri.Scheme -cne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){
    throw 'SITE_VAULT_PUBLIC_HTTPS_REQUIRED'
  }
  $hostName=([string]$uri.IdnHost).ToLowerInvariant().TrimEnd('.')
  if($hostName.Length -gt 253 -or $hostName -notmatch '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$' -or
    $hostName -match '\.(local|localhost|internal|test|invalid|example|onion|lan|home|corp)$' -or
    $hostName -in @('localhost','metadata','metadata.google.internal')){
    throw 'SITE_VAULT_PUBLIC_DNS_REQUIRED'
  }
  $address=$null
  if([Net.IPAddress]::TryParse($hostName,[ref]$address)){throw 'SITE_VAULT_IP_ADDRESS_FORBIDDEN'}
  $origin='https://'+$hostName
  $startUrl=$origin+$uri.AbsolutePath
  $sha=[Security.Cryptography.SHA256]::Create()
  try {
    $bytes=[Text.Encoding]::UTF8.GetBytes($origin)
    $id=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
  } finally {$sha.Dispose()}
  return @{Origin=$origin;StartUrl=$startUrl;Id=$id;Host=$hostName}
}
function Confirm-EkodiVaultConsent([string]$Message){
  try{
    $shell=New-Object -ComObject WScript.Shell
    return ($shell.Popup($Message,120,'EKODI 브라우저 · 로컬 로그인 보관함',4+32+256+4096) -eq 6)  # No is the default
  }catch{return $false}
}
function Assert-EkodiSafeDirectory([string]$Path){
  if(Test-Path -LiteralPath $Path){
    $item=Get-Item -LiteralPath $Path -Force
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'SITE_VAULT_REPARSE_PATH_FORBIDDEN'}
  }else{
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}
function Get-EkodiVaultRoot {
  $base=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EKODI'
  $root=Join-Path $base 'SiteVault'
  foreach($path in @($base,$root,(Join-Path $root 'sealed'),(Join-Path $root 'active'))){
    Assert-EkodiSafeDirectory $path
  }
  return $root
}
function Get-EkodiVaultPath($Root,$Site){
  return (Join-Path (Join-Path $Root 'sealed') ($Site.Id+'.vault'))
}
function Get-EkodiEntropy([string]$Id){
  return [Text.Encoding]::UTF8.GetBytes($PolicyId+'|'+$Id)
}
function Protect-EkodiSiteState($Root,$Site,[string]$ProfileDir,[bool]$PasswordManagerAllowed){
  $archiveMemory=[IO.MemoryStream]::new()
  try{
    $zip=[IO.Compression.ZipArchive]::new($archiveMemory,[IO.Compression.ZipArchiveMode]::Create,$true)
    try{
      $allBytes=0L
      foreach($file in @(Get-ChildItem -LiteralPath $ProfileDir -File -Recurse -Force)){
        if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
        $name=$file.FullName.Substring($ProfileDir.Length).TrimStart('\','/').Replace('\','/')
        if($name -match '(^|/)(Cache|Code Cache|GPUCache|Crashpad|GrShaderCache|ShaderCache|DawnCache|CacheStorage)(/|$)' -or
           $name -match '(^|/)(DevToolsActivePort|SingletonLock|SingletonSocket|SingletonCookie)$'){continue}
        $allBytes += [long]$file.Length
        if($allBytes -gt $MaxExpandedBytes){throw 'SITE_VAULT_PROFILE_TOO_LARGE'}
        $entry=$zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
        $source=[IO.File]::OpenRead($file.FullName)
        $destination=$entry.Open()
        try{$source.CopyTo($destination)}finally{$destination.Dispose();$source.Dispose()}
      }
    } finally {$zip.Dispose()}
    $zipBytes=$archiveMemory.ToArray()
    if($zipBytes.Length -gt $MaxArchiveBytes){throw 'SITE_VAULT_ARCHIVE_TOO_LARGE'}
    $payload=@{
      version=1;policy=$PolicyId;origin=$Site.Origin;startUrl=$Site.StartUrl
      passwordManagerAllowed=$PasswordManagerAllowed
      sealedAt=[DateTime]::UtcNow.ToString('o')
      profileZip=[Convert]::ToBase64String($zipBytes)
    }|ConvertTo-Json -Depth 3 -Compress
    $plain=[Text.Encoding]::UTF8.GetBytes($payload)
    try{
      $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,(Get-EkodiEntropy $Site.Id),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      $destination=Get-EkodiVaultPath $Root $Site
      $temporary=$destination+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
      [IO.File]::WriteAllBytes($temporary,$cipher)
      try{
        if(Test-Path -LiteralPath $destination){
          $backup=$temporary+'.bak'
          [IO.File]::Replace($temporary,$destination,$backup,$true)
          Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        }else{[IO.File]::Move($temporary,$destination)}
      }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}
    }finally{[Array]::Clear($plain,0,$plain.Length)}
  }finally{$archiveMemory.Dispose()}
}
function Unprotect-EkodiSiteState($Root,$Site,[string]$ProfileDir){
  $sealed=Get-EkodiVaultPath $Root $Site
  if(-not (Test-Path -LiteralPath $sealed)){throw 'SITE_VAULT_SITE_NOT_REGISTERED'}
  $cipher=[IO.File]::ReadAllBytes($sealed)
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,(Get-EkodiEntropy $Site.Id),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{
    $record=([Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json)
    if($record.policy -cne $PolicyId -or $record.version -ne 1 -or $record.origin -cne $Site.Origin){
      throw 'SITE_VAULT_ORIGIN_MISMATCH'
    }
    $zipBytes=[Convert]::FromBase64String([string]$record.profileZip)
    if($zipBytes.Length -gt $MaxArchiveBytes){throw 'SITE_VAULT_ARCHIVE_TOO_LARGE'}
    $stream=[IO.MemoryStream]::new()
    try{
      $stream.Write($zipBytes,0,$zipBytes.Length)
      $stream.Position=0
      $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read,$true)
      try{
        $expanded=0L
        $rootPath=[IO.Path]::GetFullPath($ProfileDir).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
        foreach($entry in $zip.Entries){
          $relative=[string]$entry.FullName
          $parts=$relative.Split('/')
          if(-not $relative -or $relative.StartsWith('/') -or
            $relative.Contains('\') -or $parts -contains '..' -or $parts -contains '.' -or
            $relative -match '^[A-Za-z]:' -or $relative.EndsWith('/')){throw 'SITE_VAULT_ARCHIVE_PATH_FORBIDDEN'}
          $expanded += [long]$entry.Length
          if($expanded -gt $MaxExpandedBytes){throw 'SITE_VAULT_ARCHIVE_EXPANDED_LIMIT'}
          $target=[IO.Path]::GetFullPath((Join-Path $ProfileDir $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)))
          if(-not $target.StartsWith($rootPath,[StringComparison]::OrdinalIgnoreCase)){throw 'SITE_VAULT_ARCHIVE_PATH_FORBIDDEN'}
          $folder=[IO.Path]::GetDirectoryName($target)
          if(-not (Test-Path -LiteralPath $folder)){[IO.Directory]::CreateDirectory($folder)|Out-Null}
          $source=$entry.Open()
          $output=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
          try{$source.CopyTo($output)}finally{$output.Dispose();$source.Dispose()}
        }
      }finally{$zip.Dispose()}
    }finally{$stream.Dispose()}
    return $record
  }finally{[Array]::Clear($plain,0,$plain.Length)}
}
function Resolve-EkodiLocalBrowser {
  $paths=New-Object System.Collections.Generic.List[string]
  $pf=[Environment]::GetEnvironmentVariable('ProgramFiles')
  $x86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  foreach($base in @($pf,$x86)){
    if($base){
      $paths.Add((Join-Path $base 'Google\Chrome\Application\chrome.exe'))
      $paths.Add((Join-Path $base 'Microsoft\Edge\Application\msedge.exe'))
    }
  }
  foreach($path in $paths){if(Test-Path -LiteralPath $path){return $path}}
  throw 'SITE_VAULT_CHROMIUM_NOT_INSTALLED'
}
function Get-EkodiBrowserProcesses([string]$ProfileDir){
  $escaped=[regex]::Escape([IO.Path]::GetFullPath($ProfileDir))
  $pattern='(?i)--user-data-dir=(?:"'+$escaped+'"|'+$escaped+')(?=\s|"|$)'
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object{$_.Name -in @('chrome.exe','msedge.exe') -and [regex]::IsMatch([string]$_.CommandLine,$pattern)})
}
function Remove-EkodiActiveProfile([string]$ProfileDir){
  if(-not $ProfileDir){return}
  $full=[IO.Path]::GetFullPath($ProfileDir)
  $root=[IO.Path]::GetFullPath((Join-Path (Get-EkodiVaultRoot) 'active')).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
  if(-not $full.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($full) -notmatch '^Session-[a-f0-9]{64}-[a-f0-9]{32}$'){
    throw 'SITE_VAULT_ACTIVE_PATH_INVALID'
  }
  for($i=0;$i -lt 8 -and (Test-Path -LiteralPath $full);$i++){
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue
    if(Test-Path -LiteralPath $full){Start-Sleep -Milliseconds 250}
  }
  if(Test-Path -LiteralPath $full){throw 'SITE_VAULT_ACTIVE_PROFILE_NOT_REMOVED'}
}
function Invoke-EkodiSiteBrowser($Root,$Site,[bool]$FirstVisit,[bool]$PasswordManagerAllowed){
  $parent=Join-Path $Root 'active'
  $profile=Join-Path $parent ('Session-'+$Site.Id+'-'+[guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($profile)|Out-Null
  $safeToSeal=$false
  $saveError=$null
  try{
    if(-not $FirstVisit){
      $record=Unprotect-EkodiSiteState $Root $Site $profile
      $PasswordManagerAllowed=[bool]$record.passwordManagerAllowed
    }else{
      [IO.Directory]::CreateDirectory((Join-Path $profile 'Default'))|Out-Null
      @{credentials_enable_service=$PasswordManagerAllowed;profile=@{password_manager_enabled=$PasswordManagerAllowed};autofill=@{credit_card_enabled=$false}}|
        ConvertTo-Json -Depth 5 -Compress|
        Set-Content -LiteralPath (Join-Path $profile 'Default\Preferences') -Encoding UTF8
    }
    $browser=Resolve-EkodiLocalBrowser
    $args=@(
      ('--user-data-dir="'+$profile+'"'),
      '--no-first-run','--no-default-browser-check','--disable-sync',
      '--disable-extensions','--new-window',('"'+$Site.StartUrl+'"')
    )
    $proc=Start-Process -FilePath $browser -ArgumentList ($args -join ' ') -PassThru
    Start-Sleep -Seconds 3
    if(@(Get-EkodiBrowserProcesses $profile).Count -eq 0){throw 'SITE_VAULT_BROWSER_START_NOT_VERIFIED'}
    $start=[DateTime]::UtcNow
    while([DateTime]::UtcNow -lt $start.AddHours($MaxHours)){
      if(@(Get-EkodiBrowserProcesses $profile).Count -eq 0){break}
      Start-Sleep -Seconds 3
    }
    # An expiry closes ONLY this dedicated site profile, never a user's other windows.
    foreach($p in @(Get-EkodiBrowserProcesses $profile)){
      try{Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop}catch{}
    }
    $stopAt=[DateTime]::UtcNow.AddSeconds(10)
    while(@(Get-EkodiBrowserProcesses $profile).Count -gt 0 -and [DateTime]::UtcNow -lt $stopAt){
      Start-Sleep -Milliseconds 250
    }
    if(@(Get-EkodiBrowserProcesses $profile).Count -gt 0){throw 'SITE_VAULT_BROWSER_STILL_RUNNING'}
    # Only browser profile bytes are sealed. Passwords (if opted into Chromium's
    # native manager) remain inside its profile, not in app code or logs.
    Protect-EkodiSiteState $Root $Site $profile $PasswordManagerAllowed
    $safeToSeal=$true
  }catch{$saveError=$_.Exception.Message}
  finally{
    # Never retain an unencrypted temporary profile on ordinary exit/errors.
    try{Remove-EkodiActiveProfile $profile}catch{if(-not $saveError){$saveError=$_.Exception.Message}}
  }
  if($saveError){throw 'SITE_VAULT_SESSION_FAILED_OR_NOT_PERSISTED'}
  if(-not $safeToSeal){throw 'SITE_VAULT_SEAL_NOT_VERIFIED'}
  Write-Output ('로컬 암호화 저장 완료: '+$Site.Origin)
}
function Recover-EkodiAbandonedProfiles($Root){
  $activeRoot=Join-Path $Root 'active'
  foreach($folder in @(Get-ChildItem -LiteralPath $activeRoot -Directory -Force)){
    if($folder.Name -notmatch '^Session-[a-f0-9]{64}-[a-f0-9]{32}$'){continue}
    if(($folder.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
    if($folder.CreationTimeUtc -gt [DateTime]::UtcNow.AddMinutes(-3)){continue}
    if(@(Get-EkodiBrowserProcesses $folder.FullName).Count -gt 0){continue}
    Remove-EkodiActiveProfile $folder.FullName
  }
}

function Get-EkodiLocalSiteLabels($Root){
  $labels=New-Object System.Collections.Generic.List[string]
  foreach($entry in @(Get-ChildItem -LiteralPath (Join-Path $Root 'sealed') -Filter '*.vault' -File)){
    $id=[IO.Path]::GetFileNameWithoutExtension($entry.Name)
    if($id -notmatch '^[a-f0-9]{64}$'){continue}
    try{
      $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($entry.FullName),(Get-EkodiEntropy $id),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      try{
        $record=([Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json)
        $origin=Get-EkodiSite $record.origin
        if($origin.Id -ceq $id){$labels.Add($origin.Origin)}
      }finally{[Array]::Clear($plain,0,$plain.Length)}
    }catch{}
  }
  return @($labels | Sort-Object)
}
function Show-EkodiLocalSiteManager($Root){
  # Purely local WinForms interface; no browser automation, remote call or
  # credential input field. Every selected operation starts an independent
  # human-attended Windows process with the same fail-closed consent prompts.
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [Windows.Forms.Application]::EnableVisualStyles()
  $form=New-Object Windows.Forms.Form
  $form.Text='에코디 브라우저 · 로그인 사이트 보관함'
  $form.Width=650;$form.Height=520
  $form.StartPosition='CenterScreen'
  $form.FormBorderStyle='FixedDialog'
  $form.MaximizeBox=$false

  $headline=New-Object Windows.Forms.Label
  $headline.Text='사이트별 로그인 정보를 이 PC의 Windows 계정에 암호화해 저장합니다.'
  $headline.SetBounds(20,20,600,24)
  $form.Controls.Add($headline)

  $warning=New-Object Windows.Forms.Label
  $warning.Text='기본 비밀번호 저장 끔 · AI/서버와 공유 없음 · 사이트에서 직접 로그인'
  $warning.SetBounds(20,48,600,26)
  $form.Controls.Add($warning)

  $siteInput=New-Object Windows.Forms.TextBox
  $siteInput.SetBounds(20,88,594,28)
  $siteInput.Text='https://'
  $form.Controls.Add($siteInput)

  $remember=New-Object Windows.Forms.CheckBox
  $remember.SetBounds(20,126,590,28)
  $remember.Text='브라우저 자체 비밀번호 저장 허용 (현장 추가 승인 필수)'
  $remember.Checked=$false
  $form.Controls.Add($remember)

  $listLabel=New-Object Windows.Forms.Label
  $listLabel.SetBounds(20,169,400,22)
  $listLabel.Text='이 Windows 계정에 암호화되어 저장된 사이트'
  $form.Controls.Add($listLabel)

  $sites=New-Object Windows.Forms.ListBox
  $sites.SetBounds(20,197,594,168)
  foreach($label in @(Get-EkodiLocalSiteLabels $Root)){[void]$sites.Items.Add($label)}
  $sites.Add_SelectedIndexChanged({if($sites.SelectedItem){$siteInput.Text=[string]$sites.SelectedItem}})
  $form.Controls.Add($sites)

  $buttons=@(
    @{Label='새 사이트 등록';Action='register';X=20;W=145},
    @{Label='저장된 로그인 열기';Action='open';X=174;W=145},
    @{Label='저장 기록 삭제';Action='delete';X=328;W=140}
  )
  foreach($spec in $buttons){
    $btn=New-Object Windows.Forms.Button
    $btn.SetBounds([int]$spec.X,382,[int]$spec.W,37)
    $btn.Text=[string]$spec.Label
    $selectedAction=[string]$spec.Action
    # Capture the action with a separate scriptblock for each button.
    switch($selectedAction){
      'register' {$btn.Add_Click({
        try{
          $site=Get-EkodiSite $siteInput.Text
          $args=@('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-Action','register','-Site',('"'+$site.StartUrl+'"'))
          if($remember.Checked){$args+='-RememberPasswords'}
          Start-Process -FilePath 'powershell.exe' -ArgumentList ($args -join ' ')
          $form.Close()
        }catch{[Windows.Forms.MessageBox]::Show('공개 HTTPS 사이트의 정확한 주소를 입력하세요.','등록할 수 없음')|Out-Null}
      })}
      'open' {$btn.Add_Click({
        try{
          $site=Get-EkodiSite $siteInput.Text
          Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-Action','open','-Site',('"'+$site.StartUrl+'"')) -join ' ')
          $form.Close()
        }catch{[Windows.Forms.MessageBox]::Show('저장된 사이트의 올바른 HTTPS 주소를 선택하세요.','열 수 없음')|Out-Null}
      })}
      'delete' {$btn.Add_Click({
        try{
          $site=Get-EkodiSite $siteInput.Text
          Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-Action','delete','-Site',('"'+$site.StartUrl+'"')) -join ' ')
          $form.Close()
        }catch{[Windows.Forms.MessageBox]::Show('삭제할 사이트를 선택하세요.','삭제할 수 없음')|Out-Null}
      })}
    }
    $form.Controls.Add($btn)
  }
  $caption=New-Object Windows.Forms.Label
  $caption.SetBounds(20,431,595,36)
  $caption.Text='비밀번호·인증번호는 에코디 화면에 입력하지 않습니다. 제공자 로그인 페이지에서만 직접 입력하세요.'
  $form.Controls.Add($caption)
  try{[void]$form.ShowDialog()}finally{$form.Dispose()}
}

function Invoke-EkodiSiteVault {
  Assert-EkodiLocalHuman
  $root=Get-EkodiVaultRoot
  Recover-EkodiAbandonedProfiles $root
  if($Action -eq 'manage'){Show-EkodiLocalSiteManager $root;return}
  if($Action -eq 'list'){
    foreach($entry in @(Get-ChildItem -LiteralPath (Join-Path $root 'sealed') -Filter '*.vault' -File)){
      $id=[IO.Path]::GetFileNameWithoutExtension($entry.Name)
      if($id -notmatch '^[a-f0-9]{64}$'){continue}
      try{
        $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($entry.FullName),(Get-EkodiEntropy $id),[Security.Cryptography.DataProtectionScope]::CurrentUser)
        try{
          $item=([Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json)
          $origin=Get-EkodiSite $item.origin
          if($origin.Id -ceq $id){Write-Output $origin.Origin}
        }finally{[Array]::Clear($plain,0,$plain.Length)}
      }catch{Write-Output '[잠금/손상된 사이트 기록]'}
    }
    return
  }
  $site=Get-EkodiSite $Site
  $file=Get-EkodiVaultPath $root $site
  $leaseFile=$file+'.lock'
  $lease=[IO.File]::Open($leaseFile,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try{
  if($Action -eq 'delete'){
    if(-not (Test-Path -LiteralPath $file)){throw 'SITE_VAULT_SITE_NOT_REGISTERED'}
    if(-not (Confirm-EkodiVaultConsent ('사이트 로그인 보관함을 영구 삭제합니까?'+[Environment]::NewLine+$site.Origin))){
      throw 'SITE_VAULT_LOCAL_CONSENT_DECLINED'
    }
    Remove-Item -LiteralPath $file -Force
    Write-Output ('삭제 완료: '+$site.Origin)
    return
  }
  if($Action -eq 'register'){
    if(Test-Path -LiteralPath $file){throw 'SITE_VAULT_ALREADY_REGISTERED_USE_OPEN'}
    if(@(Get-ChildItem -LiteralPath (Join-Path $root 'sealed') -Filter '*.vault' -File).Count -ge 50){
      throw 'SITE_VAULT_SITE_LIMIT_REACHED'
    }
  }elseif(-not (Test-Path -LiteralPath $file)){throw 'SITE_VAULT_SITE_NOT_REGISTERED'}
  $message='대상 공식 주소를 직접 확인하세요.'+[Environment]::NewLine+$site.Origin+
    [Environment]::NewLine+[Environment]::NewLine+
    '로그인은 열린 브라우저에서 직접 수행합니다. 프로필은 사이트별로 분리하여 Windows 계정의 DPAPI로 암호화합니다.'+
    [Environment]::NewLine+'클라우드·AI로 비밀번호, 세션 또는 쿠키를 보내지 않습니다.'+
    [Environment]::NewLine+'이 PC의 현재 Windows 사용자에게만 저장됩니다. 계속합니까?'
  if(-not (Confirm-EkodiVaultConsent $message)){throw 'SITE_VAULT_LOCAL_CONSENT_DECLINED'}
  if($Action -eq 'register' -and $RememberPasswords){
    if(-not (Confirm-EkodiVaultConsent ('이 사이트의 브라우저 자체 비밀번호 저장 기능을 켜시겠습니까?'+[Environment]::NewLine+$site.Origin+
      [Environment]::NewLine+'사이트의 저장 확인은 브라우저에서 직접 선택합니다.'))){
      throw 'SITE_VAULT_PASSWORD_SAVE_CONSENT_DECLINED'
    }
  }
  Invoke-EkodiSiteBrowser $root $site ($Action -eq 'register') ([bool]($Action -eq 'register' -and $RememberPasswords))
  }finally{$lease.Dispose()}
}
try{Invoke-EkodiSiteVault}catch{
  # Emit only a bounded policy code: never a URL, cookie or exception stack.
  $code=[string]$_.Exception.Message
  if($code -notmatch '^SITE_VAULT_[A-Z0-9_]+$'){$code='SITE_VAULT_OPERATION_FAILED'}
  [Console]::Error.WriteLine('EKODI_SITE_VAULT_ERROR: '+$code)
  exit 1
}
