[CmdletBinding()]
param(
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$FixtureVersion = '0.1.0-beta.0'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$currentVersion = $packageManifest.version

if ($FixtureVersion -eq $currentVersion) {
    throw '升级夹具版本不能与当前候选版本相同。'
}

function Invoke-ProjectNpm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    # 本机优先复用 mise 固定的 Node 工具链；CI 或其他环境可直接使用 PATH 中的 npm。
    if (Get-Command mise -ErrorAction SilentlyContinue) {
        & mise exec -- npm @Arguments
    }
    else {
        & npm @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "npm 命令失败：npm $($Arguments -join ' ')"
    }
}

$override = @{ version = $FixtureVersion } | ConvertTo-Json -Compress
$fixtureDirectory = Join-Path $projectRoot "output/upgrade-fixture/$FixtureVersion"
New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null

Push-Location $projectRoot
try {
    # Tauri 支持将 JSON 片段合并到标准配置中；夹具只覆盖安装器版本，不改写仓库源文件。
    Invoke-ProjectNpm @('run', 'tauri', '--', 'build', '--config', $override)

    $installer = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis') -Filter "*_$FixtureVersion`_*-setup.exe" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $installer) {
        throw "未找到版本 $FixtureVersion 的 NSIS 升级夹具。"
    }

    $fixturePath = Join-Path $fixtureDirectory $installer.Name
    Copy-Item -LiteralPath $installer.FullName -Destination $fixturePath -Force
    [ordered]@{
        fixtureVersion = $FixtureVersion
        sourceVersion = $currentVersion
        installer = $fixturePath
        installerSha256 = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixtureDirectory 'fixture.json') -Encoding utf8

    Write-Host "NSIS 升级夹具已生成：$fixturePath"
}
finally {
    Pop-Location
}
