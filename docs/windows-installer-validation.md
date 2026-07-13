# Windows 安装器验证

本说明供维护者验证 `UnicodeArt App` 的 Windows NSIS 候选安装器。它不替代面向使用者的
[Windows Beta 使用说明](windows-beta.md)。测试脚本只操作当前用户的卸载注册表；若检测到已有
`UnicodeArt App` 安装，会直接拒绝执行，避免覆盖真实使用中的版本。

## 自动烟雾测试

先从当前源码生成一个只用于测试升级路径的低版本夹具：

```powershell
npm run installer:fixture -- -FixtureVersion 0.1.0-beta.0
```

然后执行静默安装、升级和卸载。下面的目标安装器是当前候选，初始安装器是刚生成的夹具：

```powershell
npm run installer:smoke -- `
  -InitialInstaller .\output\upgrade-fixture\0.1.0-beta.0\UnicodeArt App_0.1.0-beta.0_x64-setup.exe `
  -ExpectedInitialVersion 0.1.0-beta.0 `
  -TargetInstaller .\src-tauri\target\release\bundle\nsis\UnicodeArt App_0.1.0-beta.1_x64-setup.exe `
  -ExpectedTargetVersion 0.1.0-beta.1 `
  -ResultPath .\output\installer-smoke\beta.1.json
```

脚本会验证卸载注册表版本、应用二进制存在性和哈希，并在成功或失败时优先尝试卸载测试版本。
夹具不会被发布，也不应作为用户安装来源。它仅通过 Tauri 配置覆盖构造较低的**安装器版本**，用于验证
NSIS 的覆盖安装与卸载机制；它不模拟历史应用代码或项目数据迁移。真实旧版本升级与数据兼容仍应在每次正式
升级候选出现时单独复核。

## 干净系统复核

本机自动验证无法替代无既有 WebView2、无既有应用数据的干净 Windows 环境。准备 Sandbox 验收包：

```powershell
npm run sandbox:prepare -- `
  -InstallerPath .\src-tauri\target\release\bundle\nsis\UnicodeArt App_0.1.0-beta.1_x64-setup.exe `
  -ExpectedVersion 0.1.0-beta.1
```

该命令会生成 `output/windows-sandbox-smoke/UnicodeArtAppInstallerSmoke.wsb`。启用 Windows Sandbox 并重启后，
打开该 `.wsb` 文件即可执行无界面安装和卸载，结果会回写为同目录的 `sandbox-result.json`。此环境保留网络，以验证
缺少 WebView2 时的官方 bootstrapper 路径。
