[CmdletBinding()]
param(
    [string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$applicationVersion = $packageManifest.version
$releaseAssetsRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'output/release-assets'))
$stageDirectory = [System.IO.Path]::GetFullPath((Join-Path $releaseAssetsRoot $applicationVersion))

if (-not $stageDirectory.StartsWith($releaseAssetsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw '发布资产目录超出项目 output/release-assets 范围。'
}

function Get-CurrentEvidenceDirectory {
    param([string]$RequestedDirectory)

    if ($RequestedDirectory) {
        $resolved = Resolve-Path -LiteralPath $RequestedDirectory -ErrorAction Stop
        return $resolved.Path
    }

    $evidenceRoot = Join-Path $projectRoot 'output/compatible-evidence'
    $candidates = Get-ChildItem -LiteralPath $evidenceRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
    foreach ($candidate in $candidates) {
        $summaryPath = Join-Path $candidate.FullName 'summary.json'
        if ((Test-Path -LiteralPath $summaryPath) -and ((Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json).version -eq $applicationVersion)) {
            return $candidate.FullName
        }
    }

    throw "未找到版本 $applicationVersion 的 Compatible 发布证据；请先执行 npm run evidence。"
}

function Copy-RequiredAsset {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$DestinationDirectory
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "缺少发布资产：$Source"
    }
    Copy-Item -LiteralPath $Source -Destination $DestinationDirectory -Force
}

Push-Location $projectRoot
try {
    # 先确认跨语言版本、Core 范围和锁定版本都仍是当前候选的发布契约。
    & npm run release:verify
    if ($LASTEXITCODE -ne 0) {
        throw '发布契约检查失败。'
    }

    $installer = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis') -Filter "*_$applicationVersion`_*-setup.exe" -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $installer) {
        throw "未找到版本 $applicationVersion 的 NSIS 安装器。"
    }

    $evidencePath = Get-CurrentEvidenceDirectory -RequestedDirectory $EvidenceDirectory
    $summary = Get-Content -LiteralPath (Join-Path $evidencePath 'summary.json') -Raw | ConvertFrom-Json
    $installerHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
    $sourceCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
        throw '无法读取当前 Git 提交，拒绝准备发布资产。'
    }
    if ($summary.version -ne $applicationVersion -or $summary.installerSha256 -ne $installerHash -or $summary.sourceCommit -ne $sourceCommit) {
        throw '候选安装器与 Compatible 证据的版本、SHA-256 或源码提交不一致。请重新执行 npm run evidence。'
    }

    if (Test-Path -LiteralPath $stageDirectory) {
        # 仅重建项目 output 下的受控 staging 目录，禁止影响其他路径。
        Remove-Item -LiteralPath $stageDirectory -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null

    Copy-RequiredAsset -Source $installer.FullName -DestinationDirectory $stageDirectory
    foreach ($fileName in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) {
        Copy-RequiredAsset -Source (Join-Path $projectRoot $fileName) -DestinationDirectory $stageDirectory
    }
    foreach ($fileName in @('node-runtime.cyclonedx.json', 'cargo-metadata.json', 'release-contract.json', 'release-assets.json', 'summary.json')) {
        Copy-RequiredAsset -Source (Join-Path $evidencePath $fileName) -DestinationDirectory $stageDirectory
    }

    $assetFiles = Get-ChildItem -LiteralPath $stageDirectory -File | Sort-Object Name
    $releaseManifest = [ordered]@{
        product = 'UnicodeArt App'
        version = $applicationVersion
        coreRange = $packageManifest.dependencies.'unicode-art-js'
        sourceCommit = $sourceCommit
        evidenceDirectory = Split-Path -Leaf $evidencePath
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        assets = @($assetFiles | ForEach-Object {
            [ordered]@{
                name = $_.Name
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
                size = $_.Length
            }
        })
    }
    $releaseManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $stageDirectory 'release-manifest.json') -Encoding utf8

    Get-ChildItem -LiteralPath $stageDirectory -File |
        Where-Object { $_.Name -ne 'SHA256SUMS.txt' } |
        Sort-Object Name |
        ForEach-Object { "$(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Select-Object -ExpandProperty Hash)  $($_.Name)" } |
        Set-Content -LiteralPath (Join-Path $stageDirectory 'SHA256SUMS.txt') -Encoding ascii

    Write-Host "GitHub Release 上传目录已准备：$stageDirectory"
}
finally {
    Pop-Location
}
