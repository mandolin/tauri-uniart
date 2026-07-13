import {
  getCoreCapabilities,
  imageToArt,
  OutputFormat,
  PresetCharset,
  textToArt,
  UnicodeArtError,
  type ArtConfig,
  type BrowserProgressEvent
} from "unicode-art-js/browser";

import {
  chooseExportSavePath,
  chooseImageFile,
  chooseProjectFile,
  chooseProjectSavePath,
  loadLocalWorkspaceState,
  readUserSelectedText,
  saveLocalWorkspaceState,
  writeUserSelectedText,
  type DialogImageFile,
  type LocalWorkspaceState
} from "./fileWorkspace";
import {
  createEmbeddedImageProject,
  createLinkedImageProject,
  createTextProject,
  decodeEmbeddedImage,
  parseProject,
  ProjectValidationError,
  serializeProject,
  type ProjectConfig,
  type ProjectMode,
  type UnicodeArtProject
} from "./project";

type ConvertMode = ProjectMode;

interface GeneratedArt {
  cols: number;
  content: string;
  duration: number;
  rows: number;
}

interface LoadedImage extends DialogImageFile {
  file: File;
}

interface ConverterState {
  controller?: AbortController;
  currentProjectPath?: string;
  image?: LoadedImage;
  localWorkspace: LocalWorkspaceState;
  mode: ConvertMode;
  result?: GeneratedArt;
  workspaceSaveTimer?: number;
}

const APP_VERSION = "0.1.0";

// P2.4 继续只通过 browser Core 转换；Tauri 插件仅承担显式选择后的文件访问。
const app = requiredElement<HTMLDivElement>("#app");
const state: ConverterState = {
  localWorkspace: { draftText: "", recentProjectPaths: [] },
  mode: "text"
};
const coreCapabilities = getCoreCapabilities();

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <strong>UnicodeArt App</strong>
        <span>字素绘</span>
      </div>
      <div class="top-actions" aria-label="项目操作">
        <button id="open-project" type="button">打开项目</button>
        <button id="save-project" type="button">保存项目</button>
        <button id="save-portable-project" type="button">便携保存</button>
      </div>
      <output id="runtime-status" class="runtime-status" aria-live="polite"></output>
    </header>
    <main class="workspace" aria-label="UnicodeArt App 工作区">
      <aside class="control-panel" aria-label="转换参数">
        <section class="mode-section" aria-label="转换模式">
          <div class="mode-switch" role="group" aria-label="转换模式">
            <button type="button" data-mode="text" aria-pressed="true">文字</button>
            <button type="button" data-mode="image" aria-pressed="false">图片</button>
          </div>
        </section>

        <section class="control-section">
          <div id="text-source" class="text-source">
            <label for="source-text">输入文字</label>
            <textarea id="source-text" rows="6">UnicodeArt App</textarea>
          </div>
          <div id="image-source" class="image-source is-hidden">
            <span class="field-label">输入图片</span>
            <button id="choose-image" class="control-button" type="button">选择图片</button>
            <output id="image-name" class="file-name">未选择图片</output>
          </div>
        </section>

        <section class="control-section compact-controls">
          <div class="field-grid">
            <label for="height">高度
              <input id="height" type="number" min="2" max="240" value="24" />
            </label>
            <label for="matrix-size">矩阵
              <input id="matrix-size" type="number" min="2" max="20" value="6" />
            </label>
            <label for="ratio">宽高比
              <input id="ratio" type="number" min="1" max="3" step="0.1" value="2" />
            </label>
            <label for="charset">字符集
              <select id="charset">
                <option value="ASCII">ASCII</option>
                <option value="EXTENDED">扩展</option>
                <option value="CHINESE_SIMPLE">简体中文</option>
              </select>
            </label>
          </div>
        </section>

        <section class="control-section font-controls">
          <label for="visual-font">视觉字体
            <select id="visual-font">
              <option value="Noto Sans SC">Noto Sans SC</option>
              <option value="Source Han Sans SC">思源黑体</option>
              <option value="LXGW WenKai">霞鹜文楷</option>
              <option value="sans-serif">系统无衬线</option>
            </select>
          </label>
          <label for="glyph-font">字素字体
            <select id="glyph-font">
              <option value="Sarasa Mono SC, LXGW WenKai Mono, Source Code Pro, Liberation Mono, monospace">等距更纱黑体 SC</option>
              <option value="LXGW WenKai Mono, Sarasa Mono SC, Source Code Pro, monospace">霞鹜文楷等宽</option>
              <option value="Source Code Pro, Sarasa Mono SC, monospace">Source Code Pro</option>
              <option value="Liberation Mono, monospace">Liberation Mono</option>
            </select>
          </label>
        </section>

        <section class="control-section action-section">
          <div class="action-row">
            <button id="convert" class="primary-action" type="button">转换</button>
            <button id="cancel" class="secondary-action" type="button" disabled>取消</button>
          </div>
          <output id="progress" class="progress" aria-live="polite">就绪</output>
        </section>
      </aside>

      <section class="output-area" aria-label="字符画预览">
        <header class="output-header">
          <div class="output-title">
            <span>预览</span>
            <output id="result-meta" class="result-meta">未生成</output>
          </div>
          <div class="output-actions" aria-label="导出操作">
            <button id="export-txt" type="button" disabled>导出 TXT</button>
            <button id="export-html" type="button" disabled>导出 HTML</button>
          </div>
        </header>
        <div class="output-frame">
          <pre id="art-output" aria-live="polite">等待转换</pre>
        </div>
      </section>
    </main>
  </div>
