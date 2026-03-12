param(
  [string]$StatusUrl = "http://localhost:4311/api/cowork/mitm/status"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Cowork MITM status:"
Invoke-RestMethod $StatusUrl | ConvertTo-Json -Depth 8

Write-Host ""
Write-Host "Proxy registry:"
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" |
  Select-Object ProxyEnable, ProxyServer, AutoConfigURL |
  Format-List

Write-Host ""
Write-Host "Hosts block:"
$hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
  Select-String -Path $hostsPath -Pattern "Chrono Spirit Cowork MITM|api.anthropic.com|a-api.anthropic.com" | ForEach-Object { $_.Line }
}
