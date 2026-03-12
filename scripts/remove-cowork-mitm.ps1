param(
  [string]$CaDir = "",
  [switch]$KeepCertificates
)

. "$PSScriptRoot\cowork-mitm-common.ps1"

Assert-Administrator

$runtimeDir = Get-CoworkMitmRuntimeDir -CaDir $CaDir
$metadata = Load-CoworkMitmMetadata -RuntimeDir $runtimeDir

Clear-CoworkMitmProxyConfig
Clear-CoworkMitmHostsEntries

if ($metadata -and -not $KeepCertificates) {
  if ((Get-ObjectPropertyValue -Object $metadata -Name "root") -and (Get-ObjectPropertyValue -Object $metadata.root -Name "thumbprint")) {
    Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $metadata.root.thumbprint } | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $metadata.root.thumbprint } | Remove-Item -Force -ErrorAction SilentlyContinue
  }

  if (Test-ObjectProperty -Object $metadata -Name "leaves") {
    foreach ($property in $metadata.leaves.PSObject.Properties) {
      $thumbprint = Get-ObjectPropertyValue -Object $property.Value -Name "thumbprint"
      if ($thumbprint) {
        Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $thumbprint } | Remove-Item -Force -ErrorAction SilentlyContinue
      }
    }
  }

  Remove-Item -Path $runtimeDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Cowork MITM da duoc go."
