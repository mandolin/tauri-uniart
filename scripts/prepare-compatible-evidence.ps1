[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidenceDirectory = Join-Path $projectRoot "output/compatible-evidence/$timestamp"

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null

Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        & mise exec -- npm run check
        if ($LASTEXITCODE -ne 0) {
            throw '前端检查失败，未生成发布证据。'
        }

        & mise exec -- npm run tauri:build
        if ($LASTEXITCODE -ne 0) {
            throw 'Tauri 构建失败，未生成发布证据。'
        }
    }

    # Node SBOM 覆盖运行时依赖；开发依赖不进入最终桌面产物。
    $nodeSbom = Join-Path $evidenceDirectory 'node-runtime.cyclonedx.json'
    & mise exec -- npm sbom --sbom-format cyclonedx --sbom-type application --omit dev |
        Set-Content -Encoding utf8 -Path $nodeSbom
    if ($LASTEXITCODE -ne 0) {
        throw '无法生成 Node SBOM。'
    }

    # Cargo metadata 是 Rust 依赖与许可证复核的可重建输入快照。
    $cargoMetadata = Join-Path $evidenceDirectory 'cargo-metadata.json'
    & mise exec -- cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 |
        Set-Content -Encoding utf8 -Path $cargoMetadata
    if ($LASTEXITCODE -ne 0) {
        throw '无法生成 Cargo 依赖快照。'
    }

    $binary = Join-Path $projectRoot 'src-tauri/target/release/tauri-uniart.exe'
    if (-not (Test-Path -LiteralPath $binary)) {
        throw '未找到候选 Windows 二进制；请移除 -SkipBuild 后重新执行。'
    }

    $summary = [ordered]@{
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        product = 'UnicodeArt App'
        version = (Get-Content package.json -Raw | ConvertFrom-Json).version
        npmLockSha256 = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
        cargoLockSha256 = (Get-FileHash -Algorithm SHA256 src-tauri/Cargo.lock).Hash
        binary = 'src-tauri/target/release/tauri-uniart.exe'
        binarySha256 = (Get-FileHash -Algorithm SHA256 $binary).Hash
        nodeSbom = 'node-runtime.cyclonedx.json'
        cargoMetadata = 'cargo-metadata.json'
    }
    $summary | ConvertTo-Json | Set-Content -Encoding utf8 -Path (Join-Path $evidenceDirectory 'summary.json')

    Write-Host "Compatible 发布证据已生成：$evidenceDirectory"
}
finally {
    Pop-Location
}
