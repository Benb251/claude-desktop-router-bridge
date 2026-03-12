Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Script nay can chay bang quyen Administrator."
  }
}

function Get-CoworkMitmRuntimeDir {
  param(
    [string]$CaDir
  )

  if ($CaDir) {
    return $CaDir
  }

  return Join-Path $env:LOCALAPPDATA "ChronoSpirit\cowork-mitm"
}

function Get-CoworkMitmMetadataPath {
  param(
    [string]$RuntimeDir
  )

  return Join-Path $RuntimeDir "install-state.json"
}

function Ensure-Directory {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Convert-PathToFileUrl {
  param(
    [string]$Path
  )

  $normalized = $Path.Replace('\', '/')
  if ($normalized -notmatch '^/') {
    $normalized = "/$normalized"
  }
  return "file://$normalized"
}

function Load-CoworkMitmMetadata {
  param(
    [string]$RuntimeDir
  )

  $metadataPath = Get-CoworkMitmMetadataPath -RuntimeDir $RuntimeDir
  if (-not (Test-Path $metadataPath)) {
    return $null
  }

  return Get-Content $metadataPath -Raw | ConvertFrom-Json
}

function Test-ObjectProperty {
  param(
    [object]$Object,
    [string]$Name
  )

  if (-not $Object) {
    return $false
  }

  return $Object.PSObject.Properties.Match($Name).Count -gt 0
}

function Get-ObjectPropertyValue {
  param(
    [object]$Object,
    [string]$Name
  )

  if (-not (Test-ObjectProperty -Object $Object -Name $Name)) {
    return $null
  }

  return $Object.PSObject.Properties[$Name].Value
}

function Set-ObjectPropertyValue {
  param(
    [object]$Object,
    [string]$Name,
    [object]$Value
  )

  if (-not $Object) {
    throw "Khong the set property '$Name' tren object null."
  }

  if (Test-ObjectProperty -Object $Object -Name $Name) {
    $Object.PSObject.Properties[$Name].Value = $Value
  } else {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
  }
}

function Save-CoworkMitmMetadata {
  param(
    [string]$RuntimeDir,
    [psobject]$Metadata
  )

  $metadataPath = Get-CoworkMitmMetadataPath -RuntimeDir $RuntimeDir
  $Metadata | ConvertTo-Json -Depth 8 | Set-Content -Path $metadataPath -Encoding UTF8
}

function Get-OrCreateRootCertificate {
  param(
    [string]$RuntimeDir
  )

  $certDir = Join-Path $RuntimeDir "certs"
  Ensure-Directory -Path $certDir
  $rootCerPath = Join-Path $certDir "chrono-spirit-cowork-root.cer"
  $subject = "CN=Chrono Spirit Cowork MITM Root"

  $existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject } | Sort-Object NotAfter -Descending | Select-Object -First 1

  if (-not $existing) {
    $existing = New-SelfSignedCertificate `
      -Type Custom `
      -Subject $subject `
      -KeyAlgorithm RSA `
      -KeyLength 2048 `
      -HashAlgorithm sha256 `
      -KeyExportPolicy Exportable `
      -KeyUsageProperty Sign `
      -KeyUsage CertSign,CRLSign,DigitalSignature `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -FriendlyName "Chrono Spirit Cowork MITM Root" `
      -TextExtension @(
        "2.5.29.19={critical}{text}ca=true&pathlength=1"
      ) `
      -NotAfter (Get-Date).AddYears(5)
  }

  Export-Certificate -Cert $existing -FilePath $rootCerPath -Force | Out-Null

  $alreadyTrusted = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $existing.Thumbprint } | Select-Object -First 1
  if (-not $alreadyTrusted) {
    Import-Certificate -FilePath $rootCerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  }

  return [pscustomobject]@{
    Certificate = $existing
    CerPath = $rootCerPath
  }
}

function Get-OrCreateLeafCertificate {
  param(
    [string]$RuntimeDir,
    [string]$DnsHost,
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$RootCertificate,
    [psobject]$ExistingLeafMetadata
  )

  $certDir = Join-Path $RuntimeDir "certs"
  Ensure-Directory -Path $certDir

  if ($ExistingLeafMetadata -and $ExistingLeafMetadata.pfxPath -and (Test-Path $ExistingLeafMetadata.pfxPath)) {
    return [pscustomobject]@{
      Certificate = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $ExistingLeafMetadata.thumbprint } | Select-Object -First 1
      PfxPath = $ExistingLeafMetadata.pfxPath
      Passphrase = $ExistingLeafMetadata.passphrase
      Thumbprint = $ExistingLeafMetadata.thumbprint
    }
  }

  $leaf = New-SelfSignedCertificate `
    -Type Custom `
    -DnsName $DnsHost `
    -Subject "CN=$DnsHost" `
    -Signer $RootCertificate `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm sha256 `
    -KeyExportPolicy Exportable `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -FriendlyName "Chrono Spirit Cowork MITM Leaf $DnsHost" `
    -TextExtension @(
      "2.5.29.19={critical}{text}ca=false",
      "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
    ) `
    -NotAfter (Get-Date).AddYears(2)

  $passphrase = [guid]::NewGuid().ToString("N")
  $securePassphrase = ConvertTo-SecureString -String $passphrase -AsPlainText -Force
  $fileSafeHost = $DnsHost.Replace('.', '-')
  $pfxPath = Join-Path $certDir "$fileSafeHost.pfx"

  Export-PfxCertificate -Cert $leaf -FilePath $pfxPath -Password $securePassphrase -Force | Out-Null

  return [pscustomobject]@{
    Certificate = $leaf
    PfxPath = $pfxPath
    Passphrase = $passphrase
    Thumbprint = $leaf.Thumbprint
  }
}

function Write-CoworkMitmPacFile {
  param(
    [string]$RuntimeDir,
    [string[]]$TargetHosts,
    [int]$ProxyPort
  )

  $pacPath = Join-Path $RuntimeDir "cowork-mitm.pac"
  $checks = ($TargetHosts | ForEach-Object { "host === '$_'" }) -join " || "

  @"
function FindProxyForURL(url, host) {
  if ($checks) {
    return "PROXY 127.0.0.1:$ProxyPort";
  }
  return "DIRECT";
}
"@ | Set-Content -Path $pacPath -Encoding UTF8

  return $pacPath
}

function Set-CoworkMitmProxyConfig {
  param(
    [string]$PacPath
  )

  $fileUrl = Convert-PathToFileUrl -Path $PacPath
  $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"

  Set-ItemProperty -Path $regPath -Name AutoConfigURL -Value $fileUrl
  Set-ItemProperty -Path $regPath -Name ProxyEnable -Value 0
  Remove-ItemProperty -Path $regPath -Name ProxyServer -ErrorAction SilentlyContinue

  return $fileUrl
}

function Clear-CoworkMitmProxyConfig {
  $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"

  Remove-ItemProperty -Path $regPath -Name AutoConfigURL -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $regPath -Name ProxyEnable -Value 0
  Remove-ItemProperty -Path $regPath -Name ProxyServer -ErrorAction SilentlyContinue
}

function Set-CoworkMitmHostsEntries {
  param(
    [string[]]$TargetHosts
  )

  $hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
  $beginMarker = "# BEGIN Chrono Spirit Cowork MITM"
  $endMarker = "# END Chrono Spirit Cowork MITM"

  $existing = if (Test-Path $hostsPath) { Get-Content $hostsPath -Raw } else { "" }
  $withoutBlock = [regex]::Replace($existing, "(?ms)\r?\n?$([regex]::Escape($beginMarker)).*?$([regex]::Escape($endMarker))\r?\n?", "")

  $entries = @($beginMarker)
  foreach ($host in $TargetHosts) {
    $entries += "127.0.0.1 $host"
    $entries += "::1 $host"
  }
  $entries += $endMarker

  $content = ($withoutBlock.TrimEnd() + "`r`n" + ($entries -join "`r`n") + "`r`n")
  Set-Content -Path $hostsPath -Value $content -Encoding ASCII
}

function Clear-CoworkMitmHostsEntries {
  $hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
  $beginMarker = "# BEGIN Chrono Spirit Cowork MITM"
  $endMarker = "# END Chrono Spirit Cowork MITM"

  if (-not (Test-Path $hostsPath)) {
    return
  }

  $existing = Get-Content $hostsPath -Raw
  $updated = [regex]::Replace($existing, "(?ms)\r?\n?$([regex]::Escape($beginMarker)).*?$([regex]::Escape($endMarker))\r?\n?", "`r`n")
  Set-Content -Path $hostsPath -Value ($updated.TrimEnd() + "`r`n") -Encoding ASCII
}
