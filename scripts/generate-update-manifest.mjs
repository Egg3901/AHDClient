#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [artifact, signatureFile, output = "latest.json"] = process.argv.slice(2);
if (!artifact || !signatureFile) {
  throw new Error("usage: node scripts/generate-update-manifest.mjs <artifact-url> <signature-file> [output]");
}
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const escaped = version.replaceAll(".", "\\.");
const notes = changelog.match(
  new RegExp(`## \\[${escaped}\\](?:[^\\n]*)\\n\\n([\\s\\S]*?)(?=\\n## |$)`),
)?.[1]?.trim();
if (!notes) throw new Error(`CHANGELOG.md has no notes for ${version}`);

writeFileSync(
  output,
  `${JSON.stringify({
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        url: artifact,
        signature: readFileSync(signatureFile, "utf8").trim(),
      },
    },
  }, null, 2)}\n`,
);
