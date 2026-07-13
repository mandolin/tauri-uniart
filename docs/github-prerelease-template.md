# UnicodeArt App v<version>

> Windows x64 预发布版。请仅从本 Release 下载，并在安装前核对 `SHA256SUMS.txt`。

## 下载

- `UnicodeArt App_<version>_x64-setup.exe`：Windows 10/11 x64 的 NSIS 安装器。

## 重要说明

- 当前版本是 Beta，未配置 Windows 代码签名。SmartScreen 可能提示“未知发布者”。
- 安装器在系统没有 WebView2 Evergreen Runtime 时会下载官方 bootstrapper，首次安装需要网络连接。
- 本应用不打包字体。视觉字体和字素字体依赖本机字体；缺失时会回退，输出外观可能变化。
- 自动更新尚未启用。升级前请保留原始 `*.uaproj` 项目副本。

## 验证材料

Release 同时包含 `SHA256SUMS.txt`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、Node SBOM、Cargo 元数据和发布契约。
这些材料与安装器来自同一候选构建。

## 反馈

请通过 Issues 提交最小复现：应用版本、Windows 版本、Core 版本、字体名称和已脱敏的输入示例会很有帮助。
请不要提交私密项目内容、绝对路径或完整系统日志。
