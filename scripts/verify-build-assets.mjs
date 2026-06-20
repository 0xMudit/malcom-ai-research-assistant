import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const distDir = process.argv[2] || ".next";
const staticPrefix = "/_next/static/";
const scannedExtensions = new Set([
  ".html",
  ".js",
  ".json",
  ".rsc",
  ".txt",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeAssetReference(reference) {
  const withoutQuery = reference.split("?")[0];

  if (withoutQuery.startsWith(staticPrefix)) {
    return withoutQuery.slice("/_next/".length);
  }

  if (withoutQuery.startsWith("static/")) {
    return withoutQuery;
  }

  return null;
}

function collectAssetReferences(content) {
  const references = new Set();
  const absolutePattern =
    /\/_next\/static\/[^"'`<>\s\\)]+?\.(?:css|js|avif|gif|ico|jpg|jpeg|png|svg|webp|woff2?)/g;
  const relativePattern =
    /(?<![\w/-])static\/(?:chunks|media)\/[^"'`<>\s\\)]+?\.(?:css|js|avif|gif|ico|jpg|jpeg|png|svg|webp|woff2?)/g;

  for (const match of content.matchAll(absolutePattern)) {
    references.add(match[0]);
  }

  for (const match of content.matchAll(relativePattern)) {
    references.add(match[0]);
  }

  return references;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "cache" || entry.name === "dev" || entry.name === "static") {
        continue;
      }

      files.push(...(await walk(fullPath)));
      continue;
    }

    if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

assert(existsSync(distDir), `${distDir} does not exist.`);
assert(
  existsSync(path.join(distDir, "BUILD_ID")),
  `${distDir} is missing BUILD_ID.`,
);
assert(
  existsSync(path.join(distDir, "required-server-files.json")),
  `${distDir} is missing required-server-files.json.`,
);

const files = await walk(distDir);
const missing = [];
const checked = new Set();

for (const file of files) {
  const content = await readFile(file, "utf8");

  for (const reference of collectAssetReferences(content)) {
    const normalized = normalizeAssetReference(reference);

    if (!normalized || checked.has(normalized)) {
      continue;
    }

    checked.add(normalized);

    if (!existsSync(path.join(distDir, normalized))) {
      missing.push(`${reference} referenced by ${path.relative(distDir, file)}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing build assets:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Verified ${checked.size} static build assets in ${distDir}.`);
