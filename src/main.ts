// P1.1 仅建立不含 command 或插件的安全窗口；转换工作流在 P1.2 接入 browser Core。
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Unable to locate the application root.");
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <strong>UnicodeArt App</strong>
        <span>字素绘</span>
      </div>
      <div class="runtime-status" aria-label="应用状态">准备就绪</div>
    </header>
    <main class="workspace" aria-label="UnicodeArt App 工作区">
      <aside class="sidebar" aria-label="项目面板">
        <p class="eyebrow">项目</p>
        <h1>未打开项目</h1>
        <div class="sidebar-rule"></div>
      </aside>
      <section class="canvas-area" aria-label="主工作区">
        <header class="canvas-header">
          <span>工作区</span>
          <span class="canvas-status">安全窗口</span>
        </header>
        <div class="canvas-empty" role="status">Unicode 字符画工作台</div>
      </section>
    </main>
  </div>
`;
