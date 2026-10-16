param([string]$SourceFile,[string]$OutputFile,[ValidateSet('word','presentation')][string]$Kind)
$ErrorActionPreference = 'Stop'
$application = $null
$document = $null
$ownedApplication = $false
$oldSecurity = $null
$oldAlerts = $null
try {
  $processName = if ($Kind -eq 'word') { 'WINWORD' } else { 'POWERPNT' }
  $existingIds = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  if ($Kind -eq 'word') {
    $application = New-Object -ComObject Word.Application
    $oldSecurity = $application.AutomationSecurity
    $oldAlerts = $application.DisplayAlerts
    $application.Visible = $false
    $application.DisplayAlerts = 0
    $application.AutomationSecurity = 3
    $document = $application.Documents.Open($SourceFile, $false, $true)
    $document.SaveAs2($OutputFile, 16)
  } else {
    $application = New-Object -ComObject PowerPoint.Application
    $oldSecurity = $application.AutomationSecurity
    $application.AutomationSecurity = 3
    $document = $application.Presentations.Open($SourceFile, -1, 0, 0)
    $document.SaveAs($OutputFile, 32)
  }
} finally {
  if ($null -ne $application) {
    # PowerPoint can reuse an existing interactive process. Only quit a process
    # started by this conversion; never close the user's other presentations.
    $ownedApplication = $existingIds.Count -eq 0
    if ($null -ne $oldSecurity) { $application.AutomationSecurity = $oldSecurity }
    if ($null -ne $oldAlerts) { $application.DisplayAlerts = $oldAlerts }
  }
  if ($null -ne $document) { $document.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
  if ($null -ne $application) { if ($ownedApplication) { $application.Quit() }; [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) }
}
