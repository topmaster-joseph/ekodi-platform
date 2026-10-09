# EKODI Local AI Bootstrap for Windows user2 / user4
# Installs only missing programs using official Ollama and Anthropic URLs.
# Launch using EKODI-LocalAI-Install.cmd (no administrator permission required).
[CmdletBinding()]
param(
    [switch]$VerifyOnly,
    [switch]$SkipModel
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = Join-Path $env:LOCALAPPDATA 'EKODI\LocalAI'
$logs = Join-Path $base 'logs'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logs ("install-$stamp-$PID.log")
$resultFile = Join-Path $base 'last-install-result.json'
$script:failures = New-Object 'System.Collections.Generic.List[string]'
$script:status = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    machine = $env:COMPUTERNAME
    user = $env:USERNAME
    verifyOnly = [bool]$VerifyOnly
    ollama = 'unknown'
    model = 'unknown'
    modelName = $null
    claude = 'unknown'
    claudeAuthenticated = 'unknown'
    inference = 'not_checked'
    log = $logFile
}
$mutex = $null
$lockAcquired = $false
$transcriptStarted = $false

function Note([string]$message) {
    Write-Host ("[EKODI] " + $message)
}
function Problem([string]$message) {
    [void]$script:failures.Add($message)
    Write-Warning $message
}
function Find-Exe([string[]]$paths, [string]$name) {
    foreach ($path in $paths) {
        if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) { return $path }
    }
    $found = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and $found.Source) { return $found.Source }
    return $null
}
function Ensure-UserPath([string]$exe) {
    if (-not $exe) { return }
    $folder = Split-Path -Parent $exe
    $parts = @(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ })
    if (-not @($parts | Where-Object { $_.TrimEnd('\') -ieq $folder.TrimEnd('\') }).Count) {
        [Environment]::SetEnvironmentVariable('Path', (($parts + @($folder)) -join ';'), 'User')
        Note ("Added to user PATH: $folder")
    }
    if (-not @(($env:Path -split ';') | Where-Object { $_.TrimEnd('\') -ieq $folder.TrimEnd('\') }).Count) {
        $env:Path += ';' + $folder
    }
}
function Version-Of([string]$exe) {
    try {
        $out = & $exe --version 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return $null }
        return $out.Trim()
    } catch { return $null }
}
function Download-OfficialScript([string]$uri, [string]$prefix) {
    $download = Join-Path $env:TEMP ("ekodi-$prefix-$PID-$stamp.ps1")
    try {
        Invoke-WebRequest -Uri $uri -UseBasicParsing -MaximumRedirection 5 -OutFile $download -TimeoutSec 120
        if ((Get-Item -LiteralPath $download).Length -lt 100) { throw 'Installer body is unexpectedly short' }
        Note "Official installer retrieved: $uri"
        # Run in a child shell. An in-process dot/source install can call exit
        # and terminate the diagnostic log before results are persisted.
        $child = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $download + '"')
        ) -Wait -PassThru
        if ($child.ExitCode -ne 0) {
            throw "$prefix installer returned code $($child.ExitCode)"
        }
    } finally {
        Remove-Item -LiteralPath $download -ErrorAction SilentlyContinue
    }
}
function Ollama-Ready {
    try {
        $r = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 4
        return [bool]$r.version
    } catch { return $false }
}
function Wait-Ollama([string]$exe) {
    if (Ollama-Ready) { return $true }
    try {
        Note 'Starting local Ollama API (loopback only)'
        Start-Process -FilePath $exe -ArgumentList @('serve') -WindowStyle Hidden | Out-Null
    } catch { Note ("Ollama start attempt failed: " + $_.Exception.Message) }
    for ($i=0; $i -lt 24; $i++) {
        Start-Sleep -Seconds 2
        if (Ollama-Ready) { return $true }
    }
    return $false
}

try {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $mutex = New-Object System.Threading.Mutex($false, 'Local\EKODI_LocalAI_Installer')
    try { $lockAcquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $lockAcquired = $true }
    if (-not $lockAcquired) { throw 'Another EKODI installer is already running in this Windows session.' }
    Start-Transcript -LiteralPath $logFile -ErrorAction Stop | Out-Null
    $transcriptStarted = $true
    Note ("Starting on $env:COMPUTERNAME - mode VerifyOnly=$VerifyOnly")

    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    $driveName = [System.IO.Path]::GetPathRoot($env:LOCALAPPDATA)
    $drive = New-Object System.IO.DriveInfo($driveName)
    $freeGB = [math]::Round($drive.AvailableFreeSpace / 1GB, 1)
    $script:status.ramGB = $ramGB
    $script:status.freeGB = $freeGB
    $script:status.windows = $os.Caption
    Note ("OS=$($os.Caption), RAM=$ramGB GB, free=$freeGB GB")
    if (-not [Environment]::Is64BitOperatingSystem) { throw '64-bit Windows is required.' }
    if ($os.Version -and ([version]$os.Version -lt [version]'10.0.19045')) {
        throw 'Ollama requires Windows 10 22H2 or newer (Windows 11 is supported).'
    }

    $ollama = Find-Exe @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        'C:\Program Files\Ollama\ollama.exe'
    ) 'ollama'
    $ollamaVersion = if ($ollama) { Version-Of $ollama } else { $null }
    if (-not $ollamaVersion -and -not $VerifyOnly) {
        if ($freeGB -lt 6) {
            Problem 'Skipping Ollama install: at least 6 GB of free disk space is recommended.'
        } else {
            try {
                Note 'Installing Ollama from https://ollama.com/install.ps1'
                Download-OfficialScript 'https://ollama.com/install.ps1' 'ollama'
                $ollama = Find-Exe @(
                    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
                    'C:\Program Files\Ollama\ollama.exe'
                ) 'ollama'
                $ollamaVersion = if ($ollama) { Version-Of $ollama } else { $null }
            } catch { Problem ("Ollama installation failed: " + $_.Exception.Message) }
        }
    }
    if ($ollamaVersion) {
        $script:status.ollama = 'installed: ' + $ollamaVersion
        Note ('Ollama: ' + $ollamaVersion)
        if (-not $VerifyOnly) { Ensure-UserPath $ollama }
    } else {
        $script:status.ollama = 'missing_or_failed'
        if ($VerifyOnly) { Note 'Ollama is not installed.' }
    }

    if ($ollamaVersion -and $ollama) {
        $ready = if ($VerifyOnly) { Ollama-Ready } else { Wait-Ollama $ollama }
        if ($ready) {
            $script:status.ollamaApi = 'ready (127.0.0.1:11434)'
            Note 'Ollama local API: ready.'
        } else {
            $script:status.ollamaApi = 'not_ready'
            Problem 'Ollama server not responding at 127.0.0.1:11434.'
        }
        $modelName = if ($ramGB -ge 7.5) { 'qwen2.5-coder:1.5b' } else { 'qwen3:0.6b' }
        $script:status.modelName = $modelName
        $installedModels = @()
        try {
            $modelData = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 8
            $installedModels = @($modelData.models | ForEach-Object { $_.name })
        } catch { Note 'Could not query installed models.' }
        if ($installedModels -contains $modelName) {
            $script:status.model = 'installed'
            Note ("Model already present: $modelName")
        } elseif ($VerifyOnly -or $SkipModel) {
            $script:status.model = 'not_installed'
            Note ("Model not downloaded in this mode: $modelName")
        } elseif ($freeGB -lt 3) {
            $script:status.model = 'skipped_low_disk'
            Problem "Cannot download ${modelName}: less than 3 GB free."
        } else {
            try {
                Note ("Downloading light-weight model: $modelName")
                $oldPreference = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                try { & $ollama pull $modelName } finally { $ErrorActionPreference = $oldPreference }
                if ($LASTEXITCODE -ne 0) { throw "ollama pull exit code $LASTEXITCODE" }
                $script:status.model = 'installed'
            } catch {
                $script:status.model = 'failed'
                Problem ("Model download failed: " + $_.Exception.Message)
            }
        }
        if ($script:status.model -eq 'installed' -and $ready) {
            try {
                Note 'Checking real local model inference'
                $body = @{ model = $modelName; prompt = 'Return the word OK only.'; stream = $false; think = $false; options = @{ num_predict = 24; temperature = 0 } } | ConvertTo-Json -Depth 5
                $response = Invoke-RestMethod 'http://127.0.0.1:11434/api/generate' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
                if (-not $response.done -or [string]::IsNullOrWhiteSpace($response.response)) { throw 'No completed model response' }
                $script:status.inference = 'passed'
                Note ("Inference passed: " + $response.response.Trim())
            } catch {
                $script:status.inference = 'failed'
                Problem ("Inference check failed: " + $_.Exception.Message)
            }
        }
    }

    $claude = Find-Exe @(
        (Join-Path $env:APPDATA 'npm\claude.cmd'),
        (Join-Path $env:USERPROFILE '.local\bin\claude.exe')
    ) 'claude'
    $claudeVersion = if ($claude) { Version-Of $claude } else { $null }
    if (-not $claudeVersion -and -not $VerifyOnly) {
        try {
            Note 'Installing native Claude Code from https://claude.ai/install.ps1'
            Download-OfficialScript 'https://claude.ai/install.ps1' 'claude'
            $claude = Find-Exe @(
                (Join-Path $env:USERPROFILE '.local\bin\claude.exe'),
                (Join-Path $env:APPDATA 'npm\claude.cmd')
            ) 'claude'
            $claudeVersion = if ($claude) { Version-Of $claude } else { $null }
        } catch { Problem ("Claude Code installation failed: " + $_.Exception.Message) }
    }
    if ($claudeVersion) {
        $script:status.claude = 'installed: ' + $claudeVersion
        Note ('Claude Code: ' + $claudeVersion)
        if (-not $VerifyOnly) { Ensure-UserPath $claude }
        try {
            $authRaw = (& $claude auth status 2>$null | Out-String)
            $auth = $authRaw | ConvertFrom-Json
            if ($auth.loggedIn -eq $true) {
                $script:status.claudeAuthenticated = 'yes'
                Note 'Claude Code account: signed in.'
            } else {
                $script:status.claudeAuthenticated = 'no - interactive login required'
                Note 'Claude Code sign-in is required. In PowerShell run: claude auth login'
            }
        } catch {
            $script:status.claudeAuthenticated = 'unknown - check via claude auth status'
            Note 'Claude account status could not be verified. Run: claude auth login'
        }
    } else {
        $script:status.claude = 'missing_or_failed'
        if ($VerifyOnly) { Note 'Claude Code is not installed.' }
    }

    # Native Windows Claude Code can use git for code operations.
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { Note 'Git for Windows not detected; some Claude coding actions may require Git.' }
    $script:status.gitAvailable = [bool]$git
    $script:status.result = if ($script:failures.Count) { 'partial_or_failed' } elseif (
        $script:status.claude -match '^installed' -and
        $script:status.ollama -match '^installed' -and
        ($SkipModel -or ($script:status.model -eq 'installed' -and $script:status.inference -eq 'passed'))
    ) { 'installed_or_verified' } else { 'partial_or_missing' }
} catch {
    Problem ('Bootstrap error: ' + $_.Exception.Message)
    $script:status.result = 'failed'
} finally {
    $script:status.errors = @($script:failures.ToArray())
    $script:status.timestampFinished = (Get-Date).ToString('o')
    try {
        New-Item -ItemType Directory -Path $base -Force | Out-Null
        ($script:status | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $resultFile -Encoding UTF8
        Note ("Result: " + $script:status.result)
        Note ("JSON: " + $resultFile)
        Note ("Log: " + $logFile)
    } catch { Write-Warning ('Could not persist results: ' + $_.Exception.Message) }
    if ($transcriptStarted) { Stop-Transcript | Out-Null }
    if ($mutex) {
        if ($lockAcquired) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
if ($script:status.result -eq 'installed_or_verified') { exit 0 }
exit 1
