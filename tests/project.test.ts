import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmbeddedImageProject,
  createTextProject,
  decodeEmbeddedImage,
  MAX_PORTABLE_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  parseProject,
  ProjectValidationError,
  serializeProject,
  type ProjectConfig
} from "../src/project";

const config: ProjectConfig = {
  charset: "ASCII",
  glyphFont: "Liberation Mono, monospace",
  height: 24,
  matrixSize: 6,
  ratio: 2,
  visualFont: "Noto Sans SC"
};

test("文字项目可序列化并完整还原", () => {
  const project = createTextProject("中文 UnicodeArt", config, "0.1.0");
  const restored = parseProject(serializeProject(project));

  assert.equal(restored.mode, "text");
  assert.equal(restored.source.kind, "text");
  assert.equal(restored.source.text, "中文 UnicodeArt");
  assert.deepEqual(restored.config, config);
});

test("便携图片项目可还原原始字节", () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const project = createEmbeddedImageProject(
    { mime: "image/png", name: "example.png" },
    bytes,
    config,
    "0.1.0"
  );
  const restored = parseProject(serializeProject(project));

  assert.equal(restored.source.kind, "image");
  assert.equal(restored.source.storage, "embedded");
  assert.deepEqual(decodeEmbeddedImage(restored.source), bytes);
});

test("便携图片严格限制在 10 MiB 内", () => {
  const tooLarge = new Uint8Array(MAX_PORTABLE_IMAGE_BYTES + 1);

  assert.throws(
    () => createEmbeddedImageProject({ mime: "image/png", name: "large.png" }, tooLarge, config, "0.1.0"),
    ProjectValidationError
  );
});

test("项目文本严格限制在 14 MiB 内", () => {
  const oversized = " ".repeat(MAX_PROJECT_BYTES + 1);

  assert.throws(() => parseProject(oversized), ProjectValidationError);
});

test("拒绝损坏的 Base64 与不一致字节长度", () => {
  const source = {
    byteLength: 999,
    dataBase64: "iVBORw0KGgo=",
    kind: "image",
    mime: "image/png",
    name: "bad.png",
    storage: "embedded"
  };
  const invalidProject = {
    application: { id: "unicodeart-app", version: "0.1.0" },
    config,
    mode: "image",
    schemaVersion: 1,
    source
  };

  assert.throws(() => parseProject(JSON.stringify(invalidProject)), ProjectValidationError);
});

test("拒绝未知项目格式版本和多余属性", () => {
  const project = createTextProject("test", config, "0.1.0");
  const futureVersion = { ...project, schemaVersion: 2 };
  const unknownProperty = { ...project, unexpected: true };

  assert.throws(() => parseProject(JSON.stringify(futureVersion)), ProjectValidationError);
  assert.throws(() => parseProject(JSON.stringify(unknownProperty)), ProjectValidationError);
});
