[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidenceDirectory = Join-Path $projectRoot "output/compatible-evidence/$timestamp"

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null

function Invoke-ProjectTool {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName,
        [string[]]$Arguments = @()
    )

    # 本机优先复用 mise 固定的工具链；CI 未安装 mise 时直接调用已配置的 Node/Rust。
    if (Get-Command mise -ErrorAction SilentlyContinue) {
        & mise exec -- $FileName @Arguments
    }
    else {
        & $FileName @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "命令失败：$FileName $($Arguments -join ' ')"
    }
}

Push-Location $projectRoot
try {
    Invoke-ProjectTool 'npm' @('run', 'release:verify')

    if (-not $SkipBuild) {
        Invoke-ProjectTool 'npm' @('run', 'check')
        Invoke-ProjectTool 'npm' @('run', 'tauri:build')
    }

    $releaseContract = Join-Path $evidenceDirectory 'release-contract.json'
    Invoke-ProjectTool 'node' @('scripts/verify-release-contract.mjs', '--json') |
        Set-Content -Encoding utf8 -Path $releaseContract

    # Node SBOM 覆盖运行时依赖；开发依赖不进入最终桌面产物。
    $nodeSbom = Join-Path $evidenceDirectory 'node-runtime.cyclonedx.json'
    Invoke-ProjectTool 'npm' @('sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'application', '--omit', 'dev') |
        Set-Content -Encoding utf8 -Path $nodeSbom

    # Cargo metadata 是 Rust 依赖与许可证复核的可重建输入快照。
    $cargoMetadata = Join-Path $evidenceDirectory 'cargo-metadata.json'
    Invoke-ProjectTool 'cargo' @('metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--format-version', '1') |
        Set-Content -Encoding utf8 -Path $cargoMetadata

    $binary = Join-Path $projectRoot 'src-tauri/target/release/tauri-uniart.exe'
    if (-not (Test-Path -LiteralPath $binary)) {
        throw '未找到候选 Windows 二进制；请移除 -SkipBuild 后重新执行。'
    }

    # P2.5.3 只发布 NSIS 安装器。通过文件模式发现路径，避免把产品名或版本号重复硬编码到脚本中。
    $installerDirectory = Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis'
    $installer = Get-ChildItem -LiteralPath $installerDirectory -Filter '*-setup.exe' -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $installer) {
        throw '未找到 NSIS 安装器；请确认 tauri.conf.json 的 bundle.targets 仅包含 nsis。'
    }

    $license = Join-Path $projectRoot 'LICENSE'
    $notices = Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md'
    if (-not (Test-Path -LiteralPath $license) -or -not (Test-Path -LiteralPath $notices)) {
        throw '候选发布必须包含 LICENSE 与 THIRD_PARTY_NOTICES.md。'
    }

    Copy-Item -LiteralPath $license -Destination (Join-Path $evidenceDirectory 'LICENSE') -Force
    Copy-Item -LiteralPath $notices -Destination (Join-Path $evidenceDirectory 'THIRD_PARTY_NOTICES.md') -Force
    $installerRelative = $installer.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
    $releaseAssets = @(
        [ordered]@{ kind = 'nsis-installer'; path = $installerRelative; sha256 = (Get-FileHash -Algorithm SHA256 $installer.FullName).Hash }
        [ordered]@{ kind = 'license'; path = 'LICENSE'; sha256 = (Get-FileHash -Algorithm SHA256 $license).Hash }
        [ordered]@{ kind = 'third-party-notices'; path = 'THIRD_PARTY_NOTICES.md'; sha256 = (Get-FileHash -Algorithm SHA256 $notices).Hash }
        [ordered]@{ kind = 'node-runtime-sbom'; path = 'node-runtime.cyclonedx.json'; sha256 = (Get-FileHash -Algorithm SHA256 $nodeSbom).Hash }
        [ordered]@{ kind = 'cargo-metadata'; path = 'cargo-metadata.json'; sha256 = (Get-FileHash -Algorithm SHA256 $cargoMetadata).Hash }
    )
    $releaseAssets | ConvertTo-Json | Set-Content -Encoding utf8 -Path (Join-Path $evidenceDirectory 'release-assets.json')
    $releaseAssets | ForEach-Object { "$($_.sha256)  $($_.path)" } |
        Set-Content -Encoding ascii -Path (Join-Path $evidenceDirectory 'SHA256SUMS.txt')

    $summary = [ordered]@{
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        product = 'UnicodeArt App'
        version = (Get-Content package.json -Raw | ConvertFrom-Json).version
        npmLockSha256 = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
        cargoLockSha256 = (Get-FileHash -Algorithm SHA256 src-tauri/Cargo.lock).Hash
        binary = 'src-tauri/target/release/tauri-uniart.exe'
        binarySha256 = (Get-FileHash -Algorithm SHA256 $binary).Hash
        installer = $installerRelative
        installerSha256 = (Get-FileHash -Algorithm SHA256 $installer.FullName).Hash
        releaseContract = 'release-contract.json'
        nodeSbom = 'node-runtime.cyclonedx.json'
        cargoMetadata = 'cargo-metadata.json'
        releaseAssets = 'release-assets.json'
        checksums = 'SHA256SUMS.txt'
    }
    $summary | ConvertTo-Json | Set-Content -Encoding utf8 -Path (Join-Path $evidenceDirectory 'summary.json')

    Write-Host "Compatible 发布证据已生成：$evidenceDirectory"
}
finally {
    Pop-Location
}
