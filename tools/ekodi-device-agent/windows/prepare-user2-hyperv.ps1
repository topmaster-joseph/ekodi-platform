# EKODI USER2 Hyper-V preparation — approved maintenance-only, no forced restart.
# Run elevated on USER2 only. Produces categorical non-secret diagnostics.
[CmdletBinding()]
param([switch]$EnableFeature)
$ErrorActionPreference='Stop'
$computer=[Environment]::MachineName
if ($computer -ine 'user2') { throw 'EKODI_USER2_ONLY' }
$os=Get-CimInstance Win32_OperatingSystem
$edition=[string]$os.Caption
$firmware=@(Get-CimInstance Win32_Processor | Where-Object { $_.VirtualizationFirmwareEnabled -eq $true }).Count -gt 0
$feature=Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction SilentlyContinue
$state=if($feature){[string]$feature.State}else{'Unavailable'}
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if($EnableFeature){
 if(-not $admin){throw 'ELEVATED_ADMIN_REQUIRED'}
 if(-not $firmware){throw 'VIRTUALIZATION_FIRMWARE_DISABLED'}
 if($state -eq 'Unavailable'){throw 'HYPERV_FEATURE_UNAVAILABLE_CHECK_WINDOWS_EDITION'}
 if($state -ne 'Enabled'){
  # Do not reboot, auto-create VM, turn on guest networking or mount host drives.
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart -ErrorAction Stop | Out-Null
  $feature=Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
  $state=[string]$feature.State
 }
}
$moduleAvailable=[bool](Get-Command Get-VM -ErrorAction SilentlyContinue)
$vmPresent=$false
if($moduleAvailable){try{$vmPresent=$null -ne (Get-VM -Name 'EKODI-Isolated-Base' -ErrorAction Stop)}catch{}}
[pscustomobject]@{
 schemaVersion=1;targetAlias='user2';action=if($EnableFeature){'enable-no-restart'}else{'observe-only'}
 firmwareVirtualization=$firmware;windowsEdition=$edition;hyperVState=$state;
 hyperVModuleAvailable=$moduleAvailable;baseVmPresent=$vmPresent;
 administrator=$admin;restartPerformed=$false;
 rebootMayBeRequired=($state -eq 'EnablePending');
 guestExecutionAuthorized=$false
} | ConvertTo-Json -Compress

# Owner-authored protected release validation trigger; not executed on USER2.

# Owner-authored required checks after guarded base synchronization.
