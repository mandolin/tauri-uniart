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

    $summary = [ordered]@{
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        product = 'UnicodeArt App'
        version = (Get-Content package.json -Raw | ConvertFrom-Json).version
        npmLockSha256 = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
        cargoLockSha256 = (Get-FileHash -Algorithm SHA256 src-tauri/Cargo.lock).Hash
        binary = 'src-tauri/target/release/tauri-uniart.exe'
        binarySha256 = (Get-FileHash -Algorithm SHA256 $binary).Hash
        releaseContract = 'release-contract.json'
        nodeSbom = 'node-runtime.cyclonedx.json'
        cargoMetadata = 'cargo-metadata.json'
    }
    $summary | ConvertTo-Json | Set-Content -Encoding utf8 -Path (Join-Path $evidenceDirectory 'summary.json')

    Write-Host "Compatible 发布证据已生成：$evidenceDirectory"
}
finally {
    Pop-Location
}
