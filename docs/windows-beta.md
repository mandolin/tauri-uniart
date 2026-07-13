# Windows Beta 使用说明

UnicodeArt App `0.1.0-beta.1` 是面向 Windows x64 的预发布版本。它提供文字和图片转换、`*.uaproj` 项目文件、
TXT/HTML 导出和本地预览；它不是完整的 ANSI/BBS 手工绘图器，也不包含自动更新功能。

## 安装前

- 支持 Windows 10 与 Windows 11 的 x64 环境。
- 安装器使用 NSIS，并在缺少 Microsoft Edge WebView2 Evergreen Runtime 时下载官方 bootstrapper；首次安装可能需要网络连接。
- 当前 Beta 未配置 Windows 代码签名。Windows SmartScreen 可能显示“未知发布者”提示；只应从本项目受控的 GitHub Release
  下载，并先核对同一页面提供的 `SHA256SUMS.txt`。
- 应用不打包字体。视觉字体和字素字体依赖本机可用字体；缺失时会回退，外观可能与预期不同。

## 项目兼容

- 普通图片项目只保存图片路径，重新打开时需要再次选择原图片。
- 便携项目会嵌入图片副本，单个图片上限为 10 MiB，整个项目上限为 14 MiB。
- Beta 发布前请保留原始 `*.uaproj` 文件副本。新版本不能读取项目时会显示错误，不应静默覆盖原文件。

## 验证与反馈

每个候选版本会提供安装器、`LICENSE`、`THIRD_PARTY_NOTICES.md`、SBOM、Cargo 依赖快照和 SHA-256 清单。
报告问题时请提供应用版本、Windows 版本、Core 版本、字体名称和最小可复现输入；不要提交私密项目内容、绝对路径或完整系统日志。

问题反馈：<https://github.com/mandolin/tauri-uniart/issues>
