param(
  [switch]$KillExistingClaude
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ClaudeExecutablePath {
  $package = Get-AppxPackage Claude | Sort-Object Version -Descending | Select-Object -First 1

  if (-not $package) {
    throw "Khong tim thay Claude MSIX package tren may nay."
  }

  $exePath = Join-Path $package.InstallLocation "app\\claude.exe"
  if (Test-Path $exePath) {
    return $exePath
  }

  if (Get-Command Claude.exe -ErrorAction SilentlyContinue) {
    return "Claude.exe"
  }

  throw "Khong tim thay duong dan chay Claude.exe."
}

function Stop-ClaudeProcesses {
  $targets = @("Claude", "cowork-svc")

  foreach ($target in $targets) {
    $processes = Get-Process $target -ErrorAction SilentlyContinue

    foreach ($process in $processes) {
      try {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
        Write-Host "Stopped $($process.ProcessName) ($($process.Id))"
      } catch {
        Write-Warning "Khong the dung $($process.ProcessName) ($($process.Id)): $($_.Exception.Message)"
      }
    }
  }
}

if ($KillExistingClaude) {
  Stop-ClaudeProcesses
  Start-Sleep -Milliseconds 750
}

$env:CLAUDE_AI_URL = "https://claude-ai.staging.ant.dev"
$env:OAUTH_ENVIRONMENT = "local"
$env:ANTHROPIC_BASE_URL = "http://localhost:8000"

$exePath = Get-ClaudeExecutablePath
$workingDir = if ($exePath -eq "Claude.exe") { (Get-Location).Path } else { Split-Path -Parent $exePath }

Write-Host "Launching Claude with local Cowork OAuth override..."
Write-Host "  CLAUDE_AI_URL=$env:CLAUDE_AI_URL"
Write-Host "  OAUTH_ENVIRONMENT=$env:OAUTH_ENVIRONMENT"
Write-Host "  ANTHROPIC_BASE_URL=$env:ANTHROPIC_BASE_URL"
Write-Host "  Executable=$exePath"

Start-Process -FilePath $exePath -WorkingDirectory $workingDir | Out-Null