`;

const ui = {
  cancel: requiredElement<HTMLButtonElement>("#cancel"),
  charset: requiredElement<HTMLSelectElement>("#charset"),
  chooseImage: requiredElement<HTMLButtonElement>("#choose-image"),
  convert: requiredElement<HTMLButtonElement>("#convert"),
  exportHtml: requiredElement<HTMLButtonElement>("#export-html"),
  exportTxt: requiredElement<HTMLButtonElement>("#export-txt"),
  glyphFont: requiredElement<HTMLSelectElement>("#glyph-font"),
  height: requiredElement<HTMLInputElement>("#height"),
  imageName: requiredElement<HTMLOutputElement>("#image-name"),
  imageSource: requiredElement<HTMLDivElement>("#image-source"),
  matrixSize: requiredElement<HTMLInputElement>("#matrix-size"),
  modeButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]")),
  openProject: requiredElement<HTMLButtonElement>("#open-project"),
  output: requiredElement<HTMLPreElement>("#art-output"),
  progress: requiredElement<HTMLOutputElement>("#progress"),
  ratio: requiredElement<HTMLInputElement>("#ratio"),
  resultMeta: requiredElement<HTMLOutputElement>("#result-meta"),
  runtimeStatus: requiredElement<HTMLOutputElement>("#runtime-status"),
  savePortableProject: requiredElement<HTMLButtonElement>("#save-portable-project"),
  saveProject: requiredElement<HTMLButtonElement>("#save-project"),
  sourceText: requiredElement<HTMLTextAreaElement>("#source-text"),
  textSource: requiredElement<HTMLDivElement>("#text-source"),
  visualFont: requiredElement<HTMLSelectElement>("#visual-font")
};

const progressLabels: Record<BrowserProgressEvent["stage"], string> = {
  start: "准备中",
  loadImage: "读取图片",
  renderText: "渲染文字",
  precomputeChars: "预计算字素",
  convert: "生成字符画",
  done: "完成"
};

ui.runtimeStatus.textContent = coreCapabilities.browserEntry.experimental
  ? `Browser Core · 实验入口 · v${coreCapabilities.version}`
  : `Browser Core · v${coreCapabilities.version}`;

//region 事件绑定

for (const button of ui.modeButtons) {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode === "image" ? "image" : "text");
  });
}

ui.sourceText.addEventListener("input", scheduleLocalWorkspaceSave);
ui.glyphFont.addEventListener("change", updateOutputFont);
ui.chooseImage.addEventListener("click", () => void selectImage());
ui.openProject.addEventListener("click", () => void openProject());
ui.saveProject.addEventListener("click", () => void saveProject(false));
ui.savePortableProject.addEventListener("click", () => void saveProject(true));
ui.exportTxt.addEventListener("click", () => void exportResult("txt"));
ui.exportHtml.addEventListener("click", () => void exportResult("html"));
ui.convert.addEventListener("click", () => void convert());
ui.cancel.addEventListener("click", () => state.controller?.abort());

//endregion

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing application element: ${selector}`);
  }

  return element;
}

function setMode(mode: ConvertMode): void {
  state.mode = mode;
  ui.imageSource.classList.toggle("is-hidden", mode !== "image");
  ui.textSource.classList.toggle("is-hidden", mode !== "text");

  for (const button of ui.modeButtons) {
    const selected = button.dataset.mode === mode;
    button.setAttribute("aria-pressed", String(selected));
  }

  setProgress(mode === "text" ? "就绪 · 文字" : "就绪 · 图片");
}

