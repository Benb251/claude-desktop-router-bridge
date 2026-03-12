param(
  [string]$CaDir = "",
  [int]$ProxyPort = 8877,
  [string]$TargetHosts = "api.anthropic.com,a-api.anthropic.com"
)

. "$PSScriptRoot\cowork-mitm-common.ps1"

Assert-Administrator

$runtimeDir = Get-CoworkMitmRuntimeDir -CaDir $CaDir
Ensure-Directory -Path $runtimeDir

$targets = $TargetHosts.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$metadata = Load-CoworkMitmMetadata -RuntimeDir $runtimeDir
if (-not $metadata) {
  $metadata = [pscustomobject]@{
    version = 1
    currentMode = "system-proxy"
    createdAt = (Get-Date).ToString("o")
    proxy = [pscustomobject]@{}
    hosts = [pscustomobject]@{}
    leaves = [pscustomobject]@{}
  }
}

if (-not (Test-ObjectProperty -Object $metadata -Name "proxy")) {
  $metadata | Add-Member -NotePropertyName proxy -NotePropertyValue ([pscustomobject]@{})
}
if (-not (Test-ObjectProperty -Object $metadata -Name "hosts")) {
  $metadata | Add-Member -NotePropertyName hosts -NotePropertyValue ([pscustomobject]@{})
}
if (-not (Test-ObjectProperty -Object $metadata -Name "leaves")) {
  $metadata | Add-Member -NotePropertyName leaves -NotePropertyValue ([pscustomobject]@{})
}

$root = Get-OrCreateRootCertificate -RuntimeDir $runtimeDir
$leaves = @{}
foreach ($target in $targets) {
  $existingLeafMetadata = $null
  if (Test-ObjectProperty -Object $metadata.leaves -Name $target) {
    $existingLeafMetadata = Get-ObjectPropertyValue -Object $metadata.leaves -Name $target
  }
  $leaf = Get-OrCreateLeafCertificate -RuntimeDir $runtimeDir -DnsHost $target -RootCertificate $root.Certificate -ExistingLeafMetadata $existingLeafMetadata
  $leaves[$target] = [pscustomobject]@{
    thumbprint = $leaf.Thumbprint
    pfxPath = $leaf.PfxPath
    passphrase = $leaf.Passphrase
  }
}

$pacPath = Write-CoworkMitmPacFile -RuntimeDir $runtimeDir -TargetHosts $targets -ProxyPort $ProxyPort
$pacUrl = Set-CoworkMitmProxyConfig -PacPath $pacPath

Set-ObjectPropertyValue -Object $metadata -Name "version" -Value 1
Set-ObjectPropertyValue -Object $metadata -Name "currentMode" -Value "system-proxy"
Set-ObjectPropertyValue -Object $metadata -Name "installedAt" -Value ((Get-Date).ToString("o"))
Set-ObjectPropertyValue -Object $metadata -Name "targets" -Value $targets
Set-ObjectPropertyValue -Object $metadata -Name "proxy" -Value ([pscustomobject]@{
  installed = $true
  pacPath = $pacPath
  autoConfigUrl = $pacUrl
  proxyPort = $ProxyPort
})
Set-ObjectPropertyValue -Object $metadata -Name "hosts" -Value ([pscustomobject]@{
  installed = $false
})
Set-ObjectPropertyValue -Object $metadata -Name "root" -Value ([pscustomobject]@{
  thumbprint = $root.Certificate.Thumbprint
  subject = $root.Certificate.Subject
  cerPath = $root.CerPath
})
Set-ObjectPropertyValue -Object $metadata -Name "leaves" -Value ([pscustomobject]$leaves)

Save-CoworkMitmMetadata -RuntimeDir $runtimeDir -Metadata $metadata

Write-Host "Cowork MITM install xong."
Write-Host "  RuntimeDir: $runtimeDir"
Write-Host "  Mode: system-proxy"
Write-Host "  PAC: $pacPath"
Write-Host "  Targets: $($targets -join ', ')"
Write-Host ""
Write-Host "Run:"
Write-Host "  `$env:COWORK_MITM_ENABLED='1'; npm start"
Write-Host "  Invoke-RestMethod http://localhost:4311/api/cowork/mitm/status | ConvertTo-Json -Depth 8"
