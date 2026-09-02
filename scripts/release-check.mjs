import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

const rootPackage = json("package.json");
const desktopPackage = json("apps/desktop/package.json");
const packageLock = json("package-lock.json");
const tauriConfig = json("apps/desktop/src-tauri/tauri.conf.json");
const cargoManifest = read("apps/desktop/src-tauri/Cargo.toml");
const cargoLock = read("apps/desktop/src-tauri/Cargo.lock");
const changelog = read("CHANGELOG.md");

const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname = "rotunda-desktop"\nversion = "([^"]+)"/)?.[1];
const expected = rootPackage.version;
const versions = {
  "root package": rootPackage.version,
  "desktop package": desktopPackage.version,
  "package lock root": packageLock.version,
  "package lock workspace root": packageLock.packages?.[""]?.version,
  "package lock desktop": packageLock.packages?.["apps/desktop"]?.version,
  "Tauri config": tauriConfig.version,
  "Rust crate": cargoVersion,
  "Cargo lock crate": cargoLockVersion,
};

const errors = [];
for (const [surface, version] of Object.entries(versions)) {
  if (version !== expected) errors.push(`${surface} is ${version ?? "missing"}; expected ${expected}`);
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected)) {
  errors.push(`root package version is not release-shaped: ${expected}`);
}
if (!changelog.includes(`## [${expected}]`)) {
  errors.push(`CHANGELOG.md has no ## [${expected}] section`);
}
if (tauriConfig.identifier !== "net.lakesidegames.rotunda") {
  errors.push(`unexpected application identifier: ${tauriConfig.identifier}`);
}
if (tauriConfig.productName !== "A House Divided") {
  errors.push(`unexpected product name: ${tauriConfig.productName}`);
}

if (errors.length > 0) {
  console.error("Release check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release metadata is synchronized at ${expected}.`);
}
