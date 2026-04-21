param(
  [switch]$Json
)

$geminiCommand = Get-Command gemini -ErrorAction SilentlyContinue
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue

$result = [ordered]@{
  geminiInstalled = [bool]$geminiCommand
  geminiPath = if ($geminiCommand) { $geminiCommand.Source } else { $null }
  geminiVersion = $null
  nodeInstalled = [bool]$nodeCommand
  nodeVersion = $null
  npmInstalled = [bool]$npmCommand
  npmVersion = $null
}

if ($geminiCommand) {
  $result.geminiVersion = (& gemini --version 2>$null | Select-Object -First 1)
}

if ($nodeCommand) {
  $result.nodeVersion = (& node --version 2>$null | Select-Object -First 1)
}

if ($npmCommand) {
  $result.npmVersion = (& npm --version 2>$null | Select-Object -First 1)
}

if ($Json) {
  $result | ConvertTo-Json
  return
}

if ($result.geminiInstalled) {
  Write-Host "Gemini CLI: installed"
  Write-Host "Path: $($result.geminiPath)"
  Write-Host "Version: $($result.geminiVersion)"
} else {
  Write-Host "Gemini CLI: not found"
  Write-Host "Install with: npm install -g @google/gemini-cli"
}

if ($result.nodeInstalled) {
  Write-Host "Node: $($result.nodeVersion)"
} else {
  Write-Host "Node: not found"
}

if ($result.npmInstalled) {
  Write-Host "npm: $($result.npmVersion)"
} else {
  Write-Host "npm: not found"
}
