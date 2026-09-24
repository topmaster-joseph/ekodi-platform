param(
  [switch]$Install,
  [switch]$RunOnce
)

$ErrorActionPreference = 'Stop'
$GuestAgentVersion = '1.2.0'
$Root = Join-Path $env:ProgramData 'EKODI\GuestAgent'
$AgentPath = Join-Path $Root 'ekodi-isolated-guest-agent.ps1'
$TaskPath = Join-Path $Root 'task.json'
$ReceiptPath = Join-Path $Root 'receipt.json'
$TaskName = 'EKODI Isolated Guest Agent'

function Get-Sha256String([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Test-IsSystem {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return $identity.User.Value -eq 'S-1-5-18'
  } catch { return $false }
}

function Read-ValidatedTask {
  if (-not (Test-Path -LiteralPath $TaskPath)) { return $null }
  $raw = Get-Content -LiteralPath $TaskPath -Raw -Encoding UTF8
  $task = $raw | ConvertFrom-Json
  if ([int]$task.schemaVersion -ne 1) { throw 'guest_task_schema_invalid' }
  $allowedTypes = @('guest.runtime.probe','guest.ui.probe','guest.session.execute')
  if ($allowedTypes -notcontains [string]$task.type) { throw 'guest_task_type_forbidden' }
  if ([string]$task.taskId -notmatch '^[a-f0-9]{32}$') { throw 'guest_task_id_invalid' }
  if ([string]$task.nonce -notmatch '^[a-f0-9]{64}$') { throw 'guest_task_nonce_invalid' }
  if ([string]$task.networkPolicy -ne 'none') { throw 'guest_task_network_policy_invalid' }
  if ([string]$task.type -eq 'guest.session.execute') {
    if ([string]$task.operation -ne 'ui.text.roundtrip') { throw 'guest_session_operation_forbidden' }
    $text = [string]$task.text
    if ($text -notmatch '^EKODI_SESSION_[A-Z0-9_-]{8,64}$') { throw 'guest_session_text_invalid' }
  }
  $expires = [DateTime]::Parse([string]$task.expiresAt).ToUniversalTime()
  $now = [DateTime]::UtcNow
  if ($expires -le $now -or $expires -gt $now.AddMinutes(15)) { throw 'guest_task_expiry_invalid' }
  return @{ raw = $raw; task = $task; expires = $expires }
}

function Get-NetworkEvidence {
  $adapters = @()
  try { $adapters = @(Get-NetAdapter -ErrorAction Stop) } catch { }
  $up = @($adapters | Where-Object { [string]$_.Status -eq 'Up' })
  return @{
    adapterCount = $adapters.Count
    upAdapterCount = $up.Count
    noNetworkAdapter = ($adapters.Count -eq 0)
    noActiveNetwork = ($up.Count -eq 0)
  }
}

function Invoke-GuestRuntimeProbe($ValidatedTask) {
  $task = $ValidatedTask.task
  $network = Get-NetworkEvidence
  if (-not $network.noNetworkAdapter -or -not $network.noActiveNetwork) {
    throw 'guest_network_isolation_failed'
  }

  $receipt = @{
    schemaVersion = 1
    ok = $true
    mode = 'ekodi-isolated-guest-runtime-canary'
    guestAgentVersion = $GuestAgentVersion
    taskType = [string]$task.type
    taskId = [string]$task.taskId
    nonceSha256 = Get-Sha256String ([string]$task.nonce)
    taskSha256 = Get-Sha256String ([string]$ValidatedTask.raw)
    executedAsSystem = [bool](Test-IsSystem)
    processId = $PID
    sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    computerName = $env:COMPUTERNAME
    osVersion = [Environment]::OSVersion.VersionString
    powershellVersion = [string]$PSVersionTable.PSVersion
    networkAdapterCount = [int]$network.adapterCount
    activeNetworkAdapterCount = [int]$network.upAdapterCount
    noNetworkAdapter = [bool]$network.noNetworkAdapter
    noActiveNetwork = [bool]$network.noActiveNetwork
    interactiveDesktopUsed = $false
    sharedInteractiveDesktop = $false
    clipboardShared = $false
    userInputInjection = $false
    credentialCollection = $false
    hostProfileMounted = $false
    mutationScope = 'ephemeral-guest-only'
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  if (-not $receipt.executedAsSystem) { throw 'guest_agent_not_system' }
  $temp = "$ReceiptPath.tmp"
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $ReceiptPath -Force
  Remove-Item -LiteralPath $TaskPath -Force -ErrorAction SilentlyContinue
  return $receipt
}

function Invoke-GuestUiProbe($ValidatedTask) {
  $task = $ValidatedTask.task
  $network = Get-NetworkEvidence
  if (-not $network.noNetworkAdapter -or -not $network.noActiveNetwork) {
    throw 'guest_network_isolation_failed'
  }
  if (-not (Test-IsSystem)) { throw 'guest_agent_not_system' }

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "EKODI_UI_$([string]$task.taskId)"
  $form.Size = New-Object System.Drawing.Size(320,150)
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $form.Location = New-Object System.Drawing.Point(0,0)
  $form.ShowInTaskbar = $false
  $form.MinimizeBox = $false
  $form.MaximizeBox = $false

  $button = New-Object System.Windows.Forms.Button
  $button.Text = 'Run'
  $button.AccessibleName = 'EKODI_UI_ACTION'
  $button.Location = New-Object System.Drawing.Point(18,22)
  $button.Size = New-Object System.Drawing.Size(100,32)

  $resultLabel = New-Object System.Windows.Forms.Label
  $resultLabel.Text = 'PENDING'
  $resultLabel.AccessibleName = 'EKODI_UI_RESULT'
  $resultLabel.Location = New-Object System.Drawing.Point(18,70)
  $resultLabel.AutoSize = $true

  $button.Add_Click({ $resultLabel.Text = 'EKODI_UI_OK' })
  [void]$form.Controls.Add($button)
  [void]$form.Controls.Add($resultLabel)

  $windowHandleObserved = $false
  $windowFound = $false
  $buttonFound = $false
  $invokePatternAvailable = $false
  $controlInvoked = $false
  $windowClosed = $false
  try {
    [void]$form.Show()
    [System.Windows.Forms.Application]::DoEvents()
    $windowHandleObserved = ($form.Handle -ne [IntPtr]::Zero)

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $form.Text
    )
    $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $windowCondition)
    $windowFound = ($null -ne $window)
    if (-not $windowFound) { throw 'guest_ui_window_not_found' }

    $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      'Run'
    )
    $buttonElement = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    $buttonFound = ($null -ne $buttonElement)
    if (-not $buttonFound) { throw 'guest_ui_button_not_found' }

    $pattern = $buttonElement.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invokePatternAvailable = ($null -ne $pattern)
    if (-not $invokePatternAvailable) { throw 'guest_ui_invoke_pattern_missing' }
    ([System.Windows.Automation.InvokePattern]$pattern).Invoke()

    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
      [System.Windows.Forms.Application]::DoEvents()
      if ($resultLabel.Text -eq 'EKODI_UI_OK') { $controlInvoked = $true; break }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $controlInvoked) { throw 'guest_ui_control_invoke_failed' }
  } finally {
    try { $form.Close() } catch { }
    try { $form.Dispose() } catch { }
    $windowClosed = $true
  }

  $receipt = @{
    schemaVersion = 1
    ok = $true
    mode = 'ekodi-isolated-guest-ui-canary'
    guestAgentVersion = $GuestAgentVersion
    taskType = [string]$task.type
    taskId = [string]$task.taskId
    nonceSha256 = Get-Sha256String ([string]$task.nonce)
    taskSha256 = Get-Sha256String ([string]$ValidatedTask.raw)
    executedAsSystem = [bool](Test-IsSystem)
    processId = $PID
    sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    networkAdapterCount = [int]$network.adapterCount
    activeNetworkAdapterCount = [int]$network.upAdapterCount
    noNetworkAdapter = [bool]$network.noNetworkAdapter
    noActiveNetwork = [bool]$network.noActiveNetwork
    guestUiSurfaceUsed = $true
    hostInteractiveDesktopUsed = $false
    sharedInteractiveDesktop = $false
    semanticUiAutomation = $true
    lowLevelInputInjection = $false
    clipboardShared = $false
    credentialCollection = $false
    hostProfileMounted = $false
    syntheticUiOnly = $true
    windowHandleObserved = [bool]$windowHandleObserved
    windowFound = [bool]$windowFound
    buttonFound = [bool]$buttonFound
    invokePatternAvailable = [bool]$invokePatternAvailable
    controlInvoked = [bool]$controlInvoked
    resultCode = [string]$resultLabel.Text
    windowClosed = [bool]$windowClosed
    mutationScope = 'ephemeral-guest-ui-only'
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  $temp = "$ReceiptPath.tmp"
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $ReceiptPath -Force
  Remove-Item -LiteralPath $TaskPath -Force -ErrorAction SilentlyContinue
  return $receipt
}

