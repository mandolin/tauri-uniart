/**
 * UnicodeArt App 项目文件模型。
 *
 * 该模块保持为纯数据逻辑：不依赖 Tauri IPC，也不访问文件系统，便于在浏览器
 * WebView 与 Node 自动测试中使用同一套校验规则。
 */

export const PROJECT_SCHEMA_VERSION = 1;
export const MAX_PORTABLE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 14 * 1024 * 1024;

const APPLICATION_ID = "unicodeart-app";
const MAX_FONT_FAMILY_LENGTH = 512;
const MAX_PATH_LENGTH = 32_768;
const MAX_SOURCE_TEXT_LENGTH = 2 * 1024 * 1024;

export const PROJECT_CHARSETS = ["ASCII", "EXTENDED", "CHINESE_SIMPLE"] as const;
export const PROJECT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/gif"
] as const;

export type ProjectCharset = (typeof PROJECT_CHARSETS)[number];
export type ProjectImageMime = (typeof PROJECT_IMAGE_MIME_TYPES)[number];
export type ProjectMode = "text" | "image";

export interface ProjectConfig {
  charset: ProjectCharset;
  glyphFont: string;
  height: number;
  matrixSize: number;
  ratio: number;
  visualFont: string;
}

export interface TextProjectSource {
  kind: "text";
  text: string;
}

export interface LinkedImageProjectSource {
  kind: "image";
  mime: ProjectImageMime;
  name: string;
  path: string;
  storage: "linked";
}

export interface EmbeddedImageProjectSource {
  byteLength: number;
  dataBase64: string;
  kind: "image";
  mime: ProjectImageMime;
  name: string;
  storage: "embedded";
}

export type ProjectSource =
  | TextProjectSource
  | LinkedImageProjectSource
  | EmbeddedImageProjectSource;

export interface UnicodeArtProject {
  application: {
    id: typeof APPLICATION_ID;
    version: string;
  };
  config: ProjectConfig;
  mode: ProjectMode;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  source: ProjectSource;
}

/** 用于向界面返回可读、可本地化的项目格式错误。 */
export class ProjectValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

//region 项目构造

/** 创建只保存原始文字和配置的项目。 */
export function createTextProject(
  text: string,
  config: ProjectConfig,
  appVersion: string
): UnicodeArtProject {
  return validateProject({
    application: { id: APPLICATION_ID, version: appVersion },
    config,
    mode: "text",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source: { kind: "text", text }
  });
}

/** 创建引用本地图片路径的常规项目；打开后仍需用户重新授权该图片。 */
export function createLinkedImageProject(
  image: Omit<LinkedImageProjectSource, "kind" | "storage">,
  config: ProjectConfig,
  appVersion: string
): UnicodeArtProject {
  return validateProject({
    application: { id: APPLICATION_ID, version: appVersion },
    config,
    mode: "image",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source: { kind: "image", storage: "linked", ...image }
  });
}

/** 创建把图片字节显式嵌入的便携项目。 */
export function createEmbeddedImageProject(
  image: Omit<EmbeddedImageProjectSource, "byteLength" | "dataBase64" | "kind" | "storage">,
  bytes: Uint8Array,
  config: ProjectConfig,
  appVersion: string
): UnicodeArtProject {
  if (bytes.byteLength > MAX_PORTABLE_IMAGE_BYTES) {
    throw new ProjectValidationError("便携项目中的原始图片不能超过 10 MiB。");
  }

  return validateProject({
    application: { id: APPLICATION_ID, version: appVersion },
    config,
    mode: "image",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source: {
      byteLength: bytes.byteLength,
      dataBase64: bytesToBase64(bytes),
      kind: "image",
      storage: "embedded",
      ...image
    }
  });
}

//endregion

//region 序列化与解析

/** 序列化前重新校验，防止调用方绕过上层界面写出无效项目。 */
export function serializeProject(project: UnicodeArtProject): string {
  const normalized = validateProject(project);
  const serialized = JSON.stringify(normalized, null, 2);
  ensureProjectSize(serialized);
  return serialized;
}

/** 解析并严格验证 .uaproj 文件内容。 */
export function parseProject(serialized: string): UnicodeArtProject {
  ensureProjectSize(serialized);

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ProjectValidationError("项目文件不是有效的 JSON。" );
  }

  return validateProject(value);
}

/** 从已验证的嵌入源还原图片字节。 */
export function decodeEmbeddedImage(source: EmbeddedImageProjectSource): Uint8Array {
  const bytes = base64ToBytes(source.dataBase64);
  if (bytes.byteLength !== source.byteLength) {
    throw new ProjectValidationError("便携图片的字节长度与项目记录不一致。" );
  }

  return bytes;
}

/** 校验未知输入并返回去除多余属性后的规范化项目对象。 */
export function validateProject(value: unknown): UnicodeArtProject {
  const project = expectRecord(value, "项目根对象");
  ensureExactKeys(project, ["application", "config", "mode", "schemaVersion", "source"], "项目根对象");

  const schemaVersion = readInteger(project, "schemaVersion", 1, 1);
  if (schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectValidationError(`不支持项目格式版本 ${schemaVersion}。`);
  }

  const application = expectRecord(project.application, "application");
  ensureExactKeys(application, ["id", "version"], "application");
  if (readString(application, "id", 1, 64) !== APPLICATION_ID) {
    throw new ProjectValidationError("项目不属于 UnicodeArt App。" );
  }

  const mode = readEnum(project, "mode", ["text", "image"] as const);
  const source = validateSource(project.source, mode);

  return {
    application: {
      id: APPLICATION_ID,
      version: readString(application, "version", 1, 64)
    },
    config: validateConfig(project.config),
    mode,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source
  };
}

