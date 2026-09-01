$ErrorActionPreference = 'Stop'

Write-Host 'EKODI remote bootstrap starting...' -ForegroundColor Cyan

$root = Join-Path $env:LOCALAPPDATA 'EKODI\RemoteAgent'
$agentPath = Join-Path $root 'agent.ps1'
$logPath = Join-Path $root 'remote-agent.log'
$startupFolder = [Environment]::GetFolderPath('Startup')
$startupVbs = Join-Path $startupFolder 'EKODI-Remote-Agent.vbs'
New-Item -ItemType Directory -Force -Path $root | Out-Null

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

# Make Claude Code available in future terminals when already installed.
$claudeDir = Join-Path $env:USERPROFILE '.local\bin'
$claudeExe = Join-Path $claudeDir 'claude.exe'
if (Test-Path $claudeExe) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $pathParts = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() })
    if ($pathParts -notcontains $claudeDir) {
        [Environment]::SetEnvironmentVariable('Path', (($pathParts + $claudeDir) -join ';'), 'User')
        Write-Host 'Claude Code PATH registered.' -ForegroundColor Green
    }
}

Refresh-ProcessPath

# Remote Desktop Commander requires Node.js 18+.
$nodeReady = $false
try {
    $nodeVersion = (& node --version 2>$null).Trim().TrimStart('v')
    if ($nodeVersion) {
        $nodeMajor = [int]($nodeVersion.Split('.')[0])
        $nodeReady = $nodeMajor -ge 18
    }
} catch {}

if (-not $nodeReady) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw 'Node.js 18+ is required and winget is unavailable.'
    }
    Write-Host 'Installing Node.js LTS...' -ForegroundColor Yellow
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed with exit code $LASTEXITCODE" }
    Refresh-ProcessPath
}

$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npx) { $npx = Get-Command npx.exe -ErrorAction SilentlyContinue }
if (-not $npx) { throw 'npx is still unavailable after Node.js setup.' }

$agentScript = @'
$ErrorActionPreference = 'Continue'
$root = Join-Path $env:LOCALAPPDATA 'EKODI\RemoteAgent'
$logPath = Join-Path $root 'remote-agent.log'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$mutex = New-Object System.Threading.Mutex($false, 'Local\EKODIRemoteAgent')
if (-not $mutex.WaitOne(0, $false)) { exit 0 }
try {
    while ($true) {
        try {
            $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
            $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path = "$machinePath;$userPath"
            $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
            if (-not $npx) { $npx = Get-Command npx.exe -ErrorAction Stop }
            "`n[$(Get-Date -Format s)] Starting Remote Desktop Commander agent" | Add-Content -Path $logPath
            & $npx.Source -y '@wonderwhy-er/desktop-commander@latest' remote *>> $logPath
        } catch {
            "[$(Get-Date -Format s)] $($_.Exception.Message)" | Add-Content -Path $logPath
        }
        Start-Sleep -Seconds 15
    }
} finally {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
}
'@
Set-Content -Path $agentPath -Value $agentScript -Encoding UTF8

# Auto-start invisibly whenever this Windows user logs in.
$escapedAgent = $agentPath.Replace('"', '""')
$vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$escapedAgent""", 0, False
"@
Set-Content -Path $startupVbs -Value $vbs -Encoding ASCII

# Start the persistent agent immediately. A browser verification page should open on first pairing.
Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$agentPath`"") -WindowStyle Hidden | Out-Null
Write-Host 'Remote agent started and login auto-start installed.' -ForegroundColor Green
Write-Host 'If a browser verification page opens, confirm the matching device code once.' -ForegroundColor Yellow

# Surface pairing/status output without requiring another command.
$deadline = (Get-Date).AddSeconds(75)
$lastLength = 0
while ((Get-Date) -lt $deadline) {
    if (Test-Path $logPath) {
        $text = Get-Content -Path $logPath -Raw -ErrorAction SilentlyContinue
        if ($text -and $text.Length -gt $lastLength) {
            $newText = $text.Substring($lastLength)
            Write-Host $newText
            $lastLength = $text.Length
            if ($text -match 'Device ready|connected|ready') { break }
        }
    }
    Start-Sleep -Seconds 2
}

Write-Host "Bootstrap complete. Log: $logPath" -ForegroundColor Cyan
Write-Host 'After pairing, this PC will reconnect automatically at Windows login.' -ForegroundColor Green