function Invoke-GuestSessionExecute($ValidatedTask) {
  $task = $ValidatedTask.task
  $network = Get-NetworkEvidence
  if (-not $network.noNetworkAdapter -or -not $network.noActiveNetwork) { throw 'guest_network_isolation_failed' }
  if (-not (Test-IsSystem)) { throw 'guest_agent_not_system' }
  if ([string]$task.operation -ne 'ui.text.roundtrip') { throw 'guest_session_operation_forbidden' }

  $expectedText = [string]$task.text
  if ($expectedText -notmatch '^EKODI_SESSION_[A-Z0-9_-]{8,64}$') { throw 'guest_session_text_invalid' }

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "EKODI_SESSION_$([string]$task.taskId)"
  $form.Size = New-Object System.Drawing.Size(390,190)
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $form.Location = New-Object System.Drawing.Point(0,0)
  $form.ShowInTaskbar = $false
  $form.MinimizeBox = $false
  $form.MaximizeBox = $false

  $input = New-Object System.Windows.Forms.TextBox
  $input.AccessibleName = 'EKODI_SESSION_INPUT'
  $input.Location = New-Object System.Drawing.Point(18,20)
  $input.Size = New-Object System.Drawing.Size(330,28)

  $button = New-Object System.Windows.Forms.Button
  $button.Text = 'Apply'
  $button.AccessibleName = 'EKODI_SESSION_APPLY'
  $button.Location = New-Object System.Drawing.Point(18,62)
  $button.Size = New-Object System.Drawing.Size(100,32)

  $output = New-Object System.Windows.Forms.Label
  $output.AccessibleName = 'EKODI_SESSION_OUTPUT'
  $output.Text = ''
  $output.Location = New-Object System.Drawing.Point(18,108)
  $output.AutoSize = $true

  $status = New-Object System.Windows.Forms.Label
  $status.AccessibleName = 'EKODI_SESSION_STATUS'
  $status.Text = 'PENDING'
  $status.Location = New-Object System.Drawing.Point(230,70)
  $status.AutoSize = $true

  $button.Add_Click({
    $output.Text = $input.Text
    $status.Text = 'EKODI_SESSION_OK'
  })
  [void]$form.Controls.Add($input)
  [void]$form.Controls.Add($button)
  [void]$form.Controls.Add($output)
  [void]$form.Controls.Add($status)

  $windowFound = $false
  $inputFound = $false
  $buttonFound = $false
  $valuePatternAvailable = $false
  $invokePatternAvailable = $false
  $valueSet = $false
  $controlInvoked = $false
  $roundTripMatched = $false
  $windowClosed = $false
  try {
    [void]$form.Show()
    [System.Windows.Forms.Application]::DoEvents()

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $form.Text
    )
    $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $windowCondition)
    $windowFound = ($null -ne $window)
    if (-not $windowFound) { throw 'guest_session_window_not_found' }

    $inputCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      'EKODI_SESSION_INPUT'
    )
    $inputElement = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $inputCondition)
    $inputFound = ($null -ne $inputElement)
    if (-not $inputFound) { throw 'guest_session_input_not_found' }

    $valuePattern = $inputElement.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $valuePatternAvailable = ($null -ne $valuePattern)
    if (-not $valuePatternAvailable) { throw 'guest_session_value_pattern_missing' }
    ([System.Windows.Automation.ValuePattern]$valuePattern).SetValue($expectedText)
    [System.Windows.Forms.Application]::DoEvents()
    $valueSet = ($input.Text -eq $expectedText)
    if (-not $valueSet) { throw 'guest_session_value_set_failed' }

    $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      'Apply'
    )
    $buttonElement = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    $buttonFound = ($null -ne $buttonElement)
    if (-not $buttonFound) { throw 'guest_session_button_not_found' }

    $invokePattern = $buttonElement.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invokePatternAvailable = ($null -ne $invokePattern)
    if (-not $invokePatternAvailable) { throw 'guest_session_invoke_pattern_missing' }
    ([System.Windows.Automation.InvokePattern]$invokePattern).Invoke()

    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
      [System.Windows.Forms.Application]::DoEvents()
      if ($status.Text -eq 'EKODI_SESSION_OK') { $controlInvoked = $true; break }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $controlInvoked) { throw 'guest_session_control_invoke_failed' }

    $roundTripMatched = ($output.Text -eq $expectedText)
    if (-not $roundTripMatched) { throw 'guest_session_roundtrip_failed' }
  } finally {
    try { $form.Close() } catch { }
    try { $form.Dispose() } catch { }
    $windowClosed = $true
  }

  $receipt = @{
    schemaVersion = 1
    ok = $true
    mode = 'ekodi-isolated-guest-session-execution'
    guestAgentVersion = $GuestAgentVersion
    taskType = [string]$task.type
    taskId = [string]$task.taskId
    operation = [string]$task.operation
    nonceSha256 = Get-Sha256String ([string]$task.nonce)
    taskSha256 = Get-Sha256String ([string]$ValidatedTask.raw)
    executedAsSystem = [bool](Test-IsSystem)
    processId = $PID
    sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    noNetworkAdapter = [bool]$network.noNetworkAdapter
    noActiveNetwork = [bool]$network.noActiveNetwork
    guestUiSurfaceUsed = $true
    hostInteractiveDesktopUsed = $false
    sharedInteractiveDesktop = $false
    semanticUiAutomation = $true
    lowLevelInputInjection = $false
    clipboardShared = $false
    credentialCollection = $false
    hostProfileMounted = $false
    valuePatternAvailable = [bool]$valuePatternAvailable
    invokePatternAvailable = [bool]$invokePatternAvailable
    valueSet = [bool]$valueSet
    controlInvoked = [bool]$controlInvoked
    roundTripMatched = [bool]$roundTripMatched
    inputSha256 = Get-Sha256String $expectedText
    outputSha256 = Get-Sha256String ([string]$output.Text)
    textLength = [int]$expectedText.Length
    resultCode = [string]$status.Text
    windowFound = [bool]$windowFound
    inputFound = [bool]$inputFound
    buttonFound = [bool]$buttonFound
    windowClosed = [bool]$windowClosed
    mutationScope = 'ephemeral-guest-session-only'
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  $temp = "$ReceiptPath.tmp"
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $ReceiptPath -Force
  Remove-Item -LiteralPath $TaskPath -Force -ErrorAction SilentlyContinue
  return $receipt
}

