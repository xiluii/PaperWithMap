$ErrorActionPreference = 'Stop'
$fixtureRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\tests\fixtures\assets'))
[void][IO.Directory]::CreateDirectory($fixtureRoot)
if ((Get-Process WINWORD,POWERPNT -ErrorAction SilentlyContinue)) { throw 'Close Office before generating fixtures; this script never changes an existing Office session.' }
$ppt = $null; $presentation = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $ppt.AutomationSecurity = 3
  $presentation = $ppt.Presentations.Add(0)
  foreach ($index in 1..3) {
    $slide = $presentation.Slides.Add($index,12)
    $shape = $slide.Shapes.AddTextbox(1,70,100,600,200)
    $shape.TextFrame.TextRange.Text = "Paperly local presentation`nSlide $index of 3`nContinuous reading and linked notes"
    $shape.TextFrame.TextRange.Font.Size = 30
  }
  $presentation.SaveAs((Join-Path $fixtureRoot 'presentation-sample.pptx'),24)
  $presentation.SaveAs((Join-Path $fixtureRoot 'legacy-presentation.ppt'),1)
} finally {
  if ($null -ne $presentation) { $presentation.Close() }
  if ($null -ne $ppt) { $ppt.Quit() }
}
& node (Join-Path $PSScriptRoot 'sanitize-office-fixtures.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Could not anonymize the generated fixture metadata.' }
Write-Output "Created anonymized PowerPoint fixtures in $fixtureRoot"
