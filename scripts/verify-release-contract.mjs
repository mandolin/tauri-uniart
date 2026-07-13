/**
 * UnicodeArt App 发布契约检查。
 *
 * package.json 是 JavaScript 侧的版本事实来源；Cargo.toml、tauri.conf.json、两个 lockfile
 * 必须与它保持一致。此脚本不访问网络，适合本地和 CI 的可重复预检查。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonOutput = process.argv.includes("--json");
const failures = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function readCargoPackageVersion(text, sourceName) {
  const packageStart = text.indexOf("[package]");
  const nextSection = text.indexOf("\n[", packageStart + "[package]".length);
  const packageSection = packageStart >= 0
    ? text.slice(packageStart, nextSection >= 0 ? nextSection : undefined)
    : "";
  const version = packageSection.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];

  expect(Boolean(version), `${sourceName} 缺少 [package].version。`);
  return version;
}

function readLockedCargoPackageVersion(text, packageName) {
  const matcher = new RegExp(
    `\\[\\[package\\]\\]\\s*\\r?\\nname\\s*=\\s*"${packageName}"\\s*\\r?\\nversion\\s*=\\s*"([^"]+)"`,
    "m"
  );
  const version = text.match(matcher)?.[1];

  expect(Boolean(version), `Cargo.lock 缺少 ${packageName} 根包记录。`);
  return version;
}

function getExactCaretVersion(range) {
  const match = /^\^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range || "");
  return match?.[1];
}

function main() {
  const packageManifest = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const cargoManifest = readText("src-tauri/Cargo.toml");
  const cargoLock = readText("src-tauri/Cargo.lock");
  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  const applicationVersion = packageManifest.version;
  const coreRange = packageManifest.dependencies?.["unicode-art-js"];
  const lockedCore = packageLock.packages?.["node_modules/unicode-art-js"]?.version;
  const expectedCoreVersion = getExactCaretVersion(coreRange);

  expect(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(applicationVersion || ""), "package.json version 必须是明确的语义化版本。");
  expect(readCargoPackageVersion(cargoManifest, "Cargo.toml") === applicationVersion, "Cargo.toml version 必须与 package.json 一致。");
  expect(tauriConfig.version === applicationVersion, "tauri.conf.json version 必须与 package.json 一致。");
  expect(
    readLockedCargoPackageVersion(cargoLock, "tauri-uniart") === applicationVersion,
    "Cargo.lock 中的 tauri-uniart version 必须与 package.json 一致。"
  );
  expect(packageLock.lockfileVersion >= 2, "package-lock.json 必须是 npm lockfile v2 或更高版本。");
  expect(Boolean(expectedCoreVersion), "unicode-art-js 必须使用明确的 ^x.y.z Core 版本范围。");
  expect(coreRange === `^${expectedCoreVersion}`, "unicode-art-js 必须使用明确的 ^x.y.z Core 版本范围。");
  expect(lockedCore === expectedCoreVersion, "package-lock.json 解析的 unicode-art-js 必须与声明的 Core 基线一致。");
  expect(
    packageLock.packages?.[""]?.dependencies?.["unicode-art-js"] === coreRange,
    "package-lock.json 根依赖必须与 package.json 的 unicode-art-js 范围一致。"
  );
  expect(tauriConfig.bundle?.active === false, "P2.5.2 仅允许无安装器候选构建，bundle.active 必须保持 false。");

  const result = {
    application: "UnicodeArt App",
    applicationVersion,
    coreRange,
    lockedCoreVersion: lockedCore,
    passed: failures.length === 0
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.passed) {
    console.log(`发布契约通过：UnicodeArt App ${applicationVersion} -> unicode-art-js ${coreRange}（锁定 ${lockedCore}）。`);
  }

  if (!result.passed) {
    if (!jsonOutput) {
      console.error("发布契约失败：");
      failures.forEach((message) => console.error(`- ${message}`));
    }
    process.exitCode = 1;
  }
}

main();
