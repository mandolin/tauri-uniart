# Compatible 发布门禁

UnicodeArt App 作为独立的 Compatible 桌面应用发布。该档位允许桌面宿主及其运行时依赖具有
不同于 UnicodeArtJs Core 的许可义务，但每个候选发布物都必须有可复核的依赖、许可证与二进制证据。

## 自动证据

在候选二进制已构建的工作树中执行：

```powershell
mise exec -- npm run evidence
```

命令会先执行 TypeScript、项目格式测试和前端构建，再生成 Tauri Windows 可执行文件，并把以下文件写入
被 Git 忽略的 `output/compatible-evidence/<timestamp>/`：

- `node-runtime.cyclonedx.json`：Node 运行时依赖 SBOM。
- `cargo-metadata.json`：完整 Rust 依赖、版本、来源和许可证字段快照。
- `summary.json`：Node/Cargo lockfile 以及候选 `.exe` 的 SHA-256。

`npm run evidence -- -SkipBuild` 仅适用于已完成同一工作树构建后的重新采集，不得替代正式候选构建。

## 发布前人工复核

1. 检查 Node SBOM 和 Cargo metadata，确认新增依赖的许可证、来源和平台二进制与 Compatible 档位一致。
2. 为候选安装器或压缩包整理适用的 NOTICE、许可证文本和第三方归属；不要把这些材料回写进 Clean Core 的 npm 包。
3. 对 Windows 候选产物进行恶意软件扫描，记录扫描时间、工具版本、结果和二进制 SHA-256。
4. 在干净 Windows 环境验证安装、启动、项目打开/保存、TXT/HTML 导出和卸载。
5. 复查应用 capability：只能有打开/保存、显式选择文件的读写和应用私有 `workspace-state.json` 草稿文件；不得出现 shell、任意目录扫描、远程导航或自动读取历史图片。

## 不通过条件

- 证据与最终候选二进制、`package-lock.json` 或 `Cargo.lock` 的哈希不一致。
- 新依赖没有可确认的许可证或其义务未在发布材料中处理。
- 候选应用拥有未说明的文件系统、命令执行、网络导航或插件加载能力。
- 安装器、升级、卸载或基础项目工作流未完成验证。

本门禁记录工程事实，不替代针对具体发布地区、依赖或商业模式的法律意见。
