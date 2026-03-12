param(
  [ValidateSet("system-proxy", "transparent")]
  [string]$Mode,
  [string]$CaDir = ""
)

. "$PSScriptRoot\cowork-mitm-common.ps1"

Assert-Administrator

$runtimeDir = Get-CoworkMitmRuntimeDir -CaDir $CaDir
$metadata = Load-CoworkMitmMetadata -RuntimeDir $runtimeDir

if (-not $metadata) {
  throw "Chua co install-state.json. Chay install-cowork-mitm.ps1 truoc."
}

$targets = @($metadata.targets)

if ($Mode -eq "system-proxy") {
  $pacPath = if ($metadata.proxy.pacPath) { $metadata.proxy.pacPath } else { Write-CoworkMitmPacFile -RuntimeDir $runtimeDir -TargetHosts $targets -ProxyPort 8877 }
  $pacUrl = Set-CoworkMitmProxyConfig -PacPath $pacPath
  Clear-CoworkMitmHostsEntries

  Set-ObjectPropertyValue -Object $metadata -Name "currentMode" -Value "system-proxy"
  Set-ObjectPropertyValue -Object $metadata.proxy -Name "installed" -Value $true
  Set-ObjectPropertyValue -Object $metadata.proxy -Name "pacPath" -Value $pacPath
  Set-ObjectPropertyValue -Object $metadata.proxy -Name "autoConfigUrl" -Value $pacUrl
  Set-ObjectPropertyValue -Object $metadata.hosts -Name "installed" -Value $false
} else {
  Clear-CoworkMitmProxyConfig
  Set-CoworkMitmHostsEntries -TargetHosts $targets

  Set-ObjectPropertyValue -Object $metadata -Name "currentMode" -Value "transparent"
  Set-ObjectPropertyValue -Object $metadata.proxy -Name "installed" -Value $false
  Set-ObjectPropertyValue -Object $metadata.hosts -Name "installed" -Value $true
}

Save-CoworkMitmMetadata -RuntimeDir $runtimeDir -Metadata $metadata
Write-Host "Da chuyen Cowork MITM sang mode: $Mode"
