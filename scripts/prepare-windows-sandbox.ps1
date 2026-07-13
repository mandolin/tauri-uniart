[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$InstallerPath,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageDirectory = Join-Path $projectRoot 'output/windows-sandbox-smoke'
$sandboxInstaller = Join-Path $stageDirectory (Split-Path -Leaf $InstallerPath)
$sandboxScript = Join-Path $stageDirectory 'smoke-nsis-installer.ps1'
$resultPath = 'C:\UnicodeArtAppCandidate\sandbox-result.json'

New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
Copy-Item -LiteralPath $InstallerPath -Destination $sandboxInstaller -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'smoke-nsis-installer.ps1') -Destination $sandboxScript -Force
Remove-Item -LiteralPath (Join-Path $stageDirectory 'sandbox-result.json') -Force -ErrorAction SilentlyContinue

$sandboxConfig = @"
<Configuration>
  <Networking>Enable</Networking>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$stageDirectory</HostFolder>
      <SandboxFolder>C:\UnicodeArtAppCandidate</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File C:\UnicodeArtAppCandidate\smoke-nsis-installer.ps1 -TargetInstaller &quot;C:\UnicodeArtAppCandidate\$(Split-Path -Leaf $sandboxInstaller)&quot; -ExpectedTargetVersion $ExpectedVersion -ResultPath $resultPath</Command>
  </LogonCommand>
</Configuration>
"@

$sandboxConfigPath = Join-Path $stageDirectory 'UnicodeArtAppInstallerSmoke.wsb'
Set-Content -LiteralPath $sandboxConfigPath -Value $sandboxConfig -Encoding utf8

Write-Host "Windows Sandbox 验收包已准备：$sandboxConfigPath"
Write-Host '启用 Windows Sandbox 并重启后，双击 .wsb 文件；验收结果会写入同目录 sandbox-result.json。'
