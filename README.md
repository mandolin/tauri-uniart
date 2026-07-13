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
mise exec -- npm run tauri:build
```

`tauri:build` 当前仅生成可执行文件，不生成安装器。

## 许可与边界

本仓库自有源码采用 MIT 许可。桌面应用是独立分发项目，发布时会随实际依赖图和产物提供相应的
NOTICE、SBOM 与许可证材料；它不会改变 UnicodeArtJs Core 包的许可证。

详细的跨项目边界见
[UnicodeArtJs 兼容项目指南](https://github.com/mandolin/UnicodeArtJs/blob/main/docs/compatible-project-guide.md)。