function Install-GuestAgent {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'guest_agent_install_requires_admin'
  }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $source = [IO.Path]::GetFullPath($PSCommandPath)
  $destination = [IO.Path]::GetFullPath($AgentPath)
  if ($source -ne $destination) { Copy-Item -LiteralPath $source -Destination $AgentPath -Force }

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -RunOnce"
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Seconds 20) -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Force | Out-Null
  Write-Host "EKODI Isolated Guest Agent $GuestAgentVersion installed."
}

if ($Install) {
  Install-GuestAgent
  exit 0
}
if ($RunOnce) {
  try {
    $task = Read-ValidatedTask
    if ($null -ne $task) {
      switch ([string]$task.task.type) {
        'guest.runtime.probe' { [void](Invoke-GuestRuntimeProbe $task) }
        'guest.ui.probe' { [void](Invoke-GuestUiProbe $task) }
        'guest.session.execute' { [void](Invoke-GuestSessionExecute $task) }
        default { throw 'guest_task_type_forbidden' }
      }
    }
    exit 0
  } catch {
    $failure = @{
      schemaVersion = 1
      ok = $false
      mode = 'ekodi-isolated-guest-task-failure'
      guestAgentVersion = $GuestAgentVersion
      error = $_.Exception.Message
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    $failure | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
    exit 1
  }
}
Write-Host 'Use -Install or -RunOnce.'
