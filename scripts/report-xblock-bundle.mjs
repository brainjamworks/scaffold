import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, "adapters/xblock/scaffold_xblock/public");

if (!existsSync(PUBLIC_DIR)) {
  console.error(`XBlock public directory not found: ${PUBLIC_DIR}`);
  console.error("Run: pnpm --filter @scaffold/adapter-xblock build");
  process.exit(1);
}

const assets = [];
walk(PUBLIC_DIR, (file) => {
  const buffer = readFileSync(file);
  assets.push({
    file: relative(PUBLIC_DIR, file),
    rawBytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer).byteLength,
  });
});

assets.sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file));

const totals = assets.reduce(
  (sum, asset) => ({
    rawBytes: sum.rawBytes + asset.rawBytes,
    gzipBytes: sum.gzipBytes + asset.gzipBytes,
  }),
  { rawBytes: 0, gzipBytes: 0 },
);

console.log("XBlock bundle assets");
console.log(`Directory: ${relative(ROOT, PUBLIC_DIR)}`);
console.log("");
console.log("| Asset | Raw | Gzip |");
console.log("|---|---:|---:|");
for (const asset of assets) {
  console.log(
    `| ${asset.file} | ${formatBytes(asset.rawBytes)} | ${formatBytes(asset.gzipBytes)} |`,
  );
}
console.log(
  `| **Total** | **${formatBytes(totals.rawBytes)}** | **${formatBytes(totals.gzipBytes)}** |`,
);

const studentInitial = collectStaticJsGraph("student-ui.js");
const studioInitial = collectStaticJsGraph("studio-ui.js");
const lazyFromStudent = collectDynamicJsImports(studentInitial.files);
const lazyFromStudio = collectDynamicJsImports(studioInitial.files);
const cssAssets = assets.filter((asset) => asset.file.endsWith(".css"));
const workerAssets = assets.filter((asset) => asset.file.includes("worker"));

console.log("");
console.log("XBlock load groups");
console.log("");
console.log("| Group | Files | Raw | Gzip |");
console.log("|---|---:|---:|---:|");
printGroup("Student initial JS", studentInitial.files, studentInitial);
printGroup("Studio initial JS", studioInitial.files, studioInitial);
printGroup(
  "Shared CSS asset(s)",
  cssAssets.map((asset) => asset.file),
  sumAssets(cssAssets),
);
printGroup(
  "Student lazy JS reachable from initial graph",
  [...lazyFromStudent],
  sumAssetFiles(lazyFromStudent),
);
printGroup(
  "Studio lazy JS reachable from initial graph",
  [...lazyFromStudio],
  sumAssetFiles(lazyFromStudio),
);
printGroup(
  "Worker asset(s)",
  workerAssets.map((asset) => asset.file),
  sumAssets(workerAssets),
);

function walk(path, visit) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), visit);
    }
    return;
  }

  if (stats.isFile()) visit(path);
}

function collectStaticJsGraph(entryFile) {
  const files = new Set();
  const pending = [entryFile];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || files.has(file) || !file.endsWith(".js")) continue;
    const fullPath = join(PUBLIC_DIR, file);
    if (!existsSync(fullPath)) continue;

    files.add(file);
    for (const imported of readStaticLocalJsImports(file)) {
      if (!files.has(imported)) pending.push(imported);
    }
  }

  return {
    ...sumAssetFiles(files),
    files: [...files].sort(),
  };
}

function readStaticLocalJsImports(file) {
  const source = readFileSync(join(PUBLIC_DIR, file), "utf8");
  const imports = new Set();
  const sideEffectImportRe = /import\s*["'](\.[^"']+\.js)["']/g;
  const fromImportRe = /from\s*["'](\.[^"']+\.js)["']/g;
  for (const match of source.matchAll(sideEffectImportRe)) {
    imports.add(resolvePublicAsset(file, match[1]));
  }
  for (const match of source.matchAll(fromImportRe)) {
    imports.add(resolvePublicAsset(file, match[1]));
  }
  return imports;
}

function collectDynamicJsImports(files) {
  const initialFiles = new Set(files);
  const imports = new Set();
  for (const file of files) {
    const source = readFileSync(join(PUBLIC_DIR, file), "utf8");
    const importRe = /import\(["'`](\.[^"'`]+\.js)["'`]\)/g;
    for (const match of source.matchAll(importRe)) {
      addNonInitialImport(imports, initialFiles, file, match[1]);
    }

    const vitePreloadDepsRe = /m\.f\|\|\(m\.f=\[([^\]]*)\]\)/g;
    for (const depsMatch of source.matchAll(vitePreloadDepsRe)) {
      const depsSource = depsMatch[1];
      const depRe = /["'`](\.[^"'`]+\.js)["'`]/g;
      for (const depMatch of depsSource.matchAll(depRe)) {
        addNonInitialImport(imports, initialFiles, file, depMatch[1]);
      }
    }
  }
  return imports;
}

function addNonInitialImport(imports, initialFiles, fromFile, importPath) {
  const resolved = resolvePublicAsset(fromFile, importPath);
  if (!initialFiles.has(resolved)) imports.add(resolved);
}

function resolvePublicAsset(fromFile, importPath) {
  return normalize(join(dirname(fromFile), importPath)).replaceAll("\\", "/");
}

function sumAssetFiles(files) {
  const wanted = new Set(files);
  return sumAssets(assets.filter((asset) => wanted.has(asset.file)));
}

function sumAssets(groupAssets) {
  return groupAssets.reduce(
    (sum, asset) => ({
      rawBytes: sum.rawBytes + asset.rawBytes,
      gzipBytes: sum.gzipBytes + asset.gzipBytes,
    }),
    { rawBytes: 0, gzipBytes: 0 },
  );
}

function printGroup(label, files, size) {
  console.log(
    `| ${label} | ${files.length} | ${formatBytes(size.rawBytes)} | ${formatBytes(size.gzipBytes)} |`,
  );
}

function formatBytes(bytes) {
  const mib = bytes / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(2)} KiB`;
}
