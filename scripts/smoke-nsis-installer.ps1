[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$TargetInstaller,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$ExpectedTargetVersion,
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$InitialInstaller,
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$ExpectedInitialVersion,
    [string]$ProductName = 'UnicodeArt App',
    [string]$ResultPath
)

$ErrorActionPreference = 'Stop'

function Get-UnicodeArtUninstallEntries {
    param([string]$ExpectedProductName)

    $uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    if (-not (Test-Path -LiteralPath $uninstallRoot)) {
        return @()
    }

    return @(
        Get-ChildItem -LiteralPath $uninstallRoot | ForEach-Object {
            $entry = Get-ItemProperty -LiteralPath $_.PSPath
            if ($entry.DisplayName -eq $ExpectedProductName) {
                [pscustomobject]@{
                    RegistryPath = $_.PSPath
                    DisplayName = $entry.DisplayName
                    DisplayVersion = $entry.DisplayVersion
                    InstallLocation = $entry.InstallLocation
                    UninstallString = $entry.UninstallString
                    QuietUninstallString = $entry.QuietUninstallString
                }
            }
        }
    )
}

function Invoke-SilentInstaller {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath
    )

    $process = Start-Process -FilePath (Resolve-Path -LiteralPath $InstallerPath) -ArgumentList @('/S') -PassThru -Wait
    if ($process.ExitCode -ne 0) {
        throw "安装器返回异常退出码：$($process.ExitCode)（$InstallerPath）。"
    }

    Start-Sleep -Seconds 2
}

function Split-UninstallCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandLine
    )

    if ($CommandLine -match '^\s*"(?<path>[^"]+)"(?<arguments>.*)$') {
        return [pscustomobject]@{ FilePath = $Matches.path; Arguments = $Matches.arguments.Trim() }
    }

    if ($CommandLine -match '^\s*(?<path>[^\s]+\.exe)(?<arguments>.*)$') {
        return [pscustomobject]@{ FilePath = $Matches.path; Arguments = $Matches.arguments.Trim() }
    }

    throw "无法解析卸载命令：$CommandLine"
}

function Get-InstalledApplicationPath {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Entry
    )

    $candidateDirectories = @($Entry.InstallLocation)
    if ($Entry.UninstallString) {
        $uninstall = Split-UninstallCommand -CommandLine $Entry.UninstallString
        $candidateDirectories += Split-Path -Parent $uninstall.FilePath
    }

    foreach ($directory in ($candidateDirectories | Where-Object { $_ } | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            continue
        }

        $application = Get-ChildItem -LiteralPath $directory -Filter '*.exe' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch '^(uninstall|unins).*\.exe$' } |
            Select-Object -First 1
        if ($application) {
            return $application.FullName
        }
    }

    throw '安装器已写入注册表，但未能在安装目录中找到应用程序可执行文件。'
}

function Assert-InstalledVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedProductName
    )

    $entries = @(Get-UnicodeArtUninstallEntries -ExpectedProductName $ExpectedProductName)
    if ($entries.Count -ne 1) {
        throw "预期找到一个 $ExpectedProductName 安装记录，实际找到 $($entries.Count) 个。"
    }

    $entry = $entries[0]
    if ($entry.DisplayVersion -ne $ExpectedVersion) {
        throw "已安装版本不匹配：期望 $ExpectedVersion，实际 $($entry.DisplayVersion)。"
    }

    $applicationPath = Get-InstalledApplicationPath -Entry $entry
    return [pscustomobject]@{
        DisplayVersion = $entry.DisplayVersion
        ApplicationPath = $applicationPath
        ApplicationSha256 = (Get-FileHash -LiteralPath $applicationPath -Algorithm SHA256).Hash
        UninstallString = $entry.UninstallString
    }
}

function Invoke-SilentUninstall {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Entry
    )

    $commandLine = if ($Entry.QuietUninstallString) { $Entry.QuietUninstallString } else { $Entry.UninstallString }
    $uninstall = Split-UninstallCommand -CommandLine $commandLine
    if (-not (Test-Path -LiteralPath $uninstall.FilePath -PathType Leaf)) {
        throw "卸载程序不存在：$($uninstall.FilePath)"
    }

    $arguments = @()
    if ($uninstall.Arguments) {
        $arguments += $uninstall.Arguments
    }
    if ($arguments -notcontains '/S') {
        $arguments += '/S'
    }

    $process = Start-Process -FilePath $uninstall.FilePath -ArgumentList $arguments -PassThru -Wait
    if ($process.ExitCode -ne 0) {
        throw "卸载程序返回异常退出码：$($process.ExitCode)。"
    }

    Start-Sleep -Seconds 2
}

if ($InitialInstaller -and -not $ExpectedInitialVersion) {
    throw '提供 InitialInstaller 时必须同时提供 ExpectedInitialVersion。'
}

$initialEntries = @(Get-UnicodeArtUninstallEntries -ExpectedProductName $ProductName)
if ($initialEntries.Count -gt 0) {
    throw "检测到已有 $ProductName 安装记录。为避免覆盖现有安装，烟雾测试已拒绝执行。"
}

$result = [ordered]@{
    product = $ProductName
    initialInstaller = $InitialInstaller
    targetInstaller = $TargetInstaller
    steps = @()
    passed = $false
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
}
$installedEntry = $null

try {
    if ($InitialInstaller) {
        Invoke-SilentInstaller -InstallerPath $InitialInstaller
        $initialState = Assert-InstalledVersion -ExpectedVersion $ExpectedInitialVersion -ExpectedProductName $ProductName
        $result.steps += [ordered]@{ action = 'install-initial'; version = $initialState.DisplayVersion; applicationSha256 = $initialState.ApplicationSha256 }
    }

    Invoke-SilentInstaller -InstallerPath $TargetInstaller
    $targetState = Assert-InstalledVersion -ExpectedVersion $ExpectedTargetVersion -ExpectedProductName $ProductName
    $result.steps += [ordered]@{ action = if ($InitialInstaller) { 'upgrade-target' } else { 'install-target' }; version = $targetState.DisplayVersion; applicationSha256 = $targetState.ApplicationSha256 }
    $installedEntry = @(Get-UnicodeArtUninstallEntries -ExpectedProductName $ProductName)[0]

    Invoke-SilentUninstall -Entry $installedEntry
    $remainingEntries = @(Get-UnicodeArtUninstallEntries -ExpectedProductName $ProductName)
    if ($remainingEntries.Count -ne 0) {
        throw "卸载后仍存在 $($remainingEntries.Count) 个 $ProductName 安装记录。"
    }

    $result.steps += [ordered]@{ action = 'uninstall'; version = $ExpectedTargetVersion }
    $result.passed = $true
}
finally {
    # 任意中途失败仍优先清理本脚本创建的测试安装；已有安装在脚本开始时已被拒绝，故不会误删用户版本。
    $residualEntries = @(Get-UnicodeArtUninstallEntries -ExpectedProductName $ProductName)
    foreach ($entry in $residualEntries) {
        try {
            Invoke-SilentUninstall -Entry $entry
        }
        catch {
            $result.cleanupError = $_.Exception.Message
        }
    }

    if ($ResultPath) {
        $resultDirectory = Split-Path -Parent $ResultPath
        if ($resultDirectory) {
            New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
        }
        $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ResultPath -Encoding utf8
    }
}

if (-not $result.passed) {
    throw 'NSIS 安装器烟雾测试未通过。请检查 ResultPath 中的记录和安装器日志。'
}

Write-Host "NSIS 安装、升级和卸载烟雾测试通过：$ExpectedTargetVersion"