function updateOutputFont(): void {
  ui.output.style.fontFamily = ui.glyphFont.value;
}

function createConfig(): ProjectConfig {
  return {
    charset: ui.charset.value as ProjectConfig["charset"],
    glyphFont: ui.glyphFont.value,
    height: readNumber(ui.height, "高度", 2, 240),
    matrixSize: readNumber(ui.matrixSize, "矩阵", 2, 20),
    ratio: readNumber(ui.ratio, "宽高比", 1, 3),
    visualFont: ui.visualFont.value
  };
}

function createCoreConfig(): Partial<ArtConfig> {
  const config = createConfig();
  return {
    charset: { type: config.charset as PresetCharset },
    glyphFont: { family: config.glyphFont },
    height: config.height,
    matrixSize: config.matrixSize,
    outputFormat: OutputFormat.PLAIN_TEXT,
    outputTarget: "web",
    ratio: config.ratio,
    locale: "zh-CN",
    visualFont: { family: config.visualFont, reduce: 0 }
  };
}

function readNumber(input: HTMLInputElement, label: string, minimum: number, maximum: number): number {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须是不小于 ${minimum} 且不大于 ${maximum} 的数字。`);
  }

  return value;
}

async function selectImage(): Promise<void> {
  try {
    const selected = await chooseImageFile();
    if (!selected) {
      return;
    }

    state.image = createLoadedImage(selected);
    ui.imageName.textContent = `${selected.name} · 已选择`;
    setProgress("图片已选择，等待转换。");
  } catch (error) {
    setProgress(toUserMessage(error));
  }
}

async function openProject(): Promise<void> {
  try {
    const path = await chooseProjectFile(state.localWorkspace.recentProjectPaths[0]);
    if (!path) {
      return;
    }

    const project = parseProject(await readUserSelectedText(path));
    applyProject(project, path);
    rememberRecentProject(path);

    if (project.source.kind === "text" || project.source.storage === "embedded") {
      await convert();
    }
  } catch (error) {
    setProgress(toUserMessage(error));
  }
}

function applyProject(project: UnicodeArtProject, path: string): void {
  state.currentProjectPath = path;
  applyConfig(project.config);
  setMode(project.mode);
  state.result = undefined;
  updateExportState();
  ui.output.textContent = "等待转换";
  ui.resultMeta.textContent = "未生成";

  if (project.source.kind === "text") {
    ui.sourceText.value = project.source.text;
    state.image = undefined;
    ui.imageName.textContent = "未选择图片";
    scheduleLocalWorkspaceSave();
    return;
  }

  if (project.source.storage === "embedded") {
    const bytes = decodeEmbeddedImage(project.source);
    state.image = createLoadedImage({
      bytes,
      mime: project.source.mime,
      name: project.source.name,
      path: path
    });
    ui.imageName.textContent = `${project.source.name} · 便携项目内图片`;
    return;
  }

  // 常规项目只记录路径，不恢复外部文件读取授权，避免隐式访问历史图片。
  state.image = undefined;
  ui.imageName.textContent = `${project.source.name} · 请重新选择图片`;
  setProgress("已载入常规图片项目；请重新选择原图片后再转换。");
}

function applyConfig(config: ProjectConfig): void {
  ui.height.value = String(config.height);
  ui.matrixSize.value = String(config.matrixSize);
  ui.ratio.value = String(config.ratio);
  setSelectValue(ui.charset, config.charset);
  setSelectValue(ui.visualFont, config.visualFont);
  setSelectValue(ui.glyphFont, config.glyphFont);
  updateOutputFont();
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  if (Array.from(select.options).some((option) => option.value === value)) {
    select.value = value;
  }
}

async function saveProject(portable: boolean): Promise<void> {
  try {
    const project = createCurrentProject(portable);
    const defaultPath = portable ? "unicodeart-portable.uaproj" : state.currentProjectPath;
    const path = await chooseProjectSavePath(defaultPath);
    if (!path) {
      return;
    }

    await writeUserSelectedText(path, serializeProject(project));
    if (!portable) {
      state.currentProjectPath = path;
    }
    rememberRecentProject(path);
    setProgress(portable ? "便携项目已保存。" : "项目已保存。" );
  } catch (error) {
    setProgress(toUserMessage(error));
  }
}

function createCurrentProject(portable: boolean): UnicodeArtProject {
  const config = createConfig();
  if (state.mode === "text") {
    return createTextProject(requireText(), config, APP_VERSION);
  }

  const image = requireImage();
  const imageMeta = { mime: image.mime, name: image.name };
  return portable
    ? createEmbeddedImageProject(imageMeta, image.bytes, config, APP_VERSION)
    : createLinkedImageProject({ ...imageMeta, path: image.path }, config, APP_VERSION);
}

async function exportResult(format: "html" | "txt"): Promise<void> {
  if (!state.result) {
    setProgress("请先生成字符画后再导出。" );
    return;
  }

  try {
    const path = await chooseExportSavePath(format);
    if (!path) {
      return;
    }

    const content = format === "txt" ? state.result.content : createHtmlExport(state.result.content);
    await writeUserSelectedText(path, content);
    setProgress(`已导出 ${format.toUpperCase()}。`);
  } catch (error) {
    setProgress(toUserMessage(error));
  }
}

function createHtmlExport(content: string): string {
  // 导出固定采用系统等宽回退，避免把可编辑配置直接拼进 HTML/CSS。
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UnicodeArt</title>
  <style>body{margin:24px;background:#fff;color:#172121}pre{font:13px/1.2 monospace;white-space:pre}</style>
</head>
<body><pre>${escapeHtml(content)}</pre></body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function convert(): Promise<void> {
  if (state.controller) {
    return;
  }

  const controller = new AbortController();
  state.controller = controller;
  ui.convert.disabled = true;
  ui.cancel.disabled = false;
  setProgress("准备中");

  try {
    const config = createCoreConfig();
    const result = state.mode === "text"
      ? await textToArt(requireText(), config, createBrowserOptions(controller))
      : await imageToArt(requireImage().file, config, createBrowserOptions(controller));

    state.result = result;
    ui.output.textContent = result.content;
    ui.resultMeta.textContent = `${result.cols} 列 × ${result.rows} 行 · ${Math.round(result.duration)} ms`;
    updateExportState();
    setProgress("完成");
  } catch (error) {
    state.result = undefined;
    ui.resultMeta.textContent = "未生成";
    updateExportState();
    setProgress(toUserMessage(error));
  } finally {
    state.controller = undefined;
    ui.convert.disabled = false;
    ui.cancel.disabled = true;
  }
}

function createBrowserOptions(controller: AbortController) {
  return {
    maxInputPixels: 16_000_000,
    maxOutputCells: 300_000,
    progress: reportProgress,
    signal: controller.signal
  };
}

function reportProgress(event: BrowserProgressEvent): void {
  setProgress(`${progressLabels[event.stage]} · ${Math.round(event.progress * 100)}%`);
}

function requireText(): string {
  const text = ui.sourceText.value.trim();
  if (!text) {
    throw new Error("请输入需要转换的文字。" );
  }

  return text;
}

function requireImage(): LoadedImage {
  if (!state.image) {
    throw new Error("请选择需要转换的图片。" );
  }

  return state.image;
}

function createLoadedImage(image: DialogImageFile): LoadedImage {
  return {
    ...image,
    file: new File([image.bytes], image.name, { type: image.mime })
  };
}

function updateExportState(): void {
  const disabled = !state.result;
  ui.exportTxt.disabled = disabled;
  ui.exportHtml.disabled = disabled;
}

function rememberRecentProject(path: string): void {
  state.localWorkspace.recentProjectPaths = [
    path,
    ...state.localWorkspace.recentProjectPaths.filter((item) => item !== path)
  ].slice(0, 8);
  scheduleLocalWorkspaceSave();
}

function scheduleLocalWorkspaceSave(): void {
  state.localWorkspace.draftText = ui.sourceText.value.slice(0, 2 * 1024 * 1024);
  if (state.workspaceSaveTimer) {
    window.clearTimeout(state.workspaceSaveTimer);
  }

  state.workspaceSaveTimer = window.setTimeout(() => {
    state.workspaceSaveTimer = undefined;
    void saveLocalWorkspaceState(state.localWorkspace).catch(() => {
      // 应用私有草稿写入失败不应阻塞转换，也不应泄漏本地系统错误。
    });
  }, 350);
}

async function hydrateLocalWorkspace(): Promise<void> {
  const saved = await loadLocalWorkspaceState();
  if (!saved) {
    return;
  }

  state.localWorkspace = saved;
  if (saved.draftText) {
    ui.sourceText.value = saved.draftText;
  }
}

function toUserMessage(error: unknown): string {
  if (error instanceof UnicodeArtError) {
    return `${error.code}：${error.message}`;
  }
  if (error instanceof ProjectValidationError) {
    return `项目错误：${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败。";
}

function setProgress(message: string): void {
  ui.progress.textContent = message;
}

updateOutputFont();
updateExportState();
void hydrateLocalWorkspace();
