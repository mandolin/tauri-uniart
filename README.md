# UnicodeArt App · 字素绘

UnicodeArt App 是 UnicodeArtJs 生态的桌面 Unicode 字符画工作台。它以已发布的
[`unicode-art-js`](https://www.npmjs.com/package/unicode-art-js) Core 为转换引擎，提供
文字和图片到 Unicode 字符画的本地预览流程。

## 功能

- 将文字生成 Unicode 字符画。
- 导入 PNG、JPEG、WebP、BMP 或 GIF 图片并生成字符画。
- 调整高度、矩阵大小、宽高比和字符集。
- 分别选择输入文字的视觉字体与输出字素字体。
- 在转换过程中显示进度，并支持取消仍在执行的任务。
- 保存 `*.uaproj` 项目：普通图片项目只记录路径，便携项目才嵌入图片副本。
- 导出 TXT 或安全转义的独立 HTML 文件。

本应用不打包字体。字体选项以已安装的开源字体为优先候选，缺失时由系统字体回退机制处理。

## 本地运行

项目使用 [mise](https://mise.jdx.dev/) 固定 Node 与 Rust 工具链：

```powershell
mise install
mise exec -- npm install
mise exec -- npm run tauri:dev
```

开发验证可执行：

```powershell
mise exec -- npm run check
mise exec -- npm run release:verify
mise exec -- npm run tauri:build
```

`tauri:build` 生成 Windows x64 的 NSIS 安装器。无安装器调试构建可使用 `npm run tauri:build:binary`。

## 版本与候选构建

`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和两个 lockfile 必须保持同一应用版本。
`npm run release:verify` 会验证这一契约，并确认已锁定的 `unicode-art-js` 与声明的 Core 版本范围一致。

仓库的 `Windows Candidate Check` 会在 Windows runner 上执行干净安装、测试、NSIS 构建和 Compatible 证据采集，
再把候选安装器与证据作为短期 Actions artifact 保存。该工作流不会创建 GitHub Release，也不会触发自动更新。

Beta 的安装、WebView2、未签名提示、项目兼容和问题反馈说明见 [Windows Beta 使用说明](docs/windows-beta.md)。
维护者可按 [GitHub Release 资产准备](docs/github-release-assets.md) 生成安装器、哈希和依赖材料的同版本上传目录。

## 项目与文件访问

所有图片、项目和导出目标均由原生打开/保存对话框明确选择。普通图片项目重新打开时不会自动读取
历史路径，需重新选择图片；便携项目可携带不超过 10 MiB 的原始图片副本。完整项目文件上限为 14 MiB，
项目保存源输入与转换配置，不保存生成结果。

应用私有目录只保存未保存的文字草稿和最近项目路径，不会在启动时自动重新打开或读取这些外部路径。

## 许可与边界

本仓库自有源码采用 MIT 许可。桌面应用是独立分发项目，发布时会随实际依赖图和产物提供相应的
NOTICE、SBOM 与许可证材料；它不会改变 UnicodeArtJs Core 包的许可证。

详细的跨项目边界见
[UnicodeArtJs 兼容项目指南](https://github.com/mandolin/UnicodeArtJs/blob/main/docs/compatible-project-guide.md)。

准备候选发布物时，执行以下命令生成 Node SBOM、Cargo 依赖快照和 Windows 二进制哈希：

```powershell
mise exec -- npm run evidence
```

输出位于被 Git 忽略的 `output/compatible-evidence/`。发布前仍须遵循
[Compatible 发布门禁](docs/compatible-release-gate.md) 完成人工许可证和安装器复核。
