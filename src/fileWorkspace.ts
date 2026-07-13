/**
 * Tauri 文件交互边界。
 *
 * 外部文件一律先通过原生对话框选择。Tauri 会把这次选择临时加入文件范围，
 * 应用自身不会保存或恢复该授权；仅草稿和最近项目路径写入应用私有目录。
 */

import { open, save } from "@tauri-apps/plugin-dialog";
import {
  BaseDirectory,
  readFile,
  readTextFile,
  writeTextFile
} from "@tauri-apps/plugin-fs";

import type { ProjectImageMime } from "./project";

const IMAGE_FILTER = {
  extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"],
  name: "支持的图片"
};
const PROJECT_FILTER = {
  extensions: ["uaproj"],
  name: "UnicodeArt 项目"
};
const WORKSPACE_STATE_FILE = "workspace-state.json";

export interface DialogImageFile {
  bytes: Uint8Array;
  mime: ProjectImageMime;
  name: string;
  path: string;
}

export interface LocalWorkspaceState {
  draftText: string;
  recentProjectPaths: string[];
}

/** 用户主动选择图片后才读取其字节。 */
export async function chooseImageFile(defaultPath?: string): Promise<DialogImageFile | undefined> {
  const path = await open({
    defaultPath,
    directory: false,
    filters: [IMAGE_FILTER],
    multiple: false,
    title: "选择输入图片"
  });
  if (typeof path !== "string") {
    return undefined;
  }

  return {
    bytes: await readFile(path),
    mime: imageMimeFromPath(path),
    name: fileNameFromPath(path),
    path
  };
}

/** 用户主动选择项目文件；调用方负责解析和校验其内容。 */
export async function chooseProjectFile(defaultPath?: string): Promise<string | undefined> {
  const path = await open({
    defaultPath,
    directory: false,
    filters: [PROJECT_FILTER],
    multiple: false,
    title: "打开 UnicodeArt 项目"
  });
  return typeof path === "string" ? path : undefined;
}

/** 由原生保存框选择目标位置，确保不会隐式写入外部路径。 */
export async function chooseProjectSavePath(defaultPath?: string): Promise<string | undefined> {
  return chooseSavePath("保存 UnicodeArt 项目", PROJECT_FILTER, "unicodeart-project.uaproj", defaultPath);
}

/** TXT/HTML 导出同样必须经过显式保存框。 */
export async function chooseExportSavePath(
  format: "html" | "txt",
  defaultPath?: string
): Promise<string | undefined> {
  const extension = format === "html" ? "html" : "txt";
  return chooseSavePath(
    `导出 ${format.toUpperCase()}`,
    { extensions: [extension], name: `${format.toUpperCase()} 文件` },
    `unicodeart.${extension}`,
    defaultPath
  );
}

/** 仅对已由保存框授权的路径写入文本。 */
export async function writeUserSelectedText(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

/** 仅对已由打开框授权的路径读取文本。 */
export async function readUserSelectedText(path: string): Promise<string> {
  return readTextFile(path);
}

/** 应用私有状态只保存草稿和最近项目路径，不保存外部文件授权。 */
export async function loadLocalWorkspaceState(): Promise<LocalWorkspaceState | undefined> {
  try {
    const raw = await readTextFile(WORKSPACE_STATE_FILE, { baseDir: BaseDirectory.AppLocalData });
    return parseLocalWorkspaceState(raw);
  } catch {
    return undefined;
  }
}

/** 写入应用私有目录，不对用户文件系统授予额外范围。 */
export async function saveLocalWorkspaceState(state: LocalWorkspaceState): Promise<void> {
  await writeTextFile(WORKSPACE_STATE_FILE, JSON.stringify(state), {
    baseDir: BaseDirectory.AppLocalData
  });
}

async function chooseSavePath(
  title: string,
  filter: { extensions: string[]; name: string },
  fallbackName: string,
  defaultPath?: string
): Promise<string | undefined> {
  return save({
    defaultPath: defaultPath ?? fallbackName,
    filters: [filter],
    title
  }).then((path) => (path ? ensureExtension(path, filter.extensions[0]) : undefined));
}

function imageMimeFromPath(path: string): ProjectImageMime {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "gif":
      return "image/gif";
    default:
      throw new Error("图片格式不受支持。请选择 PNG、JPEG、WebP、BMP 或 GIF。" );
  }
}

function fileNameFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop();
  return name || "input-image";
}

function ensureExtension(path: string, extension: string): string {
  return path.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? path
    : `${path}.${extension}`;
}

function parseLocalWorkspaceState(raw: string): LocalWorkspaceState | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const candidate = value as Record<string, unknown>;
    const draftText = typeof candidate.draftText === "string" ? candidate.draftText.slice(0, 2 * 1024 * 1024) : "";
    const recentProjectPaths = Array.isArray(candidate.recentProjectPaths)
      ? candidate.recentProjectPaths
        .filter((path): path is string => typeof path === "string" && path.length > 0 && path.length <= 32_768)
        .slice(0, 8)
      : [];

    return { draftText, recentProjectPaths };
  } catch {
    return undefined;
  }
}