//endregion

//region 格式校验

function validateConfig(value: unknown): ProjectConfig {
  const config = expectRecord(value, "config");
  ensureExactKeys(
    config,
    ["charset", "glyphFont", "height", "matrixSize", "ratio", "visualFont"],
    "config"
  );

  return {
    charset: readEnum(config, "charset", PROJECT_CHARSETS),
    glyphFont: readString(config, "glyphFont", 1, MAX_FONT_FAMILY_LENGTH),
    height: readInteger(config, "height", 2, 240),
    matrixSize: readInteger(config, "matrixSize", 2, 20),
    ratio: readNumber(config, "ratio", 1, 3),
    visualFont: readString(config, "visualFont", 1, MAX_FONT_FAMILY_LENGTH)
  };
}

function validateSource(value: unknown, mode: ProjectMode): ProjectSource {
  const source = expectRecord(value, "source");
  const kind = readEnum(source, "kind", ["text", "image"] as const);
  if (kind !== mode) {
    throw new ProjectValidationError("项目模式与输入来源不一致。" );
  }

  if (kind === "text") {
    ensureExactKeys(source, ["kind", "text"], "文字来源");
    return { kind, text: readString(source, "text", 0, MAX_SOURCE_TEXT_LENGTH) };
  }

  const storage = readEnum(source, "storage", ["linked", "embedded"] as const);
  const common = {
    kind,
    mime: readEnum(source, "mime", PROJECT_IMAGE_MIME_TYPES),
    name: readString(source, "name", 1, 512),
    storage
  } as const;

  if (storage === "linked") {
    ensureExactKeys(source, ["kind", "mime", "name", "path", "storage"], "引用图片来源");
    return { ...common, path: readString(source, "path", 1, MAX_PATH_LENGTH), storage };
  }

  ensureExactKeys(
    source,
    ["byteLength", "dataBase64", "kind", "mime", "name", "storage"],
    "便携图片来源"
  );
  const byteLength = readInteger(source, "byteLength", 0, MAX_PORTABLE_IMAGE_BYTES);
  const dataBase64 = readString(source, "dataBase64", 0, maxBase64Length(MAX_PORTABLE_IMAGE_BYTES));
  const decoded = base64ToBytes(dataBase64);
  if (decoded.byteLength !== byteLength) {
    throw new ProjectValidationError("便携图片的字节长度与项目记录不一致。" );
  }

  return { ...common, byteLength, dataBase64, storage };
}

function ensureProjectSize(serialized: string): void {
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES) {
    throw new ProjectValidationError("完整项目文件不能超过 14 MiB。" );
  }
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectValidationError(`${label}必须是对象。`);
  }

  return value as Record<string, unknown>;
}

function ensureExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ProjectValidationError(`${label}包含不支持的属性 ${key}。`);
    }
  }

  for (const key of allowed) {
    if (!(key in value)) {
      throw new ProjectValidationError(`${label}缺少属性 ${key}。`);
    }
  }
}

function readString(value: Record<string, unknown>, key: string, minimum: number, maximum: number): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length < minimum || candidate.length > maximum) {
    throw new ProjectValidationError(`${key}必须是长度在 ${minimum} 到 ${maximum} 之间的字符串。`);
  }

  return candidate;
}

function readInteger(value: Record<string, unknown>, key: string, minimum: number, maximum: number): number {
  const candidate = value[key];
  if (
    typeof candidate !== "number"
    || !Number.isInteger(candidate)
    || candidate < minimum
    || candidate > maximum
  ) {
    throw new ProjectValidationError(`${key}必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }

  return candidate;
}

function readNumber(value: Record<string, unknown>, key: string, minimum: number, maximum: number): number {
  const candidate = value[key];
  if (
    typeof candidate !== "number"
    || !Number.isFinite(candidate)
    || candidate < minimum
    || candidate > maximum
  ) {
    throw new ProjectValidationError(`${key}必须是 ${minimum} 到 ${maximum} 之间的数字。`);
  }

  return candidate;
}

function readEnum<T extends string>(
  value: Record<string, unknown>,
  key: string,
  values: readonly T[]
): T {
  const candidate = value[key];
  if (typeof candidate !== "string" || !values.includes(candidate as T)) {
    throw new ProjectValidationError(`${key}包含不支持的值。`);
  }

  return candidate as T;
}

//endregion

//region Base64 工具

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = "";
    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
    chunks.push(binary);
  }

  return btoa(chunks.join(""));
}

function base64ToBytes(value: string): Uint8Array {
  if (value.length > maxBase64Length(MAX_PORTABLE_IMAGE_BYTES)) {
    throw new ProjectValidationError("便携图片的 Base64 数据超过允许大小。" );
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ProjectValidationError("便携图片包含无效的 Base64 数据。" );
  }

  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new ProjectValidationError("便携图片包含无效的 Base64 数据。" );
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function maxBase64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

//endregion
