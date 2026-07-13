import { defineConfig } from "vite";

// Tauri 仅在开发时通过该变量配置远程调试主机。
// @ts-expect-error Vite 配置运行在 Node 环境，浏览器类型定义不包含 process。
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  // 固定端口可使 Tauri 配置和 CSP 在开发态保持可审计。
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Rust 编译输出不应触发前端热更新。
      ignored: ["**/src-tauri/**"],
    },
  },
}));
