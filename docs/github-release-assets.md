# GitHub Release 资产准备

本说明面向维护者。它用于把已验证的 `UnicodeArt App` Windows 候选整理成可上传的 GitHub Release 目录，
不会创建 Git tag、GitHub Release 或上传任何文件。

## 前置条件

- 当前版本的 NSIS 安装器已由 `npm run tauri:build` 生成。
- 当前版本的 Compatible 证据已由 `npm run evidence` 生成。
- `npm run release:verify` 通过。

## 生成上传目录

```powershell
npm run release:assets
```

脚本会严格匹配 `package.json` 当前版本，校验安装器 SHA-256 和源码提交与证据中的 `summary.json` 相同，然后生成：

```text
output/release-assets/<version>/
  UnicodeArt App_<version>_x64-setup.exe
  LICENSE
  THIRD_PARTY_NOTICES.md
  node-runtime.cyclonedx.json
  cargo-metadata.json
  release-contract.json
  release-assets.json
  summary.json
  release-manifest.json
  SHA256SUMS.txt
```

上传前应再次阅读 [Windows Beta 使用说明](windows-beta.md)、核对 `SHA256SUMS.txt`，并确认对应的
Windows Sandbox/VM 验收已通过。Beta 阶段创建 GitHub Pre-release 时使用 tag `v<version>`，例如
`v0.1.0-beta.1`；不要使用该 tag 冒充 UnicodeArtJs Core、CLI 或 VS Code 扩展的版本。发布页说明可从
[Pre-release 模板](github-prerelease-template.md) 开始填写。
