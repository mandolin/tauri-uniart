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

type ConvertMode = "text" | "image";

interface ConverterState {
  controller?: AbortController;
  mode: ConvertMode;
}

// P1.2 只使用 browser Core；不通过 Tauri command 或插件获取文件、网络或系统能力。
const app = requiredElement<HTMLDivElement>("#app");
const state: ConverterState = { mode: "text" };
const coreCapabilities = getCoreCapabilities();

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <strong>UnicodeArt App</strong>
        <span>字素绘</span>
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
            <label for="source-image">输入图片</label>
            <input id="source-image" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" />
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
          <span>预览</span>
          <output id="result-meta" class="result-meta">未生成</output>
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
  convert: requiredElement<HTMLButtonElement>("#convert"),
  glyphFont: requiredElement<HTMLSelectElement>("#glyph-font"),
  height: requiredElement<HTMLInputElement>("#height"),
  imageName: requiredElement<HTMLOutputElement>("#image-name"),
  imageSource: requiredElement<HTMLDivElement>("#image-source"),
  image: requiredElement<HTMLInputElement>("#source-image"),
  matrixSize: requiredElement<HTMLInputElement>("#matrix-size"),
  modeButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]")),
  output: requiredElement<HTMLPreElement>("#art-output"),
  progress: requiredElement<HTMLOutputElement>("#progress"),
  ratio: requiredElement<HTMLInputElement>("#ratio"),
  resultMeta: requiredElement<HTMLOutputElement>("#result-meta"),
  runtimeStatus: requiredElement<HTMLOutputElement>("#runtime-status"),
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

ui.image.addEventListener("change", () => {
  ui.imageName.textContent = ui.image.files?.item(0)?.name ?? "未选择图片";
});

ui.glyphFont.addEventListener("change", updateOutputFont);
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

function createConfig(): Partial<ArtConfig> {
  const charset = ui.charset.value as PresetCharset;

  return {
    charset: { type: charset },
    glyphFont: { family: ui.glyphFont.value },
    height: readNumber(ui.height, "高度", 2),
    matrixSize: readNumber(ui.matrixSize, "矩阵", 2),
    outputFormat: OutputFormat.PLAIN_TEXT,
    outputTarget: "web",
    ratio: readNumber(ui.ratio, "宽高比", 1),
    locale: "zh-CN",
    visualFont: { family: ui.visualFont.value, reduce: 0 }
  };
}

function readNumber(input: HTMLInputElement, label: string, minimum: number): number {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${label}必须是不小于 ${minimum} 的数字。`);
  }

  return value;
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
    const config = createConfig();
    const result = state.mode === "text"
      ? await textToArt(requireText(), config, createBrowserOptions(controller))
      : await imageToArt(requireImage(), config, createBrowserOptions(controller));

    ui.output.textContent = result.content;
    ui.resultMeta.textContent = `${result.cols} 列 × ${result.rows} 行 · ${Math.round(result.duration)} ms`;
    setProgress("完成");
  } catch (error) {
    const message = error instanceof UnicodeArtError
      ? `${error.code}：${error.message}`
      : error instanceof Error
        ? error.message
        : "转换失败。";
    ui.resultMeta.textContent = "未生成";
    setProgress(message);
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
    throw new Error("请输入需要转换的文字。");
  }

  return text;
}

function requireImage(): File {
  const image = ui.image.files?.item(0);
  if (!image) {
    throw new Error("请选择需要转换的图片。");
  }

  return image;
}

function setProgress(message: string): void {
  ui.progress.textContent = message;
}

updateOutputFont();
